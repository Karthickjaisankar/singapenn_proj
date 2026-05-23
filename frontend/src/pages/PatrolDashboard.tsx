import { useState, useRef, useEffect, useCallback } from "react";
import {
  LogOut, MapPin, Phone, MessageCircle, CheckCircle, Send,
  Wifi, WifiOff, Clock, FileText, Navigation, Shield,
  AlertTriangle, User, ChevronRight, CheckCheck, ChevronDown, X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePatrolAlerts } from "../hooks/usePatrolAlerts";
import { api } from "../api";
import { AlertMessage, Crime, PatrolZone, PatrolVehicle, Venue, AlertRow } from "../types";
import MapComponent from "../components/Map";

// ── constants ──────────────────────────────────────────────────────────────


const ZONE_NAMES: Record<number, string> = {
  1: "Tambaram", 2: "Pallavaram", 3: "Vandalur", 4: "Semmenchery",
};
const VEHICLE_COLORS: Record<number, string> = {
  1: "#3b82f6", 2: "#10b981", 3: "#a855f7", 4: "#f59e0b",
};
const QUICK_REPLIES = [
  "On my way — ETA 5 min",
  "Please stay where you are",
  "I am nearby — stay calm",
  "I can see you",
  "Situation under control",
];
const TYPE_LABEL: Record<string, string> = {
  sos: "SOS EMERGENCY", harassment: "Harassment",
  suspicious: "Suspicious Activity", medical: "Medical Emergency", other: "Other",
};
const TYPE_COLOR: Record<string, string> = {
  sos: "text-red-400 bg-red-500/15 border-red-500/40",
  harassment: "text-amber-400 bg-amber-500/15 border-amber-500/40",
  suspicious: "text-blue-400 bg-blue-500/15 border-blue-500/40",
  medical: "text-green-400 bg-green-500/15 border-green-500/40",
  other: "text-slate-400 bg-slate-500/15 border-slate-500/40",
};

// Simulated queued (incoming) complaints per vehicle — shown when no real dispatch is active
const DEMO_QUEUE: Record<number, { id: number; alert_type: string; citizen_name: string; description: string; lat: number; lng: number; eta_minutes: number; created_at: string; citizen_phone: string }[]> = {
  1: [
    { id: -101, alert_type: "harassment",  citizen_name: "Anita Krishnan",   description: "Man following me near bus stand. I'm scared.",       lat: 12.9312, lng: 80.1489, eta_minutes: 4, created_at: new Date(Date.now()-8*60000).toISOString(), citizen_phone: "9841000011" },
    { id: -102, alert_type: "harassment",  citizen_name: "Meena Selvam",     description: "Group of men harassing me outside college gate.",     lat: 12.9358, lng: 80.1531, eta_minutes: 7, created_at: new Date(Date.now()-3*60000).toISOString(), citizen_phone: "9841000012" },
  ],
  2: [
    { id: -103, alert_type: "sos",         citizen_name: "Deepa Venkatesh",  description: "Someone trying to force me into a vehicle — help!",  lat: 12.9671, lng: 80.1602, eta_minutes: 5, created_at: new Date(Date.now()-5*60000).toISOString(), citizen_phone: "9841000013" },
  ],
  3: [
    { id: -104, alert_type: "harassment",  citizen_name: "Priya Rajan",      description: "Husband threatening me. Please come immediately.",   lat: 12.9299, lng: 80.1477, eta_minutes: 6, created_at: new Date(Date.now()-11*60000).toISOString(), citizen_phone: "9841000014" },
    { id: -105, alert_type: "sos",         citizen_name: "Kavitha Nair",     description: "I was attacked and injured. Need help urgently.",    lat: 12.9321, lng: 80.1408, eta_minutes: 9, created_at: new Date(Date.now()-2*60000).toISOString(), citizen_phone: "9841000015" },
  ],
  4: [
    { id: -106, alert_type: "sos",         citizen_name: "Selvi Pandian",    description: "SOS — someone tried to grab me near the market.",    lat: 12.9347, lng: 80.2134, eta_minutes: 3, created_at: new Date(Date.now()-6*60000).toISOString(), citizen_phone: "9841000016" },
  ],
};

