import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { api } from "../api";
import { AlertRow, AlertMessage, AlertType, PatrolVehicle, Crime, PatrolZone, Venue } from "../types";
import { LogOut, Map, AlertTriangle, FileText, X, CheckCircle2, Clock, Sun, Moon } from "lucide-react";
import MapComponent from "../components/Map";

const ALERT_TYPES: { value: AlertType; label: string; icon: string }[] = [
  { value: "sos",        label: "SOS",          icon: "🆘" },
  { value: "harassment", label: "Harassment",   icon: "⚠️" },
  { value: "suspicious", label: "Suspicious",   icon: "👀" },
  { value: "medical",    label: "Medical",      icon: "🏥" },
  { value: "other",      label: "Other",        icon: "📢" },
];

const REPORT_TYPES = [
  "Suspicious Activity",
  "Child Safety",
  "Harassment",
  "Domestic Violence",
  "Other",
];

const CONTACTS = [
  { label: "SSF",  tel: "tel:9445800100", icon: "🛡️", sub: "Control Room" },
  { label: "181",  tel: "tel:181",        icon: "👩", sub: "Women Help" },
  { label: "1098", tel: "tel:1098",       icon: "👶", sub: "Child Help" },
  { label: "100",  tel: "tel:100",        icon: "🚔", sub: "Police" },
];

const STATUS_STYLE: Record<string, string> = {
  pending:      "bg-amber-100 text-amber-700",
  acknowledged: "bg-blue-100 text-blue-700",
  dispatched:   "bg-green-100 text-green-700",
  resolved:     "bg-surface-L3 text-text-secondary",
  cancelled:    "bg-surface-L3 text-text-muted",
};

