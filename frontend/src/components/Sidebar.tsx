import { Crime, PatrolZone, TimeSlot, ZoneRisk, ReportingGapStats } from "../types";
import { ShieldAlert, TrendingUp, TrendingDown, MapPin, Clock, Download, Timer } from "lucide-react";
import { api } from "../api";
import { useEffect, useState } from "react";

interface VenueVisibility {
  school: boolean;
  college: boolean;
  mall: boolean;
  bar: boolean;
  restaurant: boolean;
  hospital: boolean;
}

interface SidebarProps {
  crimes: Crime[];
  hotspots: PatrolZone[];
  timeSlot: TimeSlot;
  setTimeSlot: (slot: TimeSlot) => void;
  venueTypeVisibility: VenueVisibility;
  setVenueTypeVisibility: (v: VenueVisibility) => void;
  zoneRisks?: ZoneRisk[];
  previewHour?: number;
  onShowAnalytics?: () => void;
}

const VENUE_COLORS: Record<string, string> = {
  school: "#3b82f6", college: "#8b5cf6", mall: "#06b6d4",
  bar: "#f97316", restaurant: "#ef4444", hospital: "#10b981",
};

function threatLevel(topRisk: number, totalRisk: number) {
  const share = totalRisk > 0 ? topRisk / totalRisk : 0;
  if (share > 0.85) return { label: "CRITICAL", color: "#dc2626", bg: "bg-red-50", border: "border-red-200", text: "text-red-700" };
  if (share > 0.6)  return { label: "HIGH",     color: "#f97316", bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" };
  if (share > 0.35) return { label: "ELEVATED", color: "#f59e0b", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" };
  return               { label: "MODERATE", color: "#22c55e", bg: "bg-green-50", border: "border-green-200", text: "text-green-700" };
}

function getSlot(hour: number) {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

export default function Sidebar({
  crimes, timeSlot, setTimeSlot,
  venueTypeVisibility, setVenueTypeVisibility,
  zoneRisks = [], previewHour = new Date().getHours(),
  onShowAnalytics,
}: SidebarProps) {
  const [gapStats, setGapStats] = useState<ReportingGapStats | null>(null);
  useEffect(() => {
    api.reportingGap().then(setGapStats).catch(() => {});
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────

  // Year-over-year
  const byYear = crimes.reduce((a, c) => { a[c.year] = (a[c.year] || 0) + 1; return a; }, {} as Record<number, number>);
  const years = Object.keys(byYear).map(Number).sort();
  const latestYear = years[years.length - 1];
  const prevYear   = years[years.length - 2];
  const yoyDelta   = latestYear && prevYear ? byYear[latestYear] - byYear[prevYear] : 0;
  const sparkYears = years.slice(-5);
  const sparkMax   = Math.max(...sparkYears.map(y => byYear[y]), 1);

  // Time-slot distribution (only crimes with known time, hour != 0 proxy for "has time")
  const timedCrimes = crimes.filter(c => c.time_slot);
  const slotCounts  = { morning: 0, afternoon: 0, night: 0 };
  timedCrimes.forEach(c => { if (c.time_slot && c.time_slot in slotCounts) slotCounts[c.time_slot as keyof typeof slotCounts]++; });
  const slotTotal   = slotCounts.morning + slotCounts.afternoon + slotCounts.night || 1;
  const slots = [
    { key: "night",     label: "Night",      icon: "🌙", count: slotCounts.night,     pct: slotCounts.night / slotTotal },
    { key: "afternoon", label: "Afternoon",  icon: "☀️", count: slotCounts.afternoon, pct: slotCounts.afternoon / slotTotal },
    { key: "morning",   label: "Morning",    icon: "🌅", count: slotCounts.morning,   pct: slotCounts.morning / slotTotal },
  ].sort((a, b) => b.pct - a.pct);

  // Top locations by crime count
  const locationMap: Record<string, { count: number; severity: string }> = {};
  crimes.forEach(c => {
    if (!locationMap[c.place_of_crime]) locationMap[c.place_of_crime] = { count: 0, severity: c.severity };
    locationMap[c.place_of_crime].count++;
    if (c.severity === "severe") locationMap[c.place_of_crime].severity = "severe";
    else if (c.severity === "moderate" && locationMap[c.place_of_crime].severity !== "severe")
      locationMap[c.place_of_crime].severity = "moderate";
  });
  const topLocations = Object.entries(locationMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const maxLocCount = topLocations[0]?.[1].count || 1;

  // Threat level from zone risks
  const topZoneRisk = zoneRisks[0];
  const totalAdjRisk = zoneRisks.reduce((s, z) => s + z.adjusted_risk, 0);
  const threat = topZoneRisk ? threatLevel(topZoneRisk.adjusted_risk, totalAdjRisk) : null;

  const currentSlot = getSlot(previewHour);
  const slotLabel = currentSlot === "morning" ? "Morning" : currentSlot === "afternoon" ? "Afternoon" : "Night";

  const severityDot = (s: string) =>
    s === "severe" ? "#dc2626" : s === "moderate" ? "#f59e0b" : "#22c55e";

  return (
    <div className="h-full flex flex-col bg-surface-L1 overflow-y-auto">

      {/* ── THREAT LEVEL ──────────────────────────────────────────────── */}
      {threat && topZoneRisk && (
        <div className="mx-3 mt-3 rounded-xl border p-3 bg-surface-L2 border-border">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" style={{ color: threat.color }} />
              <span className="text-[11px] font-bold tracking-widest" style={{ color: threat.color }}>
                {threat.label}
              </span>
            </div>
            <span className="text-[10px] text-text-muted">{slotLabel} · {String(previewHour).padStart(2,"0")}:00</span>
          </div>
          <p className="text-xs font-semibold text-text-primary">
            Zone {topZoneRisk.zone_id + 1} needs priority coverage
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {Math.round((topZoneRisk.adjusted_risk / totalAdjRisk) * 100)}% of total
            risk concentrated here
          </p>
        </div>
      )}

      {/* ── CRIME PATTERN ─────────────────────────────────────────────── */}
      <div className="mx-3 mt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">When Crimes Happen</span>
        </div>
        <div className="space-y-1.5">
          {slots.map(s => (
            <button
              key={s.key}
              onClick={() => setTimeSlot(s.key === timeSlot ? "all" : s.key as TimeSlot)}
              className={`w-full rounded-lg px-3 py-2 text-left transition border ${
                timeSlot === s.key
                  ? "border-blue-500/40 bg-blue-500/10"
                  : "border-transparent hover:border-border hover:bg-surface-L2"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-primary">{s.icon} {s.label}</span>
                <span className="text-xs font-bold text-text-primary">{s.count} <span className="text-text-muted font-normal">({Math.round(s.pct * 100)}%)</span></span>
              </div>
              <div className="h-1.5 bg-surface-L3 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${s.pct * 100}%`,
                    backgroundColor: s.key === "night" ? "#6366f1" : s.key === "afternoon" ? "#f59e0b" : "#f97316",
                  }}
                />
              </div>
            </button>
          ))}
          <button
            onClick={() => setTimeSlot("all")}
            className={`w-full rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
              timeSlot === "all"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Show all times
          </button>
        </div>
      </div>

      <div className="mx-3 mt-3 border-t border-border" />

      {/* ── TOP HOTSPOTS ──────────────────────────────────────────────── */}
      <div className="mx-3 mt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Top Crime Locations</span>
        </div>
        <div className="space-y-1.5">
          {topLocations.map(([place, { count, severity }], i) => (
            <div key={place} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-text-muted w-4 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-text-primary truncate font-medium">{place}</span>
                  <span className="text-xs font-bold text-text-primary ml-1 shrink-0">{count}</span>
                </div>
                <div className="h-1.5 bg-surface-L3 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / maxLocCount) * 100}%`, backgroundColor: severityDot(severity) }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-3 mt-3 border-t border-border" />

      {/* ── REPORTING GAP MINI-CARD ───────────────────────────────────── */}
      {gapStats && (
        <div className="mx-3 mt-3">
          <button
            onClick={onShowAnalytics}
            className={`w-full rounded-xl border p-3 text-left transition hover:opacity-90 ${
              gapStats.pct_within_7_days < 50
                ? "bg-red-500/10 border-red-500/30"
                : gapStats.pct_within_7_days < 70
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-green-500/10 border-green-500/30"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Timer className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wide">Reporting Lag</span>
            </div>
            <p className="text-base font-bold text-text-primary">Avg {gapStats.mean_gap_days} days</p>
            <p className={`text-[10px] mt-0.5 ${
              gapStats.pct_within_7_days >= 70 ? "text-green-400" : "text-red-400"
            }`}>
              {gapStats.pct_within_7_days}% reported within 7 days
              {gapStats.pct_within_7_days < 70 && " — underreporting risk"}
            </p>
          </button>
        </div>
      )}

      <div className="mx-3 mt-3 border-t border-border" />

      {/* ── YEAR-OVER-YEAR TREND ──────────────────────────────────────── */}
      <div className="mx-3 mt-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Crime Trend</span>
          </div>
          {yoyDelta !== 0 && (
            <div className={`flex items-center gap-0.5 text-[11px] font-bold ${yoyDelta > 0 ? "text-red-600" : "text-green-600"}`}>
              {yoyDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {yoyDelta > 0 ? "+" : ""}{yoyDelta} vs {prevYear}
            </div>
          )}
        </div>
        <div className="flex items-end gap-1 h-12">
          {sparkYears.map(y => {
            const h = Math.round((byYear[y] / sparkMax) * 100);
            const isLatest = y === latestYear;
            return (
              <div key={y} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(h, 8)}%`,
                    backgroundColor: isLatest ? "#dc2626" : "#2e3347",
                    minHeight: "4px",
                  }}
                />
                <span className="text-[9px] text-text-muted">{String(y).slice(2)}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-text-muted mt-1">
          Latest year ({latestYear}): <strong className="text-text-primary">{byYear[latestYear]} crimes</strong>
        </p>
      </div>

      <div className="mx-3 border-t border-border" />

      {/* ── VENUE LAYERS ──────────────────────────────────────────────── */}
      <div className="mx-3 mt-3 mb-3">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Venue Layers</span>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(["school","college","mall","bar","restaurant","hospital"] as const).map(type => (
            <button
              key={type}
              onClick={() => setVenueTypeVisibility({ ...venueTypeVisibility, [type]: !venueTypeVisibility[type] })}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-medium border transition capitalize ${
                venueTypeVisibility[type]
                  ? "border-transparent text-white"
                  : "bg-surface-L2 border-border text-text-muted"
              }`}
              style={venueTypeVisibility[type] ? { backgroundColor: VENUE_COLORS[type] } : {}}
            >
              {type}
            </button>
          ))}
        </div>
        <button
          onClick={() => api.discoverVenues()}
          className="w-full mt-2 py-1.5 rounded-lg border border-dashed border-border-strong text-[10px] text-text-muted hover:border-accent-blue hover:text-blue-400 transition flex items-center justify-center gap-1"
        >
          <Download className="w-3 h-3" /> Refresh venues
        </button>
      </div>
    </div>
  );
}
