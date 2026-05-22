import { useState, useRef, useEffect } from "react";
import { LogOut, MapPin, Phone, MessageCircle, CheckCircle, Send, Wifi, WifiOff, Clock, FileText, Map as MapIcon, List } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../contexts/AuthContext";
import { usePatrolAlerts } from "../hooks/usePatrolAlerts";
import { api } from "../api";
import { AlertMessage } from "../types";

const QUICK_REPLIES = [
  "On my way",
  "ETA ~5 minutes",
  "Please stay where you are",
  "I am nearby — stay calm",
  "Situation under control",
];

const ALERT_TYPE_LABELS: Record<string, string> = {
  sos: "SOS EMERGENCY",
  harassment: "Harassment",
  suspicious: "Suspicious Activity",
  medical: "Medical Emergency",
  other: "Other",
};

const SEVERITY_BADGE: Record<string, string> = {
  sos:        "bg-red-500/20 text-red-400 border border-red-500/40",
  harassment: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  suspicious: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
  medical:    "bg-green-500/20 text-green-400 border border-green-500/40",
  other:      "bg-slate-500/20 text-slate-400 border border-slate-500/40",
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function maskPhone(citizenId: number): string {
  const hash = (citizenId * 6364136223846793005 + 1442695040888963407) >>> 0;
  const suffix = String(hash % 10000).padStart(4, "0");
  return `+91 984 1XX ${suffix}`;
}

export default function PatrolDashboard() {
  const { user, logout } = useAuth();
  const vehicleId = user?.vehicle_id ?? 0;
  const { myAlert, connected } = usePatrolAlerts(user?.token ?? "", vehicleId);

  const [messages, setMessages] = useState<AlertMessage[]>([]);
  const [customMsg, setCustomMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [reportType, setReportType] = useState<"DSR" | "CSR" | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [filingReport, setFilingReport] = useState(false);
  const [dispatchedAt] = useState<Date>(new Date());
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<"details" | "map">("details");
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const citizenMarkerRef = useRef<L.Marker | null>(null);
  const myMarkerRef = useRef<L.Marker | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync messages from alert
  useEffect(() => {
    if (myAlert?.messages) setMessages(myAlert.messages);
  }, [myAlert?.messages]);

  // Elapsed timer since dispatch
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - dispatchedAt.getTime()) / 1000)), 1000);
    return () => clearInterval(id);
  }, [dispatchedAt]);

  // GPS tracking for map
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Leaflet map lifecycle
  useEffect(() => {
    if (activeTab !== "map" || !mapContainerRef.current || !myAlert) return;

    // Init map on first render of map tab
    if (!leafletMapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [myAlert.lat, myAlert.lng],
        zoom: 15,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // Citizen pin (red pulsing)
      const citizenIcon = L.divIcon({
        html: `<div style="position:relative;width:36px;height:36px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:rgba(239,68,68,0.25);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:absolute;inset:4px;border-radius:50%;background:#ef4444;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🆘</div>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: "",
      });
      citizenMarkerRef.current = L.marker([myAlert.lat, myAlert.lng], { icon: citizenIcon })
        .addTo(map)
        .bindPopup(`<b>Citizen Location</b><br/>${myAlert.lat.toFixed(4)}, ${myAlert.lng.toFixed(4)}`);

      leafletMapRef.current = map;
    }

    return () => {};
  }, [activeTab, myAlert]);

  // Update my position marker on map
  useEffect(() => {
    if (!leafletMapRef.current || !myPos) return;
    const myIcon = L.divIcon({
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#3b82f6;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">🚔</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      className: "",
    });
    if (myMarkerRef.current) {
      myMarkerRef.current.setLatLng([myPos.lat, myPos.lng]);
    } else {
      myMarkerRef.current = L.marker([myPos.lat, myPos.lng], { icon: myIcon })
        .addTo(leafletMapRef.current)
        .bindPopup("My Position");
    }
    // Fit bounds to show both pins
    if (myAlert && citizenMarkerRef.current) {
      leafletMapRef.current.fitBounds(
        [[myPos.lat, myPos.lng], [myAlert.lat, myAlert.lng]],
        { padding: [50, 50] },
      );
    }
  }, [myPos, myAlert]);

  // Cleanup map when tab switches away or component unmounts
  useEffect(() => {
    if (activeTab !== "map" && leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      citizenMarkerRef.current = null;
      myMarkerRef.current = null;
    }
  }, [activeTab]);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAccept = async () => {
    if (!myAlert || !user?.token) return;
    setAccepting(true);
    try {
      await api.acceptAlert(user.token, myAlert.id);
    } catch {
      // WS will update state
    } finally {
      setAccepting(false);
    }
  };

  const handleArrive = async () => {
    if (!myAlert || !user?.token) return;
    setArriving(true);
    try {
      await api.patrolArrive(user.token, myAlert.id);
    } catch {
      // WS will update state
    } finally {
      setArriving(false);
    }
  };

  const handleFileReport = async () => {
    if (!myAlert || !user?.token || !reportType) return;
    setFilingReport(true);
    try {
      await api.patrolFileReport(user.token, myAlert.id, reportType, reportNotes);
    } catch {
      // WS will update state
    } finally {
      setFilingReport(false);
    }
  };

  const sendMessage = async (body: string) => {
    if (!myAlert || !user?.token || !body.trim()) return;
    setSending(true);
    try {
      const res = await api.sendPatrolMessage(user.token, myAlert.id, body.trim());
      setMessages(prev => [...prev, res.message]);
      setCustomMsg("");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const isAccepted = myAlert?.status === "acknowledged";
  const isOnScene  = myAlert?.status === "on_scene";
  // "incoming" = dispatched but patrol hasn't accepted (acknowledged) yet
  const isIncoming = myAlert && myAlert.status === "dispatched";

  const hasActiveAlert = myAlert && (isAccepted || isOnScene);

  return (
    <div className="h-screen bg-[#0f1117] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="w-full bg-[#1a1d27] border-b border-[#2e3347] px-4 py-2.5 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-sm font-black text-white shrink-0">
          {vehicleId}
        </div>
        <div>
          <p className="text-sm font-black text-white leading-none">PPV-{vehicleId} · Patrol</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{user?.full_name}</p>
        </div>
        <div className="flex-1" />

        {/* Tab switcher — only when alert is active */}
        {hasActiveAlert && (
          <div className="flex items-center bg-[#22263a] rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setActiveTab("details")}
              className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md transition ${
                activeTab === "details" ? "bg-[#1a1d27] text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <List className="w-3 h-3" /> Details
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md transition ${
                activeTab === "map" ? "bg-[#1a1d27] text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <MapIcon className="w-3 h-3" /> Map
            </button>
          </div>
        )}

        <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg ${
          connected ? "text-green-400 bg-green-500/10" : "text-amber-400 bg-amber-500/10"
        }`}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? "Live" : "Reconnecting"}
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-red-400 transition px-2 py-1.5 rounded-lg"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Map Tab ── */}
      {hasActiveAlert && activeTab === "map" && myAlert && (
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <div ref={mapContainerRef} className="absolute inset-0" />
          {/* Navigate overlay button */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
            <a
              href={myPos
                ? `https://maps.google.com/maps?saddr=${myPos.lat},${myPos.lng}&daddr=${myAlert.lat},${myAlert.lng}&dirflg=d`
                : `https://maps.google.com/?q=${myAlert.lat},${myAlert.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-4 py-2.5 rounded-2xl shadow-2xl transition"
            >
              <MapPin className="w-4 h-4" /> Navigate to Citizen
            </a>
            {myPos && (
              <button
                onClick={() => leafletMapRef.current?.setView([myAlert.lat, myAlert.lng], 16)}
                className="bg-[#1a1d27]/90 border border-[#2e3347] text-slate-300 text-xs font-semibold px-3 py-2.5 rounded-2xl shadow-2xl hover:text-white transition"
              >
                Re-center
              </button>
            )}
          </div>
          {/* Location badge */}
          {!myPos && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">
              Enable GPS for turn-by-turn
            </div>
          )}
          {/* Inject ping animation */}
          <style>{`@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`}</style>
        </div>
      )}

      {/* ── Details Tab (scrollable) ── */}
      <div className={`${hasActiveAlert && activeTab === "map" ? "hidden" : "flex-1 overflow-y-auto"}`}>
      <div className="w-full max-w-[440px] mx-auto px-4 py-4 space-y-4">

        {/* ─── Standby state ─── */}
        {!myAlert && (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-3">
              <div className="w-4 h-4 rounded-full bg-green-400 animate-pulse" />
            </div>
            <p className="text-white font-bold text-base">On Duty · Standby</p>
            <p className="text-slate-500 text-sm mt-1">No active dispatch</p>
            <p className="text-slate-600 text-xs mt-0.5">Monitoring zone for PPV-{vehicleId}</p>
          </div>
        )}

        {/* ─── Incoming assignment ─── */}
        {myAlert && isIncoming && !isAccepted && (
          <div className="rounded-2xl border-2 border-red-500/60 bg-red-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[myAlert.alert_type]}`}>
                {ALERT_TYPE_LABELS[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-500">#{myAlert.id}</span>
            </div>

            <div className="space-y-1.5 text-sm">
              {myAlert.description && (
                <p className="text-white/90">"{myAlert.description}"</p>
              )}
              <div className="flex items-center gap-1.5 text-slate-400">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs">{myAlert.lat.toFixed(4)}, {myAlert.lng.toFixed(4)}</span>
              </div>
              {myAlert.eta_minutes && (
                <p className="text-xs text-amber-400 font-semibold">ETA: ~{myAlert.eta_minutes} min</p>
              )}
            </div>

            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full py-3 bg-red-500 hover:bg-red-400 active:scale-95 text-white font-bold text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {accepting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Accept & Confirm
            </button>
          </div>
        )}

        {/* ─── Active / Accepted assignment ─── */}
        {myAlert && (isAccepted || isOnScene) && (
          <>
            {/* Citizen details card */}
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[myAlert.alert_type]}`}>
                  {ALERT_TYPE_LABELS[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                  {isOnScene && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                      ● On Scene
                    </span>
                  )}
                  {isAccepted && (
                    <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-semibold">
                      ✓ Accepted
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-sm">
                    👤
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {(myAlert as any).citizen_name ?? `Citizen #${myAlert.citizen_id}`}
                    </p>
                    <p className="text-slate-500 text-xs">Citizen #{myAlert.citizen_id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-mono">{maskPhone(myAlert.citizen_id)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs">{myAlert.lat.toFixed(4)}, {myAlert.lng.toFixed(4)}</span>
                </div>

                {myAlert.description && (
                  <p className="text-white/80 text-sm bg-[#22263a] rounded-lg px-3 py-2">
                    "{myAlert.description}"
                  </p>
                )}

                {myAlert.eta_minutes && (
                  <p className="text-xs text-amber-400 font-semibold">ETA at dispatch: ~{myAlert.eta_minutes} min</p>
                )}

                <a
                  href={`https://maps.google.com/?q=${myAlert.lat},${myAlert.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold hover:text-blue-300 transition"
                >
                  <MapPin className="w-3 h-3" /> Open in Google Maps ↗
                </a>
              </div>

              {/* I've Arrived button — only when accepted, not yet on scene */}
              {isAccepted && (
                <button
                  onClick={handleArrive}
                  disabled={arriving}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-bold text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {arriving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4" />
                  )}
                  I've Arrived at Location
                </button>
              )}
            </div>

            {/* ─── On Scene: DSR/CSR Report Form ─── */}
            {isOnScene && (
              <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <p className="text-amber-400 font-bold text-sm">On Scene — File Incident Report</p>
                </div>

                <div className="bg-[#22263a] rounded-xl p-3 space-y-1.5 text-xs text-slate-400">
                  <p><span className="text-blue-400 font-bold">DSR</span> — Daily Situation Report: Routine patrol, no crime found</p>
                  <p><span className="text-red-400 font-bold">CSR</span> — Crime Scene Report: Crime confirmed, FIR to be filed</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setReportType("DSR")}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition border ${
                      reportType === "DSR"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-[#22263a] border-[#2e3347] text-slate-400 hover:border-blue-500/50"
                    }`}
                  >
                    DSR
                  </button>
                  <button
                    onClick={() => setReportType("CSR")}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition border ${
                      reportType === "CSR"
                        ? "bg-red-600 border-red-500 text-white"
                        : "bg-[#22263a] border-[#2e3347] text-slate-400 hover:border-red-500/50"
                    }`}
                  >
                    CSR
                  </button>
                </div>

                <textarea
                  value={reportNotes}
                  onChange={e => setReportNotes(e.target.value.slice(0, 500))}
                  placeholder="Notes (situation description, action taken…)"
                  rows={3}
                  className="w-full bg-[#22263a] border border-[#2e3347] text-white text-sm rounded-xl px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 resize-none"
                />
                <p className="text-[10px] text-slate-600 text-right -mt-1">{reportNotes.length}/500</p>

                <button
                  onClick={handleFileReport}
                  disabled={!reportType || filingReport}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {filingReport ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Submit & Close Case
                </button>
              </div>
            )}

            {/* Message thread */}
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <MessageCircle className="w-3.5 h-3.5" /> Citizen Communication
              </div>

              {/* Message list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-slate-600 text-xs text-center py-3">No messages yet</p>
                )}
                {messages.map(m => {
                  const isPatrolMsg = (m as any).sender_role !== "citizen";
                  return (
                    <div key={m.id} className={`flex ${isPatrolMsg ? "justify-end" : "justify-start"}`}>
                      <div className={`text-sm px-3 py-1.5 rounded-2xl max-w-[80%] ${
                        isPatrolMsg
                          ? "bg-blue-600 text-white rounded-tr-sm"
                          : "bg-green-600/20 border border-green-500/30 text-green-200 rounded-tl-sm"
                      }`}>
                        {!isPatrolMsg && (
                          <p className="text-[9px] text-green-400 font-bold mb-0.5 uppercase">Citizen</p>
                        )}
                        <p>{m.body}</p>
                        <p className={`text-[10px] mt-0.5 ${isPatrolMsg ? "text-blue-200 text-right" : "text-green-400"}`}>
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
                {QUICK_REPLIES.map(reply => (
                  <button
                    key={reply}
                    onClick={() => sendMessage(reply)}
                    disabled={sending}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#2e3347] bg-[#22263a] text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-300 transition disabled:opacity-40"
                  >
                    {reply}
                  </button>
                ))}
              </div>

              {/* Custom message */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customMsg}
                  onChange={e => setCustomMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage(customMsg)}
                  placeholder="Type a message…"
                  className="flex-1 bg-[#22263a] border border-[#2e3347] text-white text-sm rounded-xl px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
                />
                <button
                  onClick={() => sendMessage(customMsg)}
                  disabled={sending || !customMsg.trim()}
                  className="w-9 h-9 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center justify-center transition disabled:opacity-40"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