function relTime(iso: string) {
  // SQLite datetime('now') returns UTC without 'Z'; append it so the browser
  // parses as UTC instead of local time (avoids a 5.5-hour gap for IST users).
  const utc = iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(utc).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const OFFICER_NAMES: Record<number, string> = { 1: "SI Priya", 2: "SI Murugan", 3: "SI Kavitha", 4: "SI Rajan" };

type Tab = "home" | "report" | "alerts";
type SOSFlowState = "idle" | "sheet" | "sending" | "sent" | "acknowledged" | "dispatched" | "resolved";

export default function CitizenDashboard() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [activeAlert, setActiveAlert] = useState<AlertRow | null>(null);

  // SOS flow state
  const [sosFlow, setSosFlow] = useState<SOSFlowState>("idle");
  const [alertType, setAlertType] = useState<AlertType>("sos");
  const [description, setDescription] = useState("");
  const [dispatchInfo, setDispatchInfo] = useState<{ officerName: string; vehicleId: number; etaMinutes: number } | null>(null);

  // Map data
  const [vehicles, setVehicles] = useState<PatrolVehicle[]>([]);
  const [crimes, setCrimes] = useState<Crime[]>([]);
  const [hotspots, setHotspots] = useState<PatrolZone[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [mapLoading, setMapLoading] = useState(true);

  // Report form
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [reportPlace, setReportPlace] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<number | null>(null);

  // Alert messages (officer ↔ citizen chat)
  const [alertMessages, setAlertMessages] = useState<AlertMessage[]>([]);

  // ── Load map data once ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.crimes().catch(() => ({ crimes: [] })),
      api.hotspots().catch(() => ({ hotspots: [] })),
      api.venues().catch(() => ({ venues: [] })),
    ]).then(([c, h, v]) => {
      setCrimes(c.crimes);
      setHotspots(h.hotspots);
      setVenues(v.venues);
      setMapLoading(false);
    });
  }, []);

  // ── Poll vehicles every 10s ──────────────────────────────────────────────
  useEffect(() => {
    const fetchVehicles = () => api.vehicles().then((r) => setVehicles(r.vehicles)).catch(() => {});
    fetchVehicles();
    const id = setInterval(fetchVehicles, 10000);
    return () => clearInterval(id);
  }, []);

  // ── Poll messages for active alert every 5s ─────────────────────────────
  useEffect(() => {
    if (!activeAlert?.id || !user?.token) { setAlertMessages([]); return; }
    const poll = () => api.getAlertMessages(user.token, activeAlert.id).then(d => setAlertMessages(d.messages ?? [])).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [activeAlert?.id, user?.token]);

  // ── Poll my alerts every 3s ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.token) return;
    const poll = async () => {
      try {
        const res = await api.myAlerts(user.token);
        setAlerts(res.alerts);
        // Always track the most recent alert (API returns DESC by created_at)
        const latest: AlertRow | null = res.alerts[0] ?? null;
        setActiveAlert(latest);

        // Don't auto-transition from old alerts while in pre-send states.
        // Only update sosFlow once we're already tracking an active alert (sosFlow === "sent" or later).
        if (["idle", "sheet", "sending"].includes(sosFlow)) return;

        if (!latest || latest.status === "cancelled") {
          setSosFlow("idle");
          setDispatchInfo(null);
        } else if (latest.status === "acknowledged" && sosFlow === "sent") {
          setSosFlow("acknowledged");
        } else if (latest.status === "dispatched" && ["sent", "acknowledged"].includes(sosFlow)) {
          const vid = latest.dispatched_vehicle_id ?? 1;
          setSosFlow("dispatched");
          setDispatchInfo({
            officerName: OFFICER_NAMES[vid] ?? `Officer ${vid}`,
            vehicleId: vid,
            etaMinutes: latest.eta_minutes ?? 5,
          });
        } else if (latest.status === "on_scene" && ["sent", "acknowledged", "dispatched"].includes(sosFlow)) {
          setSosFlow("dispatched"); // keep dispatched card visible, patrol has arrived
        } else if (latest.status === "resolved" && ["sent", "acknowledged", "dispatched"].includes(sosFlow)) {
          setSosFlow("resolved");
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [user?.token, sosFlow]);

  // ── Send alert ───────────────────────────────────────────────────────────
  const handleSendAlert = useCallback(async () => {
    if (!user?.token) return;
    setSosFlow("sending");
    let lat = 12.93, lng = 80.14;
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => { lat = p.coords.latitude; lng = p.coords.longitude; resolve(); },
        () => resolve(),
        { timeout: 4000 },
      );
    });
    try {
      const res = await api.createAlert(user.token, {
        alert_type: alertType,
        lat, lng,
        description: description.trim() || undefined,
      });
      setActiveAlert(res.alert);
      setAlerts((prev) => [res.alert, ...prev]);
      setDescription("");
      setSosFlow("sent");
    } catch {
      setSosFlow("idle");
    }
  }, [user?.token, alertType, description]);

  const handleCancelAlert = useCallback(async () => {
    if (activeAlert && user?.token) {
      try { await api.cancelAlert(user.token, activeAlert.id); } catch { /* ignore */ }
    }
    setSosFlow("idle");
    setDispatchInfo(null);
    setActiveAlert(null);
  }, [activeAlert, user?.token]);

  // ── Report submit ────────────────────────────────────────────────────────
  const handleReportSubmit = async () => {
    if (!user?.token) return;
    setReportSubmitting(true);
    try {
      const res = await api.createReport(user.token, {
        report_type: "csr",
        crime_head: reportType,
        description: reportDesc.trim() || undefined,
        place: reportPlace.trim() || undefined,
      });
      setReportSuccess(res.report.id);
      setReportType(REPORT_TYPES[0]);
      setReportPlace("");
      setReportDesc("");
    } finally {
      setReportSubmitting(false);
    }
  };

  // ── Citizen preset messages ──────────────────────────────────────────────
  const [sendingPreset, setSendingPreset] = useState(false);
  const sendCitizenPreset = useCallback(async (body: string) => {
    if (!activeAlert || !user?.token || sendingPreset) return;
    setSendingPreset(true);
    try {
      await api.sendCitizenMessage(user.token, activeAlert.id, body);
    } catch { /* ignore */ }
    finally { setSendingPreset(false); }
  }, [activeAlert, user?.token, sendingPreset]);

  // ── SOS sheet content ────────────────────────────────────────────────────
  const isSheetOpen = sosFlow === "sheet";

  return (
    <div className="h-screen w-full overflow-hidden bg-bg-dark relative flex flex-col">

      {/* ── Header ── */}
      <div className="relative z-20 pt-safe px-4 py-3 flex items-center justify-between shrink-0 bg-surface-L1/90 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-black text-text-primary tracking-wide leading-none">Singapenne</p>
            <p className="text-[10px] text-text-muted leading-none mt-0.5">{user?.full_name ?? "Citizen"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-9 h-9 rounded-full bg-surface-L2 flex items-center justify-center text-text-muted hover:text-text-primary active:scale-95 transition"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={logout}
            className="w-9 h-9 rounded-full bg-surface-L2 flex items-center justify-center text-text-muted hover:text-text-primary active:scale-95 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden relative">

        {/* HOME TAB */}
        {activeTab === "home" && (
          <div className="absolute inset-0 flex flex-col">
            {/* Map — isolate creates a stacking context so Map's z-[1000] controls
                don't leak above the SOS sheet/banners in the parent context */}
            <div className="flex-1 min-h-0 isolate">
              <MapComponent
                crimes={crimes}
                hotspots={hotspots}
                vehicles={vehicles}
                venues={venues}
                isLoading={mapLoading}
                activeAlerts={activeAlert ? [activeAlert] : []}
                selectedAlertId={activeAlert?.id ?? null}
                hideCrimes={true}
                venueZoomThreshold={0}
              />
            </div>

            {/* SENDING — spinner overlay */}
            {sosFlow === "sending" && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-L1/50 backdrop-blur-sm">
                <div className="bg-surface-L1 rounded-2xl px-8 py-6 shadow-xl flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-text-secondary">Sending alert…</p>
                </div>
              </div>
            )}

            {/* SENT / PENDING — top banner */}
            {sosFlow === "sent" && (
              <div className="absolute top-0 left-0 right-0 z-20 mx-4 mt-3">
                <div className="bg-amber-500 text-white rounded-2xl px-4 py-3 flex items-center gap-2.5 shadow-lg">
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
                  <div>
                    <p className="text-sm font-bold leading-tight">Alert sent — Police notified</p>
                    <p className="text-xs text-amber-100 mt-0.5">Connecting to the nearest Police Patrol Vehicle…</p>
                  </div>
                </div>
              </div>
            )}

            {/* ACKNOWLEDGED — top banner */}
            {sosFlow === "acknowledged" && (
              <div className="absolute top-0 left-0 right-0 z-20 mx-4 mt-3">
                <div className="bg-blue-600 text-white rounded-2xl px-4 py-3 flex items-center gap-2.5 shadow-lg">
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
                  <div>
                    <p className="text-sm font-bold leading-tight">Police are reviewing your alert</p>
                    <p className="text-xs text-blue-200 mt-0.5">A Police Patrol Vehicle is being assigned to your location…</p>
                  </div>
                </div>
              </div>
            )}

            {/* DISPATCHED — center card */}
            {sosFlow === "dispatched" && dispatchInfo && (
              <div className="absolute inset-0 z-20 flex items-end justify-center pb-24 px-5 pointer-events-none">
                <div className="w-full max-w-sm bg-surface-L1 rounded-3xl shadow-2xl overflow-hidden pointer-events-auto"
                  style={{ boxShadow: "0 8px 40px rgba(22,163,74,0.25)" }}>
                  {/* Green header */}
                  <div className="bg-green-600 px-5 py-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                      <span className="text-white font-black text-base">Police is on the way</span>
                    </div>
                    <p className="text-green-200 text-xs">{dispatchInfo.officerName} · Police Patrol Vehicle {dispatchInfo.vehicleId} has been assigned to your alert</p>
                  </div>
                  {/* ETA */}
                  <div className="px-5 py-4">
                    <div className="bg-green-50 rounded-2xl px-4 py-3 text-center mb-4">
                      <p className="text-4xl font-black text-green-700 tabular-nums">{dispatchInfo.etaMinutes}</p>
                      <p className="text-green-600 text-sm font-semibold">minutes away</p>
                    </div>
                    <div className="flex items-center gap-2 text-text-muted text-xs bg-surface-L2 rounded-xl px-3 py-2">
                      <span className="text-base">📍</span>
                      <span>Your exact location has been shared with the officer</span>
                    </div>
                    {alertMessages.filter(m => (m as any).sender_role !== "citizen").length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Updates from Officer</p>
                        {alertMessages.filter(m => (m as any).sender_role !== "citizen").map(m => (
                          <div key={m.id} className="bg-surface-L2 rounded-xl px-3 py-2 text-sm text-text-primary flex justify-between items-start gap-2">
                            <span>{m.body}</span>
                            <span className="text-[10px] text-text-muted shrink-0">{relTime(m.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="border-t border-border pt-3 mt-2">
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">
                        Send Update to Officer
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {["I'm in trouble","I'm being harassed","I'm injured","I need immediate help",
                          "I cannot speak","Please hurry","I'm hiding","I'm safe — still need help"
                        ].map(msg => (
                          <button key={msg} onClick={() => sendCitizenPreset(msg)} disabled={sendingPreset}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-full
                                       bg-green-500/15 border border-green-500/30 text-green-300
                                       hover:bg-green-500/25 transition disabled:opacity-40 active:scale-95">
                            {msg}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border px-5 py-3">
                    <button onClick={handleCancelAlert}
                      className="w-full text-sm text-text-muted hover:text-text-secondary py-1 transition-colors">
                      I'm safe now — cancel alert
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* RESOLVED — "Police Reached" full overlay */}
            {sosFlow === "resolved" && (
              <div className="absolute inset-0 z-20 flex items-center justify-center px-5 bg-green-50/80 backdrop-blur-sm">
                <div className="w-full max-w-sm bg-surface-L1 rounded-3xl shadow-2xl overflow-hidden text-center"
                  style={{ boxShadow: "0 8px 40px rgba(22,163,74,0.3)" }}>
                  <div className="bg-green-600 px-5 py-6">
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-9 h-9 text-white" />
                    </div>
                    <p className="text-white font-black text-xl">Police have arrived</p>
                    <p className="text-green-200 text-sm mt-1">You are safe now</p>
                  </div>
                  <div className="px-5 py-5 space-y-3">
                    <div className="bg-green-50 rounded-2xl px-4 py-3">
                      <p className="text-text-secondary text-sm">The officer has marked your alert as resolved. If you need further help, raise a new alert or call directly.</p>
                    </div>
                    <button
                      onClick={() => { setSosFlow("idle"); setActiveAlert(null); setDispatchInfo(null); }}
                      className="w-full py-3.5 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-sm active:scale-95 transition"
                    >
                      Close — Stay Safe 🙏
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SOS button — only visible in idle/sent/acknowledged states */}
            {(sosFlow === "idle" || sosFlow === "sent" || sosFlow === "acknowledged") && (
              <div className="absolute bottom-6 left-0 right-0 z-10 flex flex-col items-center gap-2">
                <button
                  onClick={() => setSosFlow("sheet")}
                  className="relative w-28 h-28 rounded-full bg-red-600 select-none active:scale-95 transition-transform focus:outline-none"
                  style={{ boxShadow: "0 0 0 14px rgba(220,38,38,0.12), 0 0 0 28px rgba(220,38,38,0.06)" }}
                  aria-label="SOS Emergency Alert"
                >
                  <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20 pointer-events-none" />
                  <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
                    <AlertTriangle className="w-8 h-8 text-white" fill="white" />
                    <span className="text-white font-black text-lg tracking-widest">SOS</span>
                  </div>
                </button>
                <p className="text-xs text-text-secondary bg-surface-L1/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm font-medium">
                  Tap for emergency help
                </p>
              </div>
            )}
          </div>
        )}

        {/* REPORT TAB */}
        {activeTab === "report" && (
          <div className="absolute inset-0 overflow-y-auto bg-surface-L2 p-4">
            <div className="max-w-sm mx-auto">
              <div className="mb-5">
                <h2 className="text-base font-bold text-text-primary">Report an Incident</h2>
                <p className="text-xs text-text-muted mt-0.5">For non-emergency reports. Police will be notified.</p>
              </div>

              {reportSuccess ? (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
                  <p className="font-bold text-green-900">Report Submitted</p>
                  <p className="text-sm text-green-700">Report #{reportSuccess} — Police have been notified.</p>
                  <button
                    onClick={() => setReportSuccess(null)}
                    className="mt-2 text-xs text-green-600 underline"
                  >
                    Submit another report
                  </button>
                </div>
              ) : (
                <div className="bg-surface-L1 rounded-2xl border border-border p-4 space-y-4 shadow-sm">
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Incident Type</label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-surface-L2 border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-red-300"
                    >
                      {REPORT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Location / Landmark</label>
                    <input
                      type="text"
                      value={reportPlace}
                      onChange={(e) => setReportPlace(e.target.value)}
                      placeholder="e.g. Near Vandalur Zoo bus stop"
                      className="w-full px-3 py-2.5 bg-surface-L2 border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Description <span className="normal-case font-normal text-text-muted">(optional)</span></label>
                    <textarea
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      placeholder="Describe what you witnessed…"
                      rows={3}
                      maxLength={300}
                      className="w-full px-3 py-2.5 bg-surface-L2 border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                    />
                  </div>

                  <button
                    onClick={handleReportSubmit}
                    disabled={reportSubmitting || !reportPlace.trim()}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition active:scale-95"
                  >
                    {reportSubmitting ? "Submitting…" : "Submit Report"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ALERTS TAB */}
        {activeTab === "alerts" && (
          <div className="absolute inset-0 overflow-y-auto bg-surface-L2 p-4">
            <div className="max-w-sm mx-auto">
              <h2 className="text-base font-bold text-text-primary mb-4">My Alerts</h2>
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-10 h-10 text-text-muted opacity-40 mx-auto mb-2" />
                  <p className="text-sm text-text-muted">No alerts yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center gap-3 p-3 bg-surface-L1 rounded-xl border border-border shadow-sm">
                      <span className="text-xl">{ALERT_TYPES.find((t) => t.value === alert.alert_type)?.icon ?? "📢"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary capitalize">{alert.alert_type}</p>
                        {alert.description && <p className="text-xs text-text-muted truncate">{alert.description}</p>}
                        <p className="text-[11px] text-text-muted">{relTime(alert.created_at)}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[alert.status] ?? ""}`}>
                        {alert.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom tab bar ── */}
      <div className="relative z-20 bg-surface-L1 border-t border-border pb-safe shrink-0">
        <div className="grid grid-cols-3">
          {([
            { id: "home",   label: "Home",    icon: <Map className="w-5 h-5" /> },
            { id: "report", label: "Report",  icon: <FileText className="w-5 h-5" /> },
            { id: "alerts", label: "Alerts",  icon: <AlertTriangle className="w-5 h-5" />, badge: alerts.filter((a) => !["resolved", "cancelled"].includes(a.status)).length },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center py-3 gap-0.5 relative transition ${
                activeTab === tab.id ? "text-red-600" : "text-text-muted"
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-semibold">{tab.label}</span>
              {"badge" in tab && tab.badge > 0 && (
                <span className="absolute top-2 right-1/4 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── SOS Classification Bottom Sheet ── */}
      {isSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setSosFlow("idle")}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 z-40 bg-surface-L1 rounded-t-3xl shadow-2xl pb-safe">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-surface-L3" />
            </div>

            <div className="px-5 pb-5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-text-primary">Select Alert Type</h3>
                <button onClick={() => setSosFlow("idle")} className="w-8 h-8 rounded-full bg-surface-L2 flex items-center justify-center active:scale-95">
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>

              {/* Classification chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {ALERT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setAlertType(t.value)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border font-semibold text-sm transition active:scale-95
                      ${alertType === t.value
                        ? "bg-red-50 border-red-500 text-red-700 shadow-sm"
                        : "bg-surface-L2 border-border text-text-secondary"
                      }`}
                  >
                    <span className="text-base leading-none">{t.icon}</span>
                    <span className="text-xs font-semibold">{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Optional description */}
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what's happening (optional)"
                maxLength={120}
                className="w-full px-4 py-2.5 bg-surface-L2 border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              />

              {/* Quick-call strip */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {CONTACTS.map((c) => (
                  <a
                    key={c.tel}
                    href={c.tel}
                    className="flex flex-col items-center py-2 bg-surface-L2 rounded-xl border border-border active:bg-surface-L3 transition gap-0.5"
                  >
                    <span className="text-lg leading-none">{c.icon}</span>
                    <span className="text-[10px] font-bold text-text-secondary">{c.label}</span>
                    <span className="text-[9px] text-text-muted leading-none">{c.sub}</span>
                  </a>
                ))}
              </div>

              {/* Send CTA */}
              <button
                onClick={handleSendAlert}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black text-base rounded-2xl active:scale-95 transition shadow-lg"
                style={{ boxShadow: "0 4px 20px rgba(220,38,38,0.3)" }}
              >
                SEND ALERT NOW
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