// Simulated past complaints per patrol vehicle today
const PAST_COMPLAINTS: Record<number, {
  id: string; type: string; citizen: string; area: string;
  time: string; outcome: "DSR" | "CSR"; notes: string;
}[]> = {
  1: [
    { id: "A-201", type: "harassment",  citizen: "Anita Krishnan",   area: "Vandalur Junction",    time: "08:45 am", outcome: "DSR", notes: "Man warned and dispersed. Victim safe. No FIR filed at victim's request." },
    { id: "A-204", type: "sos",         citizen: "Meena Selvam",     area: "Tambaram Market",      time: "10:20 am", outcome: "CSR", notes: "Victim found near bus stop. FIR registered u/s 354A IPC. Perpetrator identified." },
    { id: "A-211", type: "harassment",  citizen: "Deepa Venkatesh",  area: "GST Road, Vandalur",   time: "01:15 pm", outcome: "DSR", notes: "Eve-teasing group dispersed on patrol arrival. Victim counselled and escorted home." },
  ],
  2: [
    { id: "A-202", type: "sos",         citizen: "Priya Rajan",      area: "Meenambakkam Metro",   time: "09:10 am", outcome: "CSR", notes: "Domestic violence victim escorted to Pallavaram AWPS. FIR u/s 498A IPC registered." },
    { id: "A-207", type: "harassment",  citizen: "Kavitha Nair",     area: "Pallavaram Market",    time: "11:40 am", outcome: "DSR", notes: "Suspect identified and warned. Victim safe. Incident documented as DSR." },
    { id: "A-215", type: "harassment",  citizen: "Selvi Pandian",    area: "Tirusulam Junction",   time: "02:55 pm", outcome: "DSR", notes: "Woman followed by unknown man. Suspect fled on patrol approach. Area monitored." },
  ],
  3: [
    { id: "A-203", type: "harassment",  citizen: "Divya Mohan",      area: "Perungalathur Rd",     time: "09:30 am", outcome: "CSR", notes: "Perpetrator detained. Case referred to CI u/s 354D IPC (stalking)." },
    { id: "A-209", type: "sos",         citizen: "Sumathi Arjun",    area: "Chromepet Tank Road",  time: "12:15 pm", outcome: "CSR", notes: "Victim rescued from forced confinement. Suspect arrested u/s 509 IPC." },
  ],
  4: [
    { id: "A-205", type: "harassment",  citizen: "Radha Suresh",     area: "Semmenchery Nagar",    time: "08:55 am", outcome: "DSR", notes: "Group of youths harassing women in street. Dispersed and warned. Area patrolled." },
    { id: "A-208", type: "harassment",  citizen: "Nithya Prakash",   area: "Semmenchery East",     time: "11:00 am", outcome: "CSR", notes: "FIR lodged u/s 354 IPC. Victim given protection helpline number." },
    { id: "A-213", type: "sos",         citizen: "Lalitha Ganesh",   area: "Okkiyam Thoraipakkam", time: "01:50 pm", outcome: "CSR", notes: "Child found safe near school. Reunited with family. Perpetrator detained." },
    { id: "A-217", type: "harassment",  citizen: "Bhavani Raj",      area: "Perungudi Main Road",  time: "03:30 pm", outcome: "DSR", notes: "Suspicious man near school gate warned and moved on. School security alerted." },
  ],
};

// ── helpers ────────────────────────────────────────────────────────────────

function patrolSeverity(alertType: string): "severe" | "moderate" | "low" {
  const t = alertType.toLowerCase();
  if (["sos","assault","rape","molestation","abduction","kidnap","pocso"].some(k => t.includes(k))) return "severe";
  if (["harassment","stalking","threat","medical"].some(k => t.includes(k))) return "moderate";
  return "low";
}
function patrolGlowClass(alertType: string): string {
  const sev = patrolSeverity(alertType);
  return sev === "severe" ? "glow-red" : sev === "moderate" ? "glow-amber" : "glow-green";
}

