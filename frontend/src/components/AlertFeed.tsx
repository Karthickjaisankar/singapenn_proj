import { useState } from "react";
import { AlertRow } from "../types";
import { api } from "../api";
import { MapPin, CheckCircle, Zap, ChevronDown, ChevronUp } from "lucide-react";

interface AlertFeedProps {
  alerts: AlertRow[];
  token: string;
  vehicles: Array<{ id: number; zone_id: number }>;
  onAlertUpdated?: (alert: AlertRow) => void;
}

const ALERT_ICONS: Record<string, string> = {
  sos: "🆘", harassment: "⚠️", suspicious: "👀", medical: "🏥", other: "📢",
};

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  pending:      { dot: "bg-amber-400 animate-pulse", badge: "bg-amber-500/20 text-amber-300 border border-amber-500/30", label: "PENDING" },
  acknowledged: { dot: "bg-blue-400",                badge: "bg-blue-500/20 text-blue-300 border border-blue-500/30",    label: "ACK" },
  dispatched:   { dot: "bg-green-400",               badge: "bg-green-500/20 text-green-300 border border-green-500/30", label: "DISPATCHED" },
  resolved:     { dot: "bg-ink-500",                 badge: "bg-ink-500/10 text-ink-400 border border-ink-500/20",       label: "RESOLVED" },
  cancelled:    { dot: "bg-ink-600",                 badge: "bg-ink-500/10 text-ink-500 border border-ink-500/20",       label: "CANCELLED" },
};

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function AlertFeed({ alerts, token, vehicles, onAlertUpdated }: AlertFeedProps) {
  const [dispatchingId, setDispatchingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dispatchEta, setDispatchEta] = useState<number>(5);
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);

  const handleAcknowledge = async (alertId: number) => {
    try {
      const res = await api.acknowledgeAlert(token, alertId);
      onAlertUpdated?.(res.alert);
    } catch { /* ignore */ }
  };

  const handleDispatch = async (alertId: number) => {
    setDispatchingId(alertId);
    try {
      const res = await api.dispatchAlert(token, alertId, selectedVehicle ?? undefined, dispatchEta);
      onAlertUpdated?.(res.alert);
      setExpandedId(null);
      setSelectedVehicle(null);
      setDispatchEta(5);
    } catch { /* ignore */ }
    finally { setDispatchingId(null); }
  };

  const handleResolve = async (alertId: number) => {
    try {
      const res = await api.resolveAlert(token, alertId);
      onAlertUpdated?.(res.alert);
    } catch { /* ignore */ }
  };

  const unresolved = alerts.filter(a => !["resolved", "cancelled"].includes(a.status));
  const closed = alerts.filter(a => ["resolved", "cancelled"].includes(a.status));

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <span className="text-4xl mb-3">🔔</span>
        <p className="font-semibold text-text-secondary">No alerts</p>
        <p className="text-xs mt-1">Alerts appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {/* Unresolved */}
      {unresolved.map((alert) => {
        const sc = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.pending;
        const isExpanded = expandedId === alert.id;
        const isSOS = alert.alert_type === "sos";

        return (
          <div
            key={alert.id}
            className={`border-b border-border last:border-0 ${isSOS ? "border-l-4 border-l-red-500" : ""}`}
          >
            {/* Row */}
            <div
              className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-L2/50 transition cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : alert.id)}
            >
              <span className="text-lg leading-none mt-0.5 shrink-0">
                {ALERT_ICONS[alert.alert_type] ?? "🔔"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-text-primary capitalize">{alert.alert_type}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sc.badge}`}>
                    {sc.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{alert.lat.toFixed(3)}, {alert.lng.toFixed(3)}</span>
                  <span className="text-border-strong">·</span>
                  <span>{relTime(alert.created_at)}</span>
                </div>
                {alert.description && (
                  <p className="text-xs text-text-secondary mt-1 truncate">{alert.description}</p>
                )}
                {alert.status === "dispatched" && alert.eta_minutes && (
                  <p className="text-xs text-green-400 mt-1 font-medium">ETA {alert.eta_minutes} min</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
              </div>
            </div>

            {/* Expanded actions */}
            {isExpanded && (
              <div className="px-4 pb-4 bg-surface-L2/40 border-t border-border">
                <div className="flex gap-2 pt-3 flex-wrap">
                  {alert.status === "pending" && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Acknowledge
                    </button>
                  )}
                  {alert.status === "acknowledged" && (
                    <button
                      onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 rounded-lg text-xs font-semibold transition"
                    >
                      <Zap className="w-3.5 h-3.5" /> Dispatch
                    </button>
                  )}
                  {alert.status === "dispatched" && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 rounded-lg text-xs font-semibold transition"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
                    </button>
                  )}
                </div>

                {/* Dispatch form (when acknowledged) */}
                {alert.status === "acknowledged" && (
                  <div className="mt-3 p-3 bg-surface-L1 rounded-xl border border-border space-y-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Dispatch vehicle</p>
                    <select
                      value={selectedVehicle ?? ""}
                      onChange={e => setSelectedVehicle(Number(e.target.value) || null)}
                      className="w-full px-2.5 py-2 bg-surface-L2 border border-border text-text-primary rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    >
                      <option value="">Auto-dispatch (nearest)</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>Vehicle {v.id} — Zone {v.zone_id}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-text-muted shrink-0">ETA:</label>
                      <input
                        type="number" min={1} max={30} value={dispatchEta}
                        onChange={e => setDispatchEta(Number(e.target.value))}
                        className="w-20 px-2.5 py-1.5 bg-surface-L2 border border-border text-text-primary rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                      />
                      <span className="text-xs text-text-muted">min</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDispatch(alert.id)}
                        disabled={dispatchingId === alert.id}
                        className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition"
                      >
                        {dispatchingId === alert.id ? "Dispatching…" : "Confirm Dispatch"}
                      </button>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="px-3 py-1.5 border border-border text-text-muted rounded-lg text-xs hover:bg-surface-L2 transition"
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

      {/* Closed alerts */}
      {closed.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Closed ({closed.length})</p>
          </div>
          {closed.map(alert => {
            const sc = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.resolved;
            return (
              <div key={alert.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 opacity-50">
                <span className="text-base leading-none shrink-0">{ALERT_ICONS[alert.alert_type] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-secondary capitalize">{alert.alert_type}</p>
                  <p className="text-[10px] text-text-muted">{relTime(alert.created_at)}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sc.badge}`}>{sc.label}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
