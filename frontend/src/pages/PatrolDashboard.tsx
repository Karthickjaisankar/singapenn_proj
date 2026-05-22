import { useState, useRef, useEffect, useCallback } from "react";
import {
  LogOut, MapPin, Phone, MessageCircle, CheckCircle, Send,
  Wifi, WifiOff, Clock, FileText, Navigation, Shield,
  AlertTriangle, User, ChevronRight, CheckCheck,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../contexts/AuthContext";
import { usePatrolAlerts } from "../hooks/usePatrolAlerts";
import { api } from "../api";
import { AlertMessage } from "../types";

// ── constants ──────────────────────────────────────────────────────────────

const ZONE_CENTERS: Record<number, [number, number]> = {
  1: [12.9398, 80.1323], 2: [12.9657, 80.1588],
  3: [12.9314, 80.1496], 4: [12.9344, 80.2120],
};
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

// ── helpers ────────────────────────────────────────────────────────────────

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
  const { myAlert, connected } = usePatrolAlerts(user?.token ?? "", vehicleId);

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

  // Map refs
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const leafletMapRef    = useRef<L.Map | null>(null);
  const citizenMarkerRef = useRef<L.Marker | null>(null);
  const myMarkerRef      = useRef<L.Marker | null>(null);
  const navLineRef       = useRef<L.Polyline | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── effects ──

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
    const id = setInterval(poll, 5000);
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

  // ── map lifecycle ──

  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;

    const center: [number, number] = myAlert
      ? [myAlert.lat, myAlert.lng]
      : (ZONE_CENTERS[vehicleId] ?? [12.9349, 80.1706]);

    const map = L.map(mapContainerRef.current, {
      center, zoom: myAlert ? 14 : 13, zoomControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO", subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;

    return () => {
      map.remove();
      leafletMapRef.current = null;
      citizenMarkerRef.current = null;
      myMarkerRef.current = null;
      navLineRef.current = null;
    };
  }, []);

  // Update citizen / nav markers when alert changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Remove old citizen marker + nav line
    citizenMarkerRef.current?.remove();
    citizenMarkerRef.current = null;
    navLineRef.current?.remove();
    navLineRef.current = null;

    if (!myAlert) return;

    const citizenIcon = L.divIcon({
      html: `<div style="position:relative;width:40px;height:40px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(239,68,68,0.22);animation:ping-p 1.6s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="position:absolute;inset:5px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.5);">🆘</div>
      </div>`,
      iconSize: [40, 40], iconAnchor: [20, 20], className: "",
    });
    citizenMarkerRef.current = L.marker([myAlert.lat, myAlert.lng], { icon: citizenIcon })
      .addTo(map)
      .bindPopup(`<b style="color:#ef4444">${(myAlert as any).citizen_name ?? "Citizen"}</b><br/>${myAlert.lat.toFixed(4)}, ${myAlert.lng.toFixed(4)}`);

    map.flyTo([myAlert.lat, myAlert.lng], 14, { duration: 1.2 });
  }, [myAlert?.id]);

  // Update officer position marker + nav line
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (myPos) {
      const icon = L.divIcon({
        html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">🚔</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15], className: "",
      });
      if (myMarkerRef.current) {
        myMarkerRef.current.setLatLng([myPos.lat, myPos.lng]);
      } else {
        myMarkerRef.current = L.marker([myPos.lat, myPos.lng], { icon }).addTo(map);
      }
    }

    // Navigation line
    navLineRef.current?.remove();
    navLineRef.current = null;
    if (myPos && myAlert) {
      navLineRef.current = L.polyline(
        [[myPos.lat, myPos.lng], [myAlert.lat, myAlert.lng]],
        { color, weight: 2.5, opacity: 0.6, dashArray: "10 7" },
      ).addTo(map);
      map.fitBounds([[myPos.lat, myPos.lng], [myAlert.lat, myAlert.lng]], { padding: [60, 60] });
    }
  }, [myPos, myAlert?.id]);

  // ── handlers ──

  const handleAccept = useCallback(async () => {
    if (!myAlert || !user?.token) return;
    setAccepting(true);
    try { await api.acceptAlert(user.token, myAlert.id); } catch { /* WS updates */ } finally { setAccepting(false); }
  }, [myAlert, user?.token]);

  const handleArrive = useCallback(async () => {
    if (!myAlert || !user?.token) return;
    setArriving(true);
    try { await api.patrolArrive(user.token, myAlert.id); } catch { /* WS updates */ } finally { setArriving(false); }
  }, [myAlert, user?.token]);

  const handleFileReport = useCallback(async () => {
    if (!myAlert || !user?.token || !reportType) return;
    setFilingReport(true);
    try { await api.patrolFileReport(user.token, myAlert.id, reportType, reportNotes); } catch { /* WS updates */ } finally { setFilingReport(false); }
  }, [myAlert, user?.token, reportType, reportNotes]);

  const sendMessage = useCallback(async (body: string) => {
    if (!myAlert || !user?.token || !body.trim()) return;
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

        {/* ── LEFT: Map ── */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={mapContainerRef} className="absolute inset-0" />

          {/* Navigation overlay button */}
          {myAlert && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
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

          {/* Standby zone label */}
          {!myAlert && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-surface-L1/90 border border-border text-text-muted text-xs font-semibold px-3 py-1.5 rounded-full shadow">
              Monitoring {ZONE_NAMES[vehicleId]} zone
            </div>
          )}

          {/* Alert location tag on map */}
          {myAlert && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-red-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-xl">
              <AlertTriangle className="w-3.5 h-3.5" />
              {TYPE_LABEL[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()} · {myAlert.lat.toFixed(4)}, {myAlert.lng.toFixed(4)}
            </div>
          )}

          <style>{`
            @keyframes ping-p { 75%, 100% { transform: scale(2.2); opacity: 0; } }
          `}</style>
        </div>

        {/* ── RIGHT: Complaint Panel ── */}
        <div className="w-[360px] shrink-0 bg-surface-L1 border-l border-border flex flex-col overflow-hidden">

          {/* Panel header */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {hasActiveAlert ? "Active Complaint" : "Allocated Complaints"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── STANDBY ── */}
            {!myAlert && (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-6 py-12">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${color}18`, border: `1.5px solid ${color}44` }}>
                  <Shield className="w-8 h-8" style={{ color }} />
                </div>
                <div className="text-center">
                  <p className="text-text-primary font-bold text-base">On Duty · Standby</p>
                  <p className="text-text-muted text-sm mt-1">No complaints assigned</p>
                  <p className="text-text-muted/60 text-xs mt-0.5">Command Centre will dispatch alerts here</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Monitoring {ZONE_NAMES[vehicleId]} AWPS Zone
                </div>
              </div>
            )}

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
                              : "bg-green-600/18 border border-green-500/30 text-green-200 rounded-tl-sm"
                          }`}>
                            {!mine && <p className="text-[9px] text-green-400 font-bold mb-0.5 uppercase">Citizen</p>}
                            <p className="leading-snug">{m.body}</p>
                            <p className={`text-[10px] mt-0.5 ${mine ? "text-blue-200 text-right" : "text-green-400"}`}>
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
