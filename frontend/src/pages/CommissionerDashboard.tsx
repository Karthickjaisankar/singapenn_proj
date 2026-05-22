import { useEffect, useState, useRef } from "react";
import { Sun, Moon, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { api } from "../api";
import { Crime, PatrolZone, PatrolVehicle, AlertRow, CommissionerSummary } from "../types";
import AnalyticsPanel from "../components/AnalyticsPanel";

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: string | number; sub?: string; accent?: "red" | "green" | "amber" | "blue" }) {
  const colors = {
    red:   "border-red-500/30 bg-red-500/5 text-red-400",
    green: "border-green-500/30 bg-green-500/5 text-green-400",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    blue:  "border-blue-500/30 bg-blue-500/5 text-blue-400",
  };
  const cls = accent ? colors[accent] : "border-border bg-surface-L2 text-text-primary";
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [value]);
  return (
    <div className={`flex flex-col justify-between rounded-xl border px-4 py-3 min-w-[130px] flex-1 transition-all duration-300 ${cls} ${flash ? "ring-2 ring-white/20 scale-[1.02]" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-black leading-none">{value}</p>
      {sub && <p className="text-[10px] text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

export default function CommissionerDashboard() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const [summary, setSummary] = useState<CommissionerSummary | null>(null);
  const [crimes, setCrimes] = useState<Crime[]>([]);
  const [patrolZones, setPatrolZones] = useState<PatrolZone[]>([]);
  const [vehicles, setVehicles] = useState<PatrolVehicle[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertRow[]>([]);

  // Load static data once
  useEffect(() => {
    api.crimes().then(r => setCrimes(r.crimes)).catch(() => {});
    api.hotspots().then(r => setPatrolZones(r.hotspots)).catch(() => {});
    api.vehicles().then(r => setVehicles(r.vehicles)).catch(() => {});
  }, []);

  // Poll live KPIs + alerts every 10s
  useEffect(() => {
    if (!user?.token) return;
    const poll = () => {
      api.commissionerSummary(user.token).then(setSummary).catch(() => {});
      api.getAllAlerts(user.token, 200).then(r => setActiveAlerts(r.alerts)).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [user?.token]);

  const rateAccent = !summary
    ? "blue"
    : summary.response_rate_pct >= 80 ? "green"
    : summary.response_rate_pct >= 50 ? "amber"
    : "red";

  return (
    <div className="h-screen bg-bg-dark flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-surface-L1 border-b border-border px-5 py-2.5 flex items-center gap-3 shrink-0">
        <img src="/singapenne-logo.png" alt="" className="h-7 w-7 object-contain"
             onError={e => (e.currentTarget.style.display = "none")} />
        <div>
          <p className="text-sm font-black text-text-primary leading-none">Singapenne · Commissioner's Overview</p>
          <p className="text-[10px] text-text-muted mt-0.5">{user?.full_name ?? "Commissioner"}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-L2 transition"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-red-400 transition px-2 py-1.5 rounded-lg hover:bg-red-500/10"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>

      {/* KPI Strip */}
      <div className="bg-surface-L1 border-b border-border px-5 py-3 flex gap-3 shrink-0 overflow-x-auto">
        <KpiCard
          label="Today's Alerts"
          value={summary?.today_total ?? "—"}
          sub="Total incidents raised"
          accent="blue"
        />
        <KpiCard
          label="Resolved"
          value={summary?.today_resolved ?? "—"}
          sub="Closed today"
          accent="green"
        />
        <KpiCard
          label="Pending"
          value={summary?.today_pending ?? "—"}
          sub="Awaiting dispatch"
          accent={summary && summary.today_pending > 0 ? "red" : "green"}
        />
        <KpiCard
          label="Dispatched"
          value={summary?.today_dispatched ?? "—"}
          sub="Units en route"
          accent="amber"
        />
        <KpiCard
          label="Response Rate"
          value={summary ? `${summary.response_rate_pct}%` : "—"}
          sub="Resolved / total"
          accent={rateAccent}
        />
        <KpiCard
          label="Avg ETA"
          value={summary ? `${summary.avg_eta_minutes} min` : "—"}
          sub="At time of dispatch"
          accent="blue"
        />
      </div>

      {/* Full-width Analytics */}
      <div className="flex-1 overflow-y-auto">
        <AnalyticsPanel
          crimes={crimes}
          patrolZones={patrolZones}
          vehicles={vehicles}
          activeAlerts={activeAlerts}
          token={user?.token}
        />
      </div>
    </div>
  );
}
