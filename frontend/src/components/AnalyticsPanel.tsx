import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, LabelList,
} from "recharts";
import { TrendingUp, Clock, AlertTriangle, Shield, Navigation, Activity, Zap } from "lucide-react";
import { Crime, PatrolZone, PatrolVehicle, AlertRow, AlertType, AlertStatus } from "../types";
import KpiCard from "./KpiCard";

function toUTC(iso: string): Date {
  return new Date(/Z|[+-]\d{2}:/.test(iso) ? iso : iso.replace(" ", "T") + "Z");
}

// ── Simulated current-month constants ────────────────────────────────────────
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

const ALERT_TYPE_COLORS: Record<string, string> = {
  sos:        "#ef4444",
  harassment: "#f59e0b",
  suspicious: "#3b82f6",
  medical:    "#22c55e",
  other:      "#94a3b8",
};

const VEHICLE_COLORS: Record<number, string> = { 1: "#3b82f6", 2: "#10b981", 3: "#a855f7", 4: "#f59e0b" };

// Zone filter config — keywords matched against c.police_station (case-insensitive)
const ZONE_FILTERS = [
  { label: "All Zones",           keywords: [] as string[] },
  { label: "PPV-1 · Tambaram",    keywords: ["tambaram"] },
  { label: "PPV-2 · Pallavaram",  keywords: ["pallavaram"] },
  { label: "PPV-3 · Vandalur",    keywords: ["vandalur", "selaiyur", "perumpakkam"] },
  { label: "PPV-4 · Semmenchery", keywords: ["semmenchery", "kelambakkam", "kannagi"] },
];

