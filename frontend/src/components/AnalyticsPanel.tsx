import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, LabelList,
} from "recharts";
import { TrendingUp, Clock, AlertTriangle, Shield, Navigation, Activity, Zap } from "lucide-react";
import { api } from "../api";
import { Crime, Stats, PatrolZone, PatrolVehicle, AlertRow } from "../types";
import KpiCard from "./KpiCard";

// ── Simulated current-month constants ────────────────────────────────────────
// Jan–Apr 2026 monthly avg = 20.5. Projecting full year at that rate.
const SIM_MAY_2026 = 22;
const PROJECTED_2026_FULL = 197;

const GRID_COLOR = "#2e3347";
const AXIS_TICK = { fontSize: 10, fill: "#475569" };
const TT_STYLE = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, color: "#1e293b", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.15)" };

const HEAD_LABELS: Record<string, string> = {
  pocso_rape:           "POCSO Rape",
  pocso_other:          "POCSO Other",
  child_marriage_rape:  "Child Marriage + Rape",
  child_marriage_other: "Child Marriage Other",
  sc_st_rape:           "SC/ST Rape",
  sc_st_other:          "SC/ST Other",
};

function shortStation(name: string): string {
  return name.replace(/^[WT]\d+\s+/, "");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartCard({ title, icon, children, badge, sub }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="bg-surface-L1 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          {icon}{title}
        </h3>
        {badge}
      </div>
      {sub && <p className="text-[11px] text-text-muted mb-3 leading-snug">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Insight({ text, color = "amber" }: { text: string; color?: "amber" | "red" | "blue" | "green" }) {
  const cls = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    red:   "bg-red-500/10 border-red-500/30 text-red-300",
    blue:  "bg-blue-500/10 border-blue-500/30 text-blue-300",
    green: "bg-green-500/10 border-green-500/30 text-green-300",
  }[color];
  return (
    <div className={`mt-3 text-[11px] px-2.5 py-1.5 rounded-lg border leading-snug ${cls}`}>
      {text}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AnalyticsPanelProps {
  crimes: Crime[];
  patrolZones: PatrolZone[];
  vehicles: PatrolVehicle[];
  activeAlerts: AlertRow[];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyticsPanel({ crimes, patrolZones, vehicles, activeAlerts }: AnalyticsPanelProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);

  // ── Section 1 — Live Ops ──────────────────────────────────────────────────
  const pendingAlerts    = activeAlerts.filter(a => a.status === "pending").length;
  const dispatchedAlerts = activeAlerts.filter(a => a.dispatched_vehicle_id !== null).length;
  const respondingCount  = vehicles.filter(v => v.status === "responding").length;

  // ── Section 2 — Escalation story: year × severity (computed from crimes) ──
  const escalationData = useMemo(() => {
    const map: Record<string, { year: string; severe: number; moderate: number; low: number; projected: number }> = {};
    ["2022","2023","2024","2025","2026"].forEach(y => {
      map[y] = { year: y, severe: 0, moderate: 0, low: 0, projected: 0 };
    });
    crimes.forEach(c => {
      const y = String(c.year);
      if (map[y]) map[y][c.severity]++;
    });
    const actual26 = map["2026"].severe + map["2026"].moderate + map["2026"].low;
    map["2026"].projected = Math.max(0, PROJECTED_2026_FULL - actual26);
    return Object.values(map).sort((a, b) => Number(a.year) - Number(b.year));
  }, [crimes]);

  // ── Section 3 — Crime type by year ────────────────────────────────────────
  const crimeTypeByYear = useMemo(() => {
    if (!stats) return [];
    return ["2022","2023","2024","2025","2026"].map(yr => {
      const row: Record<string, string | number> = { year: yr };
      Object.keys(stats.by_head_by_year).forEach(head => {
        row[head] = stats.by_head_by_year[head]?.[yr] ?? 0;
      });
      return row;
    });
  }, [stats]);

  // ── Section 4 — Station burden ────────────────────────────────────────────
  const stationData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_police_station)
      .map(([name, count]) => ({ name: shortStation(name), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [stats]);

  // ── Section 5 — Time of day ───────────────────────────────────────────────
  const timeSlotData = useMemo(() => {
    const s = stats?.by_time_slot ?? { morning: 55, afternoon: 53, night: 112 };
    const known = (s.morning || 0) + (s.afternoon || 0) + (s.night || 0);
    return [
      { slot: "Night",     count: s.night || 0,     pct: known ? Math.round(((s.night || 0) / known) * 100) : 51, color: "#6366f1" },
      { slot: "Morning",   count: s.morning || 0,   pct: known ? Math.round(((s.morning || 0) / known) * 100) : 25, color: "#f59e0b" },
      { slot: "Afternoon", count: s.afternoon || 0, pct: known ? Math.round(((s.afternoon || 0) / known) * 100) : 24, color: "#3b82f6" },
    ];
  }, [stats]);
  const unknownTimePct = stats
    ? Math.round(((stats.by_time_slot.unknown ?? 335) / (crimes.length || 555)) * 100)
    : 60;

  // ── Section 6 — Avg monthly crime rate by year (annualised from by_year) ──
  // by_month only captures ~32% of crimes (those with exact dates).
  // Use by_year totals ÷ months to get true monthly rate per year.
  const monthlyRateTrend = useMemo(() => {
    if (!stats) return [];
    const yearMonths: Record<string, number> = { "2022": 12, "2023": 12, "2024": 12, "2025": 12, "2026": 4 };
    const rows = Object.entries(stats.by_year)
      .filter(([y]) => y >= "2022")
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, total]) => ({
        year,
        rate: Math.round((total / (yearMonths[year] || 12)) * 10) / 10,
        simulated: false,
      }));
    // Simulated May 2026 as a separate marker
    rows.push({ year: "May '26*", rate: SIM_MAY_2026, simulated: true });
    return rows;
  }, [stats]);

  const avg2025 = useMemo(() => {
    if (!stats) return 15.4;
    const total2025 = stats.by_year[2025] ?? stats.by_year["2025" as unknown as number] ?? 185;
    return Math.round((total2025 / 12) * 10) / 10;
  }, [stats]);

  return (
    <div className="h-full overflow-y-auto bg-bg-dark pb-24">
      <div className="p-4 space-y-4 max-w-5xl mx-auto">

        {/* ── 1. Live Ops Today ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">Live Ops Today</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Pending Alerts" value={String(pendingAlerts)} color="red" dark />
            <KpiCard icon={<Navigation className="w-4 h-4" />} label="Dispatched" value={String(dispatchedAlerts)} color="blue" dark />
            <KpiCard icon={<Shield className="w-4 h-4" />} label="Vehicles Responding" value={`${respondingCount} / ${vehicles.length}`} color="green" dark />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Est. Crimes May '26"
              value={String(SIM_MAY_2026)}
              sub="Simulated — based on 2026 trend"
              color="orange"
              dark
            />
          </div>
        </div>

        {/* ── 2. The Escalation Story ────────────────────────────────────── */}
        <ChartCard
          title="Crime Escalation 2022–2026"
          icon={<TrendingUp className="w-4 h-4 text-red-400" />}
          badge={
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              +125% in 3 yrs
            </span>
          }
          sub="72% of all cases are SEVERE. 2026 is on pace for a record 197 crimes. This escalation triggered Government Order dated 10.05.2026 deploying the Singapenne Special Force."
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={escalationData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="year" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TT_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar dataKey="severe"    stackId="a" fill="#dc2626" name="Severe" />
              <Bar dataKey="moderate"  stackId="a" fill="#f59e0b" name="Moderate" />
              <Bar dataKey="low"       stackId="a" fill="#22c55e" name="Low" />
              <Bar dataKey="projected" stackId="a" fill="#475569" name="Projected" opacity={0.4} radius={[3, 3, 0, 0]} />
              <ReferenceLine
                x="2026"
                stroke="#818cf8"
                strokeDasharray="4 2"
                label={{ value: "SSF G.O. ↑", fill: "#a5b4fc", fontSize: 9, position: "insideTopRight" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── 3. Severity donut + Crime type by year ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Severity donut */}
          <ChartCard
            title="Severity Breakdown"
            icon={<Shield className="w-4 h-4 text-red-400" />}
            sub="555 cases across Tambaram subdivision · 2022–2026"
          >
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <ResponsiveContainer width={128} height={128}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Severe",   value: 401 },
                        { name: "Moderate", value: 127 },
                        { name: "Low",      value: 27  },
                      ]}
                      cx="50%" cy="50%" innerRadius={36} outerRadius={56}
                      dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}
                    >
                      <Cell fill="#dc2626" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#22c55e" />
                    </Pie>
                    <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v, "cases"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black text-red-400">72%</span>
                  <span className="text-[9px] text-text-muted">Severe</span>
                </div>
              </div>
              <div className="space-y-2.5 text-[12px] flex-1">
                {[
                  { label: "Severe",   count: 401, pct: 72, color: "#dc2626" },
                  { label: "Moderate", count: 127, pct: 23, color: "#f59e0b" },
                  { label: "Low",      count: 27,  pct: 5,  color: "#22c55e" },
                ].map(({ label, count, pct, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-text-secondary w-16">{label}</span>
                    <span className="font-bold text-text-primary">{count}</span>
                    <span className="text-text-muted ml-auto">({pct}%)</span>
                  </div>
                ))}
                <p className="text-[10px] text-text-muted pt-1.5 border-t border-border leading-snug">
                  Nearly 3 in 4 crimes are<br />severe POCSO offences
                </p>
              </div>
            </div>
          </ChartCard>

          {/* Crime type by year */}
          <ChartCard
            title="Crime Type by Year"
            icon={<Activity className="w-4 h-4 text-orange-400" />}
            sub="POCSO Rape surged +110%: 51 cases (2022) → 107 cases (2025)."
          >
            <ResponsiveContainer width="100%" height={148}>
              <BarChart data={crimeTypeByYear} margin={{ top: 0, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="year" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip
                  contentStyle={TT_STYLE}
                  formatter={(v, name) => [v, HEAD_LABELS[name as string] || name]}
                />
                <Bar dataKey="pocso_rape"          stackId="a" fill="#dc2626" name="pocso_rape" />
                <Bar dataKey="pocso_other"         stackId="a" fill="#f97316" name="pocso_other" />
                <Bar dataKey="child_marriage_rape" stackId="a" fill="#f59e0b" name="child_marriage_rape" />
                <Bar dataKey="sc_st_rape"          stackId="a" fill="#a855f7" name="sc_st_rape" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight
              text="Child marriage + rape: near-zero (1/yr) → 11 cases (2024) → 14 cases (2025). New pattern requires urgent targeted intervention."
              color="amber"
            />
          </ChartCard>
        </div>

        {/* ── 4. Station Burden ──────────────────────────────────────────── */}
        <ChartCard
          title="AWPS Station Case Burden"
          icon={<Shield className="w-4 h-4 text-blue-400" />}
          badge={
            <div className="flex gap-2 text-[10px]">
              <span className="bg-surface-L2 border border-border px-2 py-0.5 rounded-full text-text-secondary">Pallikaranai 299</span>
              <span className="bg-surface-L2 border border-border px-2 py-0.5 rounded-full text-text-secondary">Tambaram 256</span>
            </div>
          }
          sub="Vandalur AWPS handles 1 in 5 crimes across the entire subdivision — the highest single-station burden."
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stationData} layout="vertical" margin={{ top: 0, right: 44, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis type="number" tick={AXIS_TICK} />
              <YAxis dataKey="name" type="category" width={106} tick={{ ...AXIS_TICK, fontSize: 9 }} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v, "cases"]} />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                {stationData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#dc2626" : "#3b82f6"} />
                ))}
                <LabelList dataKey="count" position="right" style={{ fill: "#94a3b8", fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── 5. Time of day + Data quality ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Time slot distribution */}
          <ChartCard
            title="When Crimes Happen"
            icon={<Clock className="w-4 h-4 text-indigo-400" />}
            sub="Based on 220 cases with a recorded time-of-occurrence (40% of total)."
          >
            <div className="space-y-3 mb-1">
              {timeSlotData.map(({ slot, count, pct, color }) => (
                <div key={slot}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-text-secondary">{slot}</span>
                    <span className="font-bold" style={{ color }}>{pct}% · {count} cases</span>
                  </div>
                  <div className="h-2 bg-surface-L2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Insight
              text="Half of crimes occur at night (18:00–06:00). SSF patrols should reinforce the 18:00–06:00 window, especially in Vandalur and Semmenchery."
              color="red"
            />
          </ChartCard>

          {/* Data quality / under-reporting alert */}
          <ChartCard
            title="Incomplete Case Records"
            icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
            sub="60% of FIRs are missing the time of incident — this limits SSF's ability to schedule patrols when crimes actually happen."
          >
            <div className="flex flex-col items-center justify-center py-3 gap-2">
              <div className="text-5xl font-black text-amber-400">{unknownTimePct}%</div>
              <p className="text-center text-[12px] text-text-secondary font-semibold">
                of FIRs have no time of incident recorded
              </p>
              <p className="text-center text-[10px] text-text-muted max-w-[220px] leading-relaxed">
                Out of 555 cases, 335 were filed without a time. Common causes: delayed reporting, reluctance to disclose, and incomplete station documentation.
              </p>
            </div>
            <Insight
              text="POCSO Sec. 19 requires anyone with knowledge of an offence to report it immediately. SSF's presence in communities is designed to make timely reporting safer."
              color="amber"
            />
          </ChartCard>
        </div>

        {/* ── 6. Avg Monthly Crime Rate by Year ─────────────────────────── */}
        <ChartCard
          title="Monthly Crime Rate — Year-on-Year"
          icon={<Zap className="w-4 h-4 text-yellow-400" />}
          badge={
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
              +33% vs 2025
            </span>
          }
          sub={`Annualised average crimes/month: 2025 avg ${avg2025}, 2026 avg 20.5 (Jan–Apr), May 2026 (*) simulated. Full-year projection: ${PROJECTED_2026_FULL} crimes.`}
        >
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={monthlyRateTrend} margin={{ top: 5, right: 20, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="year" tick={{ ...AXIS_TICK, fontSize: 9 }} />
              <YAxis tick={AXIS_TICK} domain={[0, 30]} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v) => [`${v} crimes/month`, "Avg rate"]} />
              <ReferenceLine
                y={avg2025}
                stroke="#475569"
                strokeDasharray="4 2"
                label={{ value: `2025: ${avg2025}/mo`, fill: "#64748b", fontSize: 9, position: "right" }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isSim = payload.simulated;
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx} cy={cy} r={isSim ? 5 : 3}
                      fill={isSim ? "#f59e0b" : "#3b82f6"}
                      stroke={isSim ? "#fbbf24" : "#3b82f6"}
                      strokeWidth={isSim ? 2 : 0}
                    />
                  );
                }}
                name="Avg crimes/month"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── 7. SSF Patrol Zone Summary ────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
              SSF Patrol Zone Summary
            </span>
          </div>
          <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
            Each zone shows its risk score (150+ high · 80–150 medium · &lt;80 low), the time of day when crimes peak (highlighted pill = patrol priority window), and the top crime location to watch.
          </p>
          {patrolZones.length === 0 ? (
            <p className="text-[11px] text-text-muted text-center py-4">Loading zone data…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {patrolZones.map((zone) => {
                const riskColor =
                  zone.risk_score > 150 ? "#dc2626" :
                  zone.risk_score > 80  ? "#f59e0b" : "#22c55e";
                const ts = zone.time_slot_risks;
                const slots: Array<"morning" | "afternoon" | "night"> = ["morning","afternoon","night"];
                const slotLabels: Record<string, string> = { morning: "Morning 6–12", afternoon: "Afternoon 12–18", night: "Night 18–6" };
                const dominantSlot = [...slots].sort((a, b) => (ts[b] || 0) - (ts[a] || 0))[0];
                return (
                  <div key={zone.zone_id} className="bg-surface-L1 rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-bold text-text-primary">Zone {zone.zone_id + 1}</p>
                        <p className="text-[10px] text-text-muted">
                          {zone.crime_count} crimes · recency {Math.round(zone.recency_score * 100)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black leading-none" style={{ color: riskColor }}>
                          {Math.round(zone.risk_score)}
                        </p>
                        <p className="text-[9px] text-text-muted">risk score</p>
                      </div>
                    </div>

                    {/* Time slot pills */}
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {(["morning","afternoon","night"] as const).map(slot => (
                        <span
                          key={slot}
                          className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                            dominantSlot === slot
                              ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                              : "bg-surface-L2 border-border text-text-muted"
                          }`}
                        >
                          {slotLabels[slot]} {Math.round((ts[slot] || 0) * 100)}%
                        </span>
                      ))}
                    </div>

                    {/* Top hotspot */}
                    {zone.top_spots[0] && (
                      <p className="text-[10px] text-text-secondary truncate">
                        Top spot: <span className="text-text-primary font-medium">{zone.top_spots[0].place}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
