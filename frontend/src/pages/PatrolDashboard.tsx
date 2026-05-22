import { useState, useRef, useEffect } from "react";
import { LogOut, MapPin, Phone, MessageCircle, CheckCircle, Send, Wifi, WifiOff } from "lucide-react";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync messages from alert
  useEffect(() => {
    if (myAlert?.messages) setMessages(myAlert.messages);
  }, [myAlert?.messages]);

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
  // "incoming" = dispatched but patrol hasn't accepted (acknowledged) yet
  const isIncoming = myAlert && myAlert.status === "dispatched";

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center py-0">
      {/* Header */}
      <div className="w-full bg-[#1a1d27] border-b border-[#2e3347] px-4 py-2.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-sm font-black text-white shrink-0">
          {vehicleId}
        </div>
        <div>
          <p className="text-sm font-black text-white leading-none">SSF-{vehicleId} · Patrol</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{user?.full_name}</p>
        </div>
        <div className="flex-1" />
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

      {/* Main content — constrained to phone-like width */}
      <div className="w-full max-w-[440px] px-4 py-4 space-y-4">

        {/* ─── Standby state ─── */}
        {!myAlert && (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-3">
              <div className="w-4 h-4 rounded-full bg-green-400 animate-pulse" />
            </div>
            <p className="text-white font-bold text-base">On Duty · Standby</p>
            <p className="text-slate-500 text-sm mt-1">No active dispatch</p>
            <p className="text-slate-600 text-xs mt-0.5">Monitoring zone for SSF-{vehicleId}</p>
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
        {myAlert && isAccepted && (
          <>
            {/* Citizen details card */}
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[myAlert.alert_type]}`}>
                  {ALERT_TYPE_LABELS[myAlert.alert_type] ?? myAlert.alert_type.toUpperCase()}
                </span>
                <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-semibold">
                  ✓ Accepted
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-sm">
                    👤
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">Citizen #{myAlert.citizen_id}</p>
                    <p className="text-slate-500 text-xs">Ananya / Meena / Deepa</p>
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
            </div>

            {/* Message thread */}
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <MessageCircle className="w-3.5 h-3.5" /> Updates to Citizen
              </div>

              {/* Message list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-slate-600 text-xs text-center py-3">No messages yet</p>
                )}
                {messages.map(m => (
                  <div key={m.id} className="flex justify-end">
                    <div className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-2xl rounded-tr-sm max-w-[80%]">
                      <p>{m.body}</p>
                      <p className="text-[10px] text-blue-200 mt-0.5 text-right">{timeAgo(m.created_at)}</p>
                    </div>
                  </div>
                ))}
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
  );
}