// Normalise c.head ("POCSO Rape" → "pocso_rape") to match HEAD_LABELS keys
function normalizeHead(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// ── Demo alert generation (timestamps relative to now) ────────────────────────
function generateDemoAlerts(): AlertRow[] {
  const now = Date.now();
  const ts  = (hoursAgo: number, minutesOffset = 0) =>
    new Date(now - hoursAgo * 3_600_000 - minutesOffset * 60_000)
      .toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const res = (hoursAgo: number, minsLater: number) =>
    new Date(now - hoursAgo * 3_600_000 + minsLater * 60_000)
      .toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

  const row = (
    id: number, type: AlertType, status: AlertStatus, vid: number | null,
    hoursAgo: number, minOffset: number, resolveMins: number | null,
    citizen_name: string,
  ): AlertRow => ({
    id, citizen_id: -id, citizen_name, alert_type: type, description: null,
    lat: 12.93 + Math.sin(id) * 0.01, lng: 80.17 + Math.cos(id) * 0.01,
    status, dispatched_vehicle_id: vid,
    acknowledged_by: vid ? 1 : null, resolved_by: resolveMins !== null ? 1 : null,
    eta_minutes: vid ? 5 + (id % 4) : null,
    created_at: ts(hoursAgo, minOffset),
    updated_at: ts(hoursAgo, minOffset),
    resolved_at: resolveMins !== null ? res(hoursAgo, resolveMins) : null,
  });

  return [
    row(-1,  "harassment",  "resolved",   1, 10, 15, 12, "Ananya Krishnan"),
    row(-2,  "suspicious",  "resolved",   2,  9, 30, 15, "Meena Sundaram"),
    row(-3,  "sos",         "resolved",   1,  8, 45,  8, "Deepa Rajan"),
    row(-4,  "medical",     "resolved",   3,  8, 10, 18, "Priya Velu"),
    row(-5,  "harassment",  "resolved",   4,  7, 50, 14, "Kavitha Nair"),
    row(-6,  "suspicious",  "resolved",   2,  7,  5, 11, "Selvi Pandian"),
    row(-7,  "sos",         "resolved",   1,  6, 30,  9, "Divya Mohan"),
    row(-8,  "harassment",  "resolved",   3,  5, 45, 13, "Sumathi Arjun"),
    row(-9,  "sos",         "resolved",   2,  4, 20, 10, "Radha Suresh"),
    row(-10, "suspicious",  "resolved",   4,  3, 55, 16, "Nithya Prakash"),
    row(-11, "harassment",  "dispatched", 4,  3,  0, null, "Lalitha Ganesh"),
    row(-12, "sos",         "on_scene",   1,  2, 15, null, "Bhavani Raj"),
    row(-13, "harassment",  "dispatched", 2,  1, 40, null, "Usha Mani"),
    row(-14, "suspicious",  "pending",    null, 1, 20, null, "Saranya Kumar"),
    row(-15, "medical",     "pending",    null, 0, 40, null, "Geetha Devi"),
    row(-16, "sos",         "pending",    null, 0, 10, null, "Renuka Balan"),
  ];
}

type LiveWindow = 2 | 6 | 10 | 24;
type HistPeriod = "1w" | "1m" | "6m" | "1y" | "3y" | "All";

function autoWindow(): LiveWindow {
  const h = new Date().getHours();
  if (h < 8) return 24;
  if (h < 15) return 2;
  if (h < 21) return 6;
  return 10;
}

function periodMinYear(p: HistPeriod): number {
  const y = new Date().getFullYear();
  if (p === "1w" || p === "1m") return y;
  if (p === "6m" || p === "1y") return y - 1;
  if (p === "3y") return y - 3;
  return 0;
}

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

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${
        active
          ? "bg-blue-600 text-white"
          : "text-text-muted hover:text-text-primary hover:bg-surface-L2"
      }`}
    >
      {label}
    </button>
  );
}

function WindowBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
        active
          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
          : "text-text-muted border border-transparent hover:border-border"
      }`}
    >
      {label}
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AnalyticsPanelProps {
  crimes: Crime[];
  patrolZones: PatrolZone[];
  vehicles: PatrolVehicle[];
  activeAlerts: AlertRow[];
  token?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyticsPanel({ crimes, patrolZones: _patrolZones, vehicles: _vehicles, activeAlerts, token: _token }: AnalyticsPanelProps) {
  const [analyticsTab, setAnalyticsTab] = useState<"live" | "historical">("live");
  const [liveWindow, setLiveWindow] = useState<LiveWindow>(autoWindow);
  const [period, setPeriod] = useState<HistPeriod>("All");
  const [selectedZone, setSelectedZone] = useState<string>("All Zones");
  const [expandedTimeSlot, setExpandedTimeSlot] = useState<"morning" | "afternoon" | "night" | null>(null);

  // ── Live Analytics ────────────────────────────────────────────────────────

  // Demo alerts are generated once on mount (negative IDs, real alerts always win)
  const demoAlerts = useMemo(() => generateDemoAlerts(), []);

  const windowMs = liveWindow * 3600_000;
  const windowAlerts = useMemo(() => {
    // Merge real + demo, deduplicate by id (real positive IDs override demo negative IDs)
    const realIds = new Set(activeAlerts.map(a => a.id));
    const merged = [...activeAlerts, ...demoAlerts.filter(a => !realIds.has(a.id))];
    return merged.filter(a => Date.now() - toUTC(a.created_at).getTime() <= windowMs);
  }, [activeAlerts, demoAlerts, windowMs]);

  const liveKpis = useMemo(() => ({
    total:      windowAlerts.length,
    pending:    windowAlerts.filter(a => a.status === "pending").length,
    dispatched: windowAlerts.filter(a => a.status === "dispatched").length,
    onScene:    windowAlerts.filter(a => a.status === "on_scene").length,
    resolved:   windowAlerts.filter(a => a.status === "resolved").length,
  }), [windowAlerts]);

  const hourlyData = useMemo(() => {
    const map: Record<number, { hour: string; sos: number; harassment: number; suspicious: number; medical: number; other: number }> = {};
    for (let h = 0; h < 24; h++) {
      map[h] = { hour: `${h}:00`, sos: 0, harassment: 0, suspicious: 0, medical: 0, other: 0 };
    }
    windowAlerts.forEach(a => {
      const h = toUTC(a.created_at).getHours();
      const t = a.alert_type as keyof typeof map[0];
      if (t in map[h]) (map[h] as any)[t]++;
    });
    return Object.values(map);
  }, [windowAlerts]);

  const alertTypeDonut = useMemo(() => {
    const counts: Record<string, number> = { sos: 0, harassment: 0, suspicious: 0, medical: 0, other: 0 };
    windowAlerts.forEach(a => { counts[a.alert_type] = (counts[a.alert_type] ?? 0) + 1; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [windowAlerts]);

  const vehicleDispatch = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    windowAlerts.forEach(a => {
      if (a.dispatched_vehicle_id) counts[a.dispatched_vehicle_id] = (counts[a.dispatched_vehicle_id] ?? 0) + 1;
    });
    return [1, 2, 3, 4].map(id => ({ name: `Patrol ${id}`, count: counts[id] ?? 0, id }));
  }, [windowAlerts]);

  const avgResponseMin = useMemo(() => {
    const resolved = windowAlerts.filter(a => a.status === "resolved" && a.resolved_at);
    if (resolved.length < 3) return null;
    const sum = resolved.reduce((acc, a) => {
      return acc + (toUTC(a.resolved_at!).getTime() - toUTC(a.created_at).getTime()) / 60000;
    }, 0);
    return Math.round(sum / resolved.length);
  }, [windowAlerts]);

  // ── Historical Analytics (filtered crimes) ────────────────────────────────

  const minYear = periodMinYear(period);
  const filteredCrimes = useMemo(
    () => (minYear === 0 ? crimes : crimes.filter(c => c.year >= minYear)),
    [crimes, minYear],
  );

  // Zone-filtered crimes (applied on top of period filter)
  const zoneFilteredCrimes = useMemo(() => {
    const z = ZONE_FILTERS.find(f => f.label === selectedZone);
    if (!z || z.keywords.length === 0) return filteredCrimes;
    return filteredCrimes.filter(c =>
      z.keywords.some(kw => c.police_station.toLowerCase().includes(kw)),
    );
  }, [filteredCrimes, selectedZone]);

  // Reset time slot drill-down when any filter changes
  useEffect(() => { setExpandedTimeSlot(null); }, [selectedZone, period]);

  const escalationData = useMemo(() => {
    const map: Record<string, { year: string; severe: number; moderate: number; low: number; projected: number }> = {};
    ["2022","2023","2024","2025","2026"].forEach(y => {
      map[y] = { year: y, severe: 0, moderate: 0, low: 0, projected: 0 };
    });
    zoneFilteredCrimes.forEach(c => {
      const y = String(c.year);
      if (map[y]) map[y][c.severity]++;
    });
    const actual26 = map["2026"].severe + map["2026"].moderate + map["2026"].low;
    map["2026"].projected = Math.max(0, PROJECTED_2026_FULL - actual26);
    return Object.values(map).filter(row => row.severe + row.moderate + row.low + row.projected > 0)
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [zoneFilteredCrimes]);

  const crimeTypeByYear = useMemo(() => {
    const years = ["2022","2023","2024","2025","2026"];
    return years.map(yr => {
      const row: Record<string, string | number> = { year: yr };
      const yearCrimes = zoneFilteredCrimes.filter(c => String(c.year) === yr);
      yearCrimes.forEach(c => {
        const key = normalizeHead(c.head);
        row[key] = ((row[key] as number) ?? 0) + 1;
      });
      return row;
    }).filter(row => Object.keys(row).length > 1);
  }, [zoneFilteredCrimes]);

  const stationData = useMemo(() => {
    const stationCounts: Record<string, number> = {};
    zoneFilteredCrimes.forEach(c => {
      stationCounts[c.police_station] = (stationCounts[c.police_station] ?? 0) + 1;
    });
    return Object.entries(stationCounts)
      .map(([name, count]) => ({ name: shortStation(name), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [zoneFilteredCrimes]);

  const timeSlotData = useMemo(() => {
    const morning   = zoneFilteredCrimes.filter(c => c.time_slot === "morning").length;
    const afternoon = zoneFilteredCrimes.filter(c => c.time_slot === "afternoon").length;
    const night     = zoneFilteredCrimes.filter(c => c.time_slot === "night").length;
    const known = morning + afternoon + night;
    if (known === 0) return [
      { slot: "Night",     count: 0, pct: 51, color: "#6366f1", key: "night"     as const },
      { slot: "Morning",   count: 0, pct: 25, color: "#f59e0b", key: "morning"   as const },
      { slot: "Afternoon", count: 0, pct: 24, color: "#3b82f6", key: "afternoon" as const },
    ];
    return [
      { slot: "Night",     count: night,     pct: Math.round(night / known * 100),     color: "#6366f1", key: "night"     as const },
      { slot: "Morning",   count: morning,   pct: Math.round(morning / known * 100),   color: "#f59e0b", key: "morning"   as const },
      { slot: "Afternoon", count: afternoon, pct: Math.round(afternoon / known * 100), color: "#3b82f6", key: "afternoon" as const },
    ];
  }, [zoneFilteredCrimes]);

  const unknownTimePct = useMemo(() => {
    const noTime = zoneFilteredCrimes.filter(c => c.time_slot === null).length;
    return zoneFilteredCrimes.length ? Math.round(noTime / zoneFilteredCrimes.length * 100) : 60;
  }, [zoneFilteredCrimes]);

  // 2-hour breakdown for the clicked time slot
  const SLOT_BINS = {
    morning:   [{ label: "06–08", s: 6, e: 8 }, { label: "08–10", s: 8, e: 10 }, { label: "10–12", s: 10, e: 12 }],
    afternoon: [{ label: "12–14", s: 12, e: 14 }, { label: "14–16", s: 14, e: 16 }, { label: "16–18", s: 16, e: 18 }],
    night:     [{ label: "18–20", s: 18, e: 20 }, { label: "20–22", s: 20, e: 22 }, { label: "22–00", s: 22, e: 24 }, { label: "00–02", s: 0, e: 2 }, { label: "02–04", s: 2, e: 4 }, { label: "04–06", s: 4, e: 6 }],
  };
  const hourBreakdownData = useMemo(() => {
    if (!expandedTimeSlot) return [];
    return SLOT_BINS[expandedTimeSlot].map(({ label, s, e }) => ({
      label,
      count: zoneFilteredCrimes.filter(c => c.hour !== null && c.hour >= s && c.hour < e).length,
    }));
  }, [expandedTimeSlot, zoneFilteredCrimes]);

  // Days-to-file histogram from date_of_occurrence → date_of_report
  const daysToFileBins = useMemo(() => {
    const BINS = [
      { label: "0 days", min: 0, max: 1 },
      { label: "1–3 d",  min: 1, max: 4 },
      { label: "4–7 d",  min: 4, max: 8 },
      { label: "8–14 d", min: 8, max: 15 },
      { label: "15–30 d",min: 15, max: 31 },
      { label: "31–90 d",min: 31, max: 91 },
      { label: "90+ d",  min: 91, max: Infinity },
    ];
    const counts = BINS.map(() => 0);
    let total = 0, sumDays = 0;
    zoneFilteredCrimes.forEach(c => {
      if (!c.date_of_occurrence || !c.date_of_report) return;
      const diff = Math.max(0, Math.floor(
        (new Date(c.date_of_report).getTime() - new Date(c.date_of_occurrence).getTime()) / 86400000,
      ));
      total++;
      sumDays += diff;
      const idx = BINS.findIndex(b => diff >= b.min && diff < b.max);
      if (idx >= 0) counts[idx]++;
    });
    return {
      bins: BINS.map((b, i) => ({ label: b.label, count: counts[i] })),
      total,
      avg: total > 0 ? Math.round(sumDays / total) : null,
    };
  }, [zoneFilteredCrimes]);


  const periodLabel = period === "All" ? "2022–2026" :
    period === "3y" ? "2023–2026" :
    period === "1y" ? "2025–2026" :
    period === "6m" ? "Last 6 months" :
    period === "1m" ? "Last month" : "Last week";

  return (
    <div className="h-full flex flex-col bg-bg-dark">
      {/* ── Tab bar (sticky) ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-bg-dark border-b border-border shrink-0">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <TabBtn label="Live Analytics" active={analyticsTab === "live"} onClick={() => setAnalyticsTab("live")} />
          <TabBtn label="Historical Analytics" active={analyticsTab === "historical"} onClick={() => setAnalyticsTab("historical")} />
          <div className="ml-auto flex items-center gap-1.5">
            {analyticsTab === "live" && (
              <>
                <span className="text-[10px] text-text-muted mr-1">Window:</span>
                {([2, 6, 10, 24] as const).map(w => (
                  <WindowBtn key={w} label={w === 24 ? "Full Day" : `${w}h`} active={liveWindow === w} onClick={() => setLiveWindow(w)} />
                ))}
              </>
            )}
            {analyticsTab === "historical" && (
              <>
                <span className="text-[10px] text-text-muted mr-1">Period:</span>
                {(["1w","1m","6m","1y","3y","All"] as const).map(p => (
                  <WindowBtn key={p} label={p} active={period === p} onClick={() => setPeriod(p)} />
                ))}
              </>
            )}
          </div>
        </div>
        {analyticsTab === "historical" && (
          <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-text-muted mr-0.5">Zone:</span>
            {ZONE_FILTERS.map(z => (
              <WindowBtn key={z.label} label={z.label} active={selectedZone === z.label} onClick={() => setSelectedZone(z.label)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="p-4 space-y-4 max-w-5xl mx-auto">

          {/* ══ LIVE ANALYTICS TAB ══════════════════════════════════════════ */}
          {analyticsTab === "live" && (
            <>
              {/* KPI row */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                    Live Ops · Last {liveWindow === 24 ? "24h (Full Day)" : `${liveWindow}h`}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Alerts" value={String(liveKpis.total)} color="blue" dark />
                  <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Pending" value={String(liveKpis.pending)} color="red" dark />
                  <KpiCard icon={<Navigation className="w-4 h-4" />} label="Dispatched" value={String(liveKpis.dispatched)} color="blue" dark />
                  <KpiCard icon={<Shield className="w-4 h-4" />} label="On Scene" value={String(liveKpis.onScene)} color="orange" dark />
                  <KpiCard icon={<Activity className="w-4 h-4" />} label="Resolved" value={String(liveKpis.resolved)} color="green" dark />
                </div>
              </div>

              {/* Hourly bar chart */}
              <ChartCard
                title="Alerts by Hour (Today)"
                icon={<Clock className="w-4 h-4 text-blue-400" />}
                sub={`Distribution of incoming alerts by hour of day — ${liveWindow}h window`}
              >
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={hourlyData} margin={{ top: 0, right: 5, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="hour" tick={{ ...AXIS_TICK, fontSize: 8 }} interval={2} />
                    <YAxis tick={AXIS_TICK} allowDecimals={false} />
                    <Tooltip contentStyle={TT_STYLE} />
                    <Bar dataKey="sos"        stackId="a" fill={ALERT_TYPE_COLORS.sos}        name="SOS" />
                    <Bar dataKey="harassment" stackId="a" fill={ALERT_TYPE_COLORS.harassment} name="Harassment" />
                    <Bar dataKey="suspicious" stackId="a" fill={ALERT_TYPE_COLORS.suspicious} name="Suspicious" />
                    <Bar dataKey="medical"    stackId="a" fill={ALERT_TYPE_COLORS.medical}    name="Medical" />
                    <Bar dataKey="other"      stackId="a" fill={ALERT_TYPE_COLORS.other}      name="Other" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
                {windowAlerts.length === 0 && (
                  <p className="text-center text-xs text-text-muted py-2">No alerts in this window</p>
                )}
              </ChartCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Alert type donut */}
                <ChartCard
                  title="Alert Type Mix"
                  icon={<Shield className="w-4 h-4 text-red-400" />}
                  sub={`${windowAlerts.length} alerts in last ${liveWindow}h`}
                >
                  {alertTypeDonut.length === 0 ? (
                    <p className="text-center text-xs text-text-muted py-6">No alerts yet</p>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={120} height={120}>
                        <PieChart>
                          <Pie data={alertTypeDonut} cx="50%" cy="50%" innerRadius={32} outerRadius={52}
                            dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
                            {alertTypeDonut.map(({ name }) => (
                              <Cell key={name} fill={ALERT_TYPE_COLORS[name] ?? "#94a3b8"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v, "alerts"]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 flex-1 text-[11px]">
                        {alertTypeDonut.map(({ name, value }) => (
                          <div key={name} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ALERT_TYPE_COLORS[name] ?? "#94a3b8" }} />
                            <span className="text-text-secondary capitalize">{name}</span>
                            <span className="font-bold text-text-primary ml-auto">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </ChartCard>

                {/* Per-vehicle dispatch */}
                <ChartCard
                  title="Dispatches by Vehicle"
                  icon={<Navigation className="w-4 h-4 text-blue-400" />}
                  sub={`Alert assignments per Patrol vehicle in last ${liveWindow}h`}
                >
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={vehicleDispatch} layout="vertical" margin={{ top: 0, right: 24, left: 5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" width={50} tick={{ ...AXIS_TICK, fontSize: 10 }} />
                      <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v, "dispatches"]} />
                      <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                        {vehicleDispatch.map(({ id }) => (
                          <Cell key={id} fill={VEHICLE_COLORS[id] ?? "#3b82f6"} />
                        ))}
                        <LabelList dataKey="count" position="right" style={{ fill: "#94a3b8", fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Avg response time */}
              <div className="bg-surface-L1 rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Avg Response Time
                  </p>
                  <p className="text-[11px] text-text-muted mt-0.5">Time from alert raised to resolved</p>
                </div>
                {avgResponseMin !== null ? (
                  <div className="text-right">
                    <p className="text-3xl font-black text-green-400">{avgResponseMin}</p>
                    <p className="text-[10px] text-text-muted">minutes avg</p>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted italic">Insufficient data this window</p>
                )}
              </div>
            </>
          )}

          {/* ══ HISTORICAL ANALYTICS TAB ══════════════════════════════════ */}
          {analyticsTab === "historical" && (
            <>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                  Historical Crime Data · {periodLabel}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-L2 border border-border text-text-muted">
                  {zoneFilteredCrimes.length} crimes
                </span>
                {selectedZone !== "All Zones" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
                    {selectedZone}
                  </span>
                )}
              </div>

              {/* 2. The Escalation Story */}
              <ChartCard
                title={`Crime Escalation — ${periodLabel}`}
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

              {/* 3. Severity donut + Crime type by year */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard
                  title="Severity Breakdown"
                  icon={<Shield className="w-4 h-4 text-red-400" />}
                  sub={`${zoneFilteredCrimes.length} cases · ${periodLabel}`}
                >
                  {(() => {
                    const severe   = zoneFilteredCrimes.filter(c => c.severity === "severe").length;
                    const moderate = zoneFilteredCrimes.filter(c => c.severity === "moderate").length;
                    const low      = zoneFilteredCrimes.filter(c => c.severity === "low").length;
                    const total    = severe + moderate + low || 1;
                    return (
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <ResponsiveContainer width={128} height={128}>
                            <PieChart>
                              <Pie
                                data={[{ name: "Severe", value: severe }, { name: "Moderate", value: moderate }, { name: "Low", value: low }]}
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
                            <span className="text-xl font-black text-red-400">{Math.round(severe / total * 100)}%</span>
                            <span className="text-[9px] text-text-muted">Severe</span>
                          </div>
                        </div>
                        <div className="space-y-2.5 text-[12px] flex-1">
                          {[
                            { label: "Severe",   count: severe,   pct: Math.round(severe / total * 100),   color: "#dc2626" },
                            { label: "Moderate", count: moderate, pct: Math.round(moderate / total * 100), color: "#f59e0b" },
                            { label: "Low",      count: low,      pct: Math.round(low / total * 100),      color: "#22c55e" },
                          ].map(({ label, count, pct, color }) => (
                            <div key={label} className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-text-secondary w-16">{label}</span>
                              <span className="font-bold text-text-primary">{count}</span>
                              <span className="text-text-muted ml-auto">({pct}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </ChartCard>

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

              {/* 4. Station Burden */}
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

              {/* 5. When Crimes Happen — clickable drill-down */}
              <ChartCard
                title="When Crimes Happen"
                icon={<Clock className="w-4 h-4 text-indigo-400" />}
                sub={`Based on ${timeSlotData.reduce((s, d) => s + d.count, 0)} cases with a recorded time-of-occurrence. Click a slot to see 2-hour breakdown.`}
              >
                <div className="space-y-2 mb-1">
                  {timeSlotData.map(({ slot, count, pct, color, key }) => {
                    const isExpanded = expandedTimeSlot === key;
                    return (
                      <div key={slot}>
                        <button
                          className="w-full text-left group"
                          onClick={() => setExpandedTimeSlot(isExpanded ? null : key)}
                        >
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="text-text-secondary group-hover:text-text-primary transition flex items-center gap-1.5">
                              {slot}
                              <span className={`text-[9px] px-1.5 py-0.5 rounded border transition ${
                                isExpanded
                                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                                  : "bg-surface-L2 border-border text-text-muted"
                              }`}>
                                {isExpanded ? "▲ collapse" : "▼ expand"}
                              </span>
                            </span>
                            <span className="font-bold" style={{ color }}>{pct}% · {count} cases</span>
                          </div>
                          <div className="h-2 bg-surface-L2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </button>
                        {isExpanded && hourBreakdownData.length > 0 && (
                          <div className="mt-2 pl-2 border-l-2 border-dashed" style={{ borderColor: color + "60" }}>
                            <p className="text-[9px] text-text-muted mb-1.5 uppercase tracking-widest">2-hour breakdown</p>
                            <ResponsiveContainer width="100%" height={90}>
                              <BarChart data={hourBreakdownData} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                                <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9 }} />
                                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                                <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v, "cases"]} />
                                <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]}>
                                  <LabelList dataKey="count" position="top" style={{ fill: "#94a3b8", fontSize: 9 }} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Insight
                  text="Half of crimes occur at night (18:00–06:00). SSF patrols should reinforce the 18:00–06:00 window, especially in Vandalur and Semmenchery."
                  color="red"
                />
              </ChartCard>

              {/* 6. Incomplete Case Records — days-to-file histogram */}
              <ChartCard
                title="Incomplete Case Records — Days to File FIR"
                icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
                badge={
                  daysToFileBins.avg !== null
                    ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Avg {daysToFileBins.avg} days
                      </span>
                    : undefined
                }
                sub={`${unknownTimePct}% of FIRs missing time of incident. Of the ${daysToFileBins.total} cases with both incident date and report date, distribution of delay is shown below.`}
              >
                {daysToFileBins.total === 0 ? (
                  <div className="flex flex-col items-center justify-center py-4 gap-2">
                    <div className="text-5xl font-black text-amber-400">{unknownTimePct}%</div>
                    <p className="text-[12px] text-text-secondary font-semibold text-center">of FIRs have no time of incident recorded</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={daysToFileBins.bins} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                      <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9 }} />
                      <YAxis tick={AXIS_TICK} allowDecimals={false} />
                      <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v, "cases"]} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {daysToFileBins.bins.map(({ label }) => (
                          <Cell key={label} fill={label === "0 days" ? "#22c55e" : label === "90+ d" ? "#dc2626" : "#f59e0b"} />
                        ))}
                        <LabelList dataKey="count" position="top" style={{ fill: "#94a3b8", fontSize: 9 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <Insight
                  text="POCSO Sec. 19 requires immediate reporting. Delayed filings (90+ days) indicate reluctance, fear, or incomplete station documentation. SSF community presence is designed to reduce this gap."
                  color="amber"
                />
              </ChartCard>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