function parseUTC(iso: string): Date {
  return new Date(/Z|[+-]\d{2}:/.test(iso) ? iso : iso.replace(" ", "T") + "Z");
}
function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}
function fmtElapsed(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── component ──────────────────────────────────────────────────────────────

export default function PatrolDashboard() {
  const { user, logout } = useAuth();
  const vehicleId = user?.vehicle_id ?? 0;
  const color = VEHICLE_COLORS[vehicleId] ?? "#3b82f6";
  const { myAlert: realMyAlert, alertQueue: realQueue, connected } = usePatrolAlerts(user?.token ?? "", vehicleId);
  // Demo active alert: simulates accepted state for negative-ID demo items
  const [demoActive, setDemoActive] = useState<any | null>(null);
  // Real alert always wins over demo
  const myAlert = realMyAlert ?? demoActive;
  // Use real queue if populated, otherwise show demo data (minus any accepted demo item)
  const alertQueue = realQueue.length > 0
    ? realQueue
    : (DEMO_QUEUE[vehicleId] ?? []).filter((c: any) => c.id !== demoActive?.id) as any[];

  // Alert interaction state
  const [messages, setMessages]     = useState<AlertMessage[]>([]);
  const [customMsg, setCustomMsg]   = useState("");
  const [sending, setSending]       = useState(false);
  const [accepting, setAccepting]   = useState(false);
  const [arriving, setArriving]     = useState(false);
  const [investigated, setInvestigated] = useState(false);
  const [reportType, setReportType] = useState<"DSR" | "CSR" | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [filingReport, setFilingReport] = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const dispatchedAt = useRef<Date>(new Date());

  // Queue interaction state
  const [expandedId, setExpandedId]   = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]     = useState(false);

  // Map data
  const [crimes, setCrimes]       = useState<Crime[]>([]);
  const [hotspots, setHotspots]   = useState<PatrolZone[]>([]);
  const [vehicles, setVehicles]   = useState<PatrolVehicle[]>([]);
  const [venues, setVenues]       = useState<Venue[]>([]);

  // GPS position for nav line
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── effects ──

  // If a real alert arrives, clear demo state
  useEffect(() => { if (realMyAlert) setDemoActive(null); }, [realMyAlert?.id]);

  // Reset investigation state when alert changes
  useEffect(() => { setInvestigated(false); setReportType(null); setReportNotes(""); }, [myAlert?.id]);

  // Track dispatch time for elapsed timer
  useEffect(() => { if (myAlert) dispatchedAt.current = new Date(); }, [myAlert?.id]);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - dispatchedAt.current.getTime()) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll messages while alert active
  useEffect(() => {
    if (!myAlert?.id || !user?.token) { setMessages([]); return; }
    const poll = () => api.getAlertMessages(user.token, myAlert.id).then(d => setMessages(d.messages ?? [])).catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [myAlert?.id, user?.token]);

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      p => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  // Scroll messages
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Load map data once
  useEffect(() => {
    api.crimes().then(r => setCrimes(r.crimes ?? [])).catch(() => {});
    api.hotspots().then(r => setHotspots(r.hotspots ?? [])).catch(() => {});
    api.vehicles().then(r => setVehicles(r.vehicles ?? [])).catch(() => {});
    api.venues().then(r => setVenues(r.venues ?? [])).catch(() => {});
  }, []);

  // ── handlers ──

  const handleAcceptQueued = useCallback(async (alertId: number) => {
    if (!user?.token) return;
    if (alertId < 0) {
      // Demo item — simulate accepted state locally
      const item = (DEMO_QUEUE[vehicleId] ?? []).find((c: any) => c.id === alertId);
      if (item) {
        setDemoActive({
          ...item,
          status: "acknowledged",
          citizen_id: 0,
          dispatched_vehicle_id: vehicleId,
          description: item.description,
          citizen_name: item.citizen_name,
          citizen_phone: item.citizen_phone,
        });
      }
      setExpandedId(null);
      return;
    }
    try { await api.acceptAlert(user.token, alertId); } catch { /* WS updates */ }
    setExpandedId(null);
  }, [user?.token, vehicleId]);

  const handleReject = useCallback(async (alertId: number) => {
    if (!rejectReason.trim()) return;
    setRejecting(true);
    try {
      if (alertId < 0) {
        // Demo reject — just clear locally
        setRejectingId(null);
        setRejectReason("");
        setExpandedId(null);
        return;
      }
      if (!user?.token) return;
      await api.rejectAlert(user.token, alertId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      setExpandedId(null);
    } catch { /* WS will update */ } finally { setRejecting(false); }
  }, [user?.token, rejectReason]);

  const handleAccept = useCallback(async () => {
    if (!myAlert || !user?.token) return;
    setAccepting(true);
    try { await api.acceptAlert(user.token, myAlert.id); } catch { /* WS updates */ } finally { setAccepting(false); }
  }, [myAlert, user?.token]);

  const handleArrive = useCallback(async () => {
    if (!myAlert) return;
    if (myAlert.id < 0) {
      setDemoActive((prev: any) => prev ? { ...prev, status: "on_scene" } : prev);
      return;
    }
    if (!user?.token) return;
    setArriving(true);
    try { await api.patrolArrive(user.token, myAlert.id); } catch { /* WS updates */ } finally { setArriving(false); }
  }, [myAlert, user?.token]);

  const handleFileReport = useCallback(async () => {
    if (!myAlert || !reportType) return;
    if (myAlert.id < 0) {
      setDemoActive(null);
      return;
    }
    if (!user?.token) return;
    setFilingReport(true);
    try { await api.patrolFileReport(user.token, myAlert.id, reportType, reportNotes); } catch { /* WS updates */ } finally { setFilingReport(false); }
  }, [myAlert, user?.token, reportType, reportNotes]);

  const sendMessage = useCallback(async (body: string) => {
    if (!myAlert || !body.trim()) return;
    if (myAlert.id < 0) {
      // Demo: append message locally
      setMessages(prev => [...prev, {
        id: Date.now(), alert_id: myAlert.id,
        sender_id: 0, sender_role: "patrol", body, created_at: new Date().toISOString(),
      } as any]);
      setCustomMsg("");
      return;
    }
    if (!user?.token) return;
    setSending(true);
    try {
      const res = await api.sendPatrolMessage(user.token, myAlert.id, body.trim());
      setMessages(prev => [...prev, res.message]);
      setCustomMsg("");
    } catch { /* ignore */ } finally { setSending(false); }
  }, [myAlert, user?.token]);

  // ── derived state ──

  const isIncoming  = myAlert?.status === "dispatched";
  const isAccepted  = myAlert?.status === "acknowledged";
  const isOnScene   = myAlert?.status === "on_scene";
  const hasActiveAlert = isIncoming || isAccepted || isOnScene;
  const citizenName = (myAlert as any)?.citizen_name ?? (myAlert ? `Citizen #${myAlert.citizen_id}` : null);
  const citizenPhone = (myAlert as any)?.citizen_phone ?? null;

  // Navigation line from officer GPS → victim
  const navTarget = myPos && myAlert ? {
    fromLat: myPos.lat, fromLng: myPos.lng,
    toLat: myAlert.lat, toLng: myAlert.lng,
    color,
  } : null;

  // Active alert as an array for the map to show the SOS pin
  const mapAlerts: AlertRow[] = myAlert ? [myAlert as AlertRow] : [];

  // ── render ──

  return (
    <div className="h-screen bg-bg-dark flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-surface-L1 border-b border-border px-4 py-2.5 flex items-center gap-3 shrink-0">
        {/* Vehicle badge */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white shrink-0"
          style={{ background: color }}
        >
          {vehicleId}
        </div>
        <div>
          <p className="text-sm font-black text-text-primary leading-none">Patrol {vehicleId}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{user?.full_name} · {ZONE_NAMES[vehicleId] ?? "Zone"} AWPS</p>
        </div>

        {/* Status / elapsed */}
        {hasActiveAlert && (
          <div className="flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-[11px] font-black text-amber-300 tabular-nums">{fmtElapsed(elapsed)}</span>
          </div>
        )}

        <div className="flex-1" />

        <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg ${
          connected ? "text-green-400 bg-green-500/10" : "text-amber-400 bg-amber-500/10"
        }`}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? "Live" : "Reconnecting"}
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-red-400 transition px-2 py-1.5 rounded-lg">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Main: Map + Panel ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Map (same as Command Centre) ── */}
        <div className="flex-1 relative overflow-hidden">
          <MapComponent
            crimes={crimes}
            hotspots={hotspots}
            vehicles={vehicles}
            venues={venues}
            activeAlerts={mapAlerts}
            selectedAlertId={myAlert?.id ?? null}
            navTarget={navTarget}
            token={user?.token}
            myVehicleId={vehicleId}
          />

          {/* Navigate to Victim button — overlaid on map */}
          {myAlert && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1001] flex gap-2">
              <a
                href={myPos
                  ? `https://maps.google.com/maps?saddr=${myPos.lat},${myPos.lng}&daddr=${myAlert.lat},${myAlert.lng}&dirflg=d`
                  : `https://maps.google.com/?q=${myAlert.lat},${myAlert.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-4 py-2.5 rounded-2xl shadow-2xl transition"
              >
                <Navigation className="w-4 h-4" /> Navigate to Victim
              </a>
            </div>
          )}

          {/* Alert type tag — overlaid on map */}
          {myAlert && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 bg-red-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-xl backdrop-blur-sm">
              <AlertTriangle className="w-3.5 h-3.5" />
              {TYPE_LABEL[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()} · {myAlert.lat.toFixed(4)}, {myAlert.lng.toFixed(4)}
            </div>
          )}
        </div>

        {/* ── RIGHT: Complaint Panel ── */}
        <div className="w-[360px] shrink-0 bg-surface-L1 border-l border-border flex flex-col overflow-hidden">

          {/* Panel header */}
          <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {hasActiveAlert ? "Active Complaint" : alertQueue.length > 0 ? "Allocated Complaints" : "Allocated Complaints"}
            </p>
            {!hasActiveAlert && alertQueue.length > 0 && (
              <span className="text-[10px] font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                {alertQueue.length}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── QUEUED COMPLAINTS ── */}
            {!myAlert && alertQueue.length > 0 && (
              <div className="flex flex-col h-full overflow-y-auto">
                <div className="px-4 pt-3 pb-2 shrink-0">
                  <p className="text-[10px] text-text-muted leading-snug">
                    Review and accept or reject each complaint. Rejection requires a reason sent back to Command Centre.
                  </p>
                </div>
                <div className="px-3 pb-4 space-y-2.5">
                  {alertQueue.map((c: any) => {
                    const isExpanded = expandedId === c.id;
                    const isRejectOpen = rejectingId === c.id;
                    const ageMin = Math.round((Date.now() - new Date(c.created_at).getTime()) / 60000);
                    return (
                      <div key={c.id} className={`rounded-xl border transition-all ${
                        isExpanded ? "border-amber-500/40 bg-amber-500/5" : `border-border bg-surface-L2 ${!isRejectOpen ? patrolGlowClass(c.alert_type) : ""}`
                      }`}>
                        {/* Collapsed row */}
                        <button
                          className="w-full flex items-center gap-3 px-3 py-3 text-left"
                          onClick={() => { setExpandedId(isExpanded ? null : c.id); setRejectingId(null); setRejectReason(""); }}
                        >
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${TYPE_COLOR[c.alert_type]}`}>
                            {TYPE_LABEL[c.alert_type] ?? c.alert_type}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-text-primary truncate">{c.citizen_name ?? `Citizen #${c.citizen_id}`}</p>
                            <p className="text-[10px] text-text-muted">{ageMin < 1 ? "Just now" : `${ageMin} min ago`} · ETA {c.eta_minutes ?? "—"} min</p>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>

                        {/* Expanded: victim details + actions */}
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
                            {/* Victim info */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                                  <User className="w-4 h-4 text-blue-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-text-primary">{c.citizen_name ?? `Citizen #${c.citizen_id}`}</p>
                                  <p className="text-[10px] text-text-muted">Complaint #{Math.abs(c.id)}</p>
                                </div>
                              </div>
                              {c.description && (
                                <p className="text-sm text-text-secondary bg-surface-L1 rounded-xl px-3 py-2.5 border border-border italic">
                                  "{c.description}"
                                </p>
                              )}
                              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                                <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="font-mono">{c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}</span>
                              </div>
                              {c.citizen_phone && (
                                <a href={`tel:${c.citizen_phone}`}
                                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 border bg-green-500/8 border-green-500/30 hover:bg-green-500/15 transition">
                                  <Phone className="w-4 h-4 text-green-400 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-[10px] text-text-muted">Tap to call victim</p>
                                    <p className="text-sm font-bold text-text-primary">{c.citizen_phone}</p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-green-400 opacity-60" />
                                </a>
                              )}
                              <p className="text-[11px] text-amber-400 font-semibold">
                                📍 Estimated arrival: ~{c.eta_minutes ?? "—"} min drive
                              </p>
                            </div>

                            {/* Accept / Reject buttons */}
                            {!isRejectOpen && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setExpandedId(null); /* accept uses real flow */ handleAcceptQueued(c.id); }}
                                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow"
                                >
                                  <CheckCircle className="w-4 h-4" /> Accept
                                </button>
                                <button
                                  onClick={() => { setRejectingId(c.id); setRejectReason(""); }}
                                  className="flex-1 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 font-bold text-sm rounded-xl transition flex items-center justify-center gap-2"
                                >
                                  <X className="w-4 h-4" /> Reject
                                </button>
                              </div>
                            )}

                            {/* Reject reason form */}
                            {isRejectOpen && (
                              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-2.5">
                                <p className="text-[11px] font-bold text-red-400">Reason for rejection (required — sent to Command Centre)</p>
                                <textarea
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value.slice(0, 300))}
                                  placeholder="e.g. Already responding to another emergency nearby…"
                                  rows={3}
                                  className="w-full bg-surface-L2 border border-border text-text-primary text-sm rounded-xl px-3 py-2 placeholder-text-muted focus:outline-none focus:border-red-500/60 resize-none"
                                  autoFocus
                                />
                                <p className="text-[10px] text-text-muted text-right">{rejectReason.length}/300</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleReject(c.id)}
                                    disabled={!rejectReason.trim() || rejecting}
                                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl transition disabled:opacity-50"
                                  >
                                    {rejecting ? "Sending…" : "Confirm Rejection"}
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                    className="px-3 py-2 bg-surface-L2 border border-border text-text-muted hover:text-text-primary rounded-xl transition text-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── STANDBY (no queue) ── */}
            {!myAlert && alertQueue.length === 0 && (() => {
              const past = PAST_COMPLAINTS[vehicleId] ?? [];
              const dsr  = past.filter(c => c.outcome === "DSR").length;
              const csr  = past.filter(c => c.outcome === "CSR").length;
              return (
                <div className="flex flex-col h-full">
                  {/* Status bar */}
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-border shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}20`, border: `1.5px solid ${color}50` }}>
                      <Shield className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary font-bold text-sm leading-none">On Duty · Standby</p>
                      <p className="text-text-muted text-[10px] mt-0.5">Awaiting dispatch from Command Centre</p>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-1 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      {ZONE_NAMES[vehicleId]}
                    </div>
                  </div>

                  {/* KPI strip */}
                  <div className="px-4 py-3 grid grid-cols-3 gap-2 border-b border-border shrink-0">
                    <div className="bg-surface-L2 rounded-xl border border-border px-3 py-2 text-center">
                      <p className="text-xl font-black text-text-primary">{past.length}</p>
                      <p className="text-[9px] text-text-muted uppercase tracking-wider mt-0.5">Attended</p>
                    </div>
                    <div className="bg-blue-500/5 rounded-xl border border-blue-500/20 px-3 py-2 text-center">
                      <p className="text-xl font-black text-blue-400">{dsr}</p>
                      <p className="text-[9px] text-blue-400/70 uppercase tracking-wider mt-0.5">DSR</p>
                    </div>
                    <div className="bg-red-500/5 rounded-xl border border-red-500/20 px-3 py-2 text-center">
                      <p className="text-xl font-black text-red-400">{csr}</p>
                      <p className="text-[9px] text-red-400/70 uppercase tracking-wider mt-0.5">CSR</p>
                    </div>
                  </div>

                  {/* Past complaints list */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Today's Cases</p>
                    {past.length === 0 ? (
                      <p className="text-center text-xs text-text-muted py-8">No complaints attended today</p>
                    ) : past.map(c => (
                      <div key={c.id} className="rounded-xl bg-surface-L2 border border-border p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_COLOR[c.type]}`}>
                            {TYPE_LABEL[c.type] ?? c.type}
                          </span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                            c.outcome === "CSR"
                              ? "bg-red-500/15 text-red-400 border border-red-500/30"
                              : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          }`}>{c.outcome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-text-muted shrink-0" />
                          <p className="text-[11px] font-semibold text-text-primary truncate">{c.citizen}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{c.area}</span>
                          <span className="shrink-0 ml-auto">{c.time}</span>
                        </div>
                        <p className="text-[10px] text-text-muted/70 leading-snug italic">{c.notes}</p>
                        <p className="text-[9px] text-text-muted">{c.id}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── INCOMING DISPATCH ── */}
            {myAlert && isIncoming && (
              <div className="p-4 space-y-3">
                {/* Alert type badge + blink */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TYPE_COLOR[myAlert.alert_type]}`}>
                    🚨 {TYPE_LABEL[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-text-muted">#{myAlert.id}</span>
                </div>

                <div className="rounded-xl bg-surface-L2 border border-border px-4 py-3 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                      <User className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-text-primary font-bold text-sm">{citizenName}</p>
                      <p className="text-text-muted text-[11px]">Citizen in distress</p>
                    </div>
                  </div>

                  {myAlert.description && (
                    <p className="text-text-secondary text-sm bg-surface-L1 rounded-lg px-3 py-2 italic">
                      "{myAlert.description}"
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span className="font-mono">{myAlert.lat.toFixed(4)}, {myAlert.lng.toFixed(4)}</span>
                  </div>
                  {myAlert.eta_minutes && (
                    <p className="text-[11px] text-amber-400 font-semibold">
                      📍 Estimated distance: ~{myAlert.eta_minutes} min drive
                    </p>
                  )}
                </div>

                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full py-3.5 bg-red-500 hover:bg-red-400 active:scale-[0.98] text-white font-black text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {accepting
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <CheckCircle className="w-4 h-4" />}
                  Accept & Respond
                </button>
              </div>
            )}

            {/* ── ACCEPTED / ON SCENE ── */}
            {myAlert && (isAccepted || isOnScene) && (
              <div className="flex flex-col divide-y divide-border">

                {/* Victim info card */}
                <div className="px-4 py-4 space-y-3">
                  {/* Status badge */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TYPE_COLOR[myAlert.alert_type]}`}>
                      {TYPE_LABEL[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()}
                    </span>
                    {isOnScene
                      ? <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">● On Scene</span>
                      : <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-semibold">✓ En Route</span>
                    }
                  </div>

                  {/* Citizen identity */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary font-bold text-sm">{citizenName}</p>
                      <p className="text-text-muted text-[11px]">Complaint #{myAlert.id}</p>
                    </div>
                  </div>

                  {/* Phone — tap to call */}
                  <a
                    href={citizenPhone ? `tel:${citizenPhone}` : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition group ${
                      citizenPhone
                        ? "bg-green-500/8 border-green-500/30 hover:bg-green-500/15 cursor-pointer"
                        : "bg-surface-L2 border-border cursor-default"
                    }`}
                  >
                    <Phone className="w-4 h-4 text-green-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[11px] text-text-muted">Mobile</p>
                      <p className="text-sm font-bold text-text-primary">{citizenPhone ?? "+91 984 1XX ****"}</p>
                    </div>
                    {citizenPhone && (
                      <ChevronRight className="w-4 h-4 text-green-400 opacity-60 group-hover:opacity-100 transition" />
                    )}
                  </a>

                  {/* Location */}
                  <div className="flex items-start gap-2.5 text-sm text-text-secondary">
                    <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] text-text-muted">Alert location</p>
                      <p className="text-[12px] font-mono text-text-secondary">{myAlert.lat.toFixed(5)}, {myAlert.lng.toFixed(5)}</p>
                      <a
                        href={`https://maps.google.com/?q=${myAlert.lat},${myAlert.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition mt-0.5 inline-block"
                      >
                        Open in Google Maps ↗
                      </a>
                    </div>
                  </div>

                  {/* Description */}
                  {myAlert.description && (
                    <p className="text-text-secondary text-sm bg-surface-L2 rounded-xl px-3 py-2.5 border border-border italic">
                      "{myAlert.description}"
                    </p>
                  )}
                </div>

                {/* Chat thread */}
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    <MessageCircle className="w-3.5 h-3.5" /> Communication
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {messages.length === 0 && (
                      <p className="text-text-muted text-xs text-center py-4">No messages yet</p>
                    )}
                    {messages.map(m => {
                      const mine = (m as any).sender_role !== "citizen";
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${
                            mine
                              ? "bg-blue-600 text-white rounded-tr-sm"
                              : "bg-green-600 text-white rounded-tl-sm"
                          }`}>
                            {!mine && <p className="text-[9px] text-green-100 font-bold mb-0.5 uppercase">Citizen</p>}
                            <p className="leading-snug">{m.body}</p>
                            <p className={`text-[10px] mt-0.5 ${mine ? "text-blue-200 text-right" : "text-green-100"}`}>
                              {timeAgo(m.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Quick replies */}
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REPLIES.map(r => (
                      <button key={r} onClick={() => sendMessage(r)} disabled={sending}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border bg-surface-L2 text-text-secondary hover:bg-blue-500/15 hover:border-blue-500/40 hover:text-blue-300 transition disabled:opacity-40">
                        {r}
                      </button>
                    ))}
                  </div>

                  {/* Message input */}
                  <div className="flex gap-2">
                    <input
                      type="text" value={customMsg}
                      onChange={e => setCustomMsg(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendMessage(customMsg)}
                      placeholder="Type a message…"
                      className="flex-1 bg-surface-L2 border border-border text-text-primary text-sm rounded-xl px-3 py-2 placeholder-text-muted focus:outline-none focus:border-blue-500/60 transition"
                    />
                    <button onClick={() => sendMessage(customMsg)} disabled={sending || !customMsg.trim()}
                      className="w-9 h-9 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center justify-center transition disabled:opacity-40">
                      <Send className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="px-4 py-4 space-y-3">

                  {/* I've Arrived — shown when accepted (en route), not on scene yet */}
                  {isAccepted && (
                    <button onClick={handleArrive} disabled={arriving}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-white font-black text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow">
                      {arriving
                        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <MapPin className="w-4 h-4" />}
                      I've Arrived at Location
                    </button>
                  )}

                  {/* On Scene: Investigate → then DSR/CSR form */}
                  {isOnScene && !investigated && (
                    <button onClick={() => setInvestigated(true)}
                      className="w-full py-3 bg-violet-600 hover:bg-violet-500 active:scale-[0.98] text-white font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow">
                      <CheckCheck className="w-4 h-4" />
                      Investigated the Crime
                    </button>
                  )}

                  {/* DSR / CSR filing form — shown after investigation confirmed */}
                  {isOnScene && investigated && (
                    <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-400" />
                        <p className="text-amber-400 font-bold text-sm">File Incident Report</p>
                      </div>

                      <div className="bg-surface-L2 rounded-xl p-3 space-y-1.5 text-xs text-text-muted border border-border">
                        <p><span className="text-blue-400 font-bold">DSR</span> — Daily Situation Report: Routine patrol, no crime found</p>
                        <p><span className="text-red-400 font-bold">CSR</span> — Crime Scene Report: Crime confirmed, FIR to be filed</p>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => setReportType("DSR")}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition border ${
                            reportType === "DSR"
                              ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-surface-L2 border-border text-text-secondary hover:border-blue-500/50"
                          }`}>DSR</button>
                        <button onClick={() => setReportType("CSR")}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition border ${
                            reportType === "CSR"
                              ? "bg-red-600 border-red-500 text-white"
                              : "bg-surface-L2 border-border text-text-secondary hover:border-red-500/50"
                          }`}>CSR</button>
                      </div>

                      <textarea
                        value={reportNotes}
                        onChange={e => setReportNotes(e.target.value.slice(0, 500))}
                        placeholder="Notes: situation description, action taken, persons involved…"
                        rows={3}
                        className="w-full bg-surface-L2 border border-border text-text-primary text-sm rounded-xl px-3 py-2 placeholder-text-muted focus:outline-none focus:border-amber-500/60 resize-none"
                      />
                      <p className="text-[10px] text-text-muted text-right -mt-1">{reportNotes.length}/500</p>

                      <button onClick={handleFileReport} disabled={!reportType || filingReport}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 active:scale-[0.98] text-white font-black text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow">
                        {filingReport
                          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <CheckCircle className="w-4 h-4" />}
                        Submit Report & Close Case
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
