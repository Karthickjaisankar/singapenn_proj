import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api";
import { useAlerts } from "../hooks/useAlerts";
import Map from "../components/Map.tsx";
import AnalyticsPanel from "../components/AnalyticsPanel";
import { Crime, PatrolZone, PatrolVehicle, Venue, ZoneRisk, AlertRow } from "../types";
// ZoneRisk used by routing panel; PatrolZone used by AnalyticsPanel
import { LogOut, Radio, Monitor, Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

// Station list mirrored from Map.tsx for nearest-station lookup
const STATIONS_REF = [
  { name: "Tambaram AWPS",    lat: 12.9398, lng: 80.1323, phone: "044-2226 1001" },
  { name: "Pallavaram AWPS",  lat: 12.9657, lng: 80.1588, phone: "044-2264 2002" },
  { name: "Vandalur AWPS",    lat: 12.9314, lng: 80.1496, phone: "044-2275 3003" },
  { name: "Selaiyur AWPS",    lat: 12.9313, lng: 80.1746, phone: "044-2231 4004" },
  { name: "Semmenchery AWPS", lat: 12.9344, lng: 80.2120, phone: "044-2240 5005" },
  { name: "Kelambakkam AWPS", lat: 12.9132, lng: 80.1903, phone: "044-2274 6006" },
  { name: "Kannagi Nagar",    lat: 12.9487, lng: 80.2112, phone: "044-2231 7007" },
  { name: "Perumpakkam",      lat: 12.9189, lng: 80.1962, phone: "044-2241 8008" },
];

// Must stay in sync with Map.tsx VEHICLE_COLORS
const VEHICLE_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#10b981",
  3: "#a855f7",
  4: "#f59e0b",
};

type ViewTab = "map" | "analytics";

// ── helpers ─────────────────────────────────────────────────────────────────

function alertSeverity(type: string, id?: number): "severe" | "moderate" | "low" {
  const t = type.toLowerCase();
  if (["assault", "rape", "molestation", "abduction", "kidnap", "pocso"].some(k => t.includes(k))) return "severe";
  if (["harassment", "stalking", "threat", "eve"].some(k => t.includes(k))) return "moderate";
  if (t === "sos" && id !== undefined) {
    const cycle: Array<"severe" | "moderate" | "low"> = ["severe", "severe", "moderate", "low", "moderate"];
    return cycle[id % cycle.length];
  }
  if (t === "sos") return "severe";
  return "low";
}

function simulatedPhone(citizenId: number): string {
  const bases = ["9841", "9876", "9894", "9003", "8754", "9566", "7299", "6380"];
  const base = bases[citizenId % bases.length];
  const n = (citizenId * 6271 + 43567) % 1000000;
  const last6 = String(n).padStart(6, "0");
  return `+91 ${base} ${last6.slice(0, 3)} ${last6.slice(3)}`;
}

function caseType(type: string, sev: string): { label: "FIR" | "CSR"; reason: string } {
  if (sev === "severe") return { label: "FIR", reason: "Cognizable offence — FIR mandatory under law" };
  if (["harassment", "stalking"].some(k => type.toLowerCase().includes(k)))
    return { label: "FIR", reason: "Repeated offence risk — FIR recommended" };
  return { label: "CSR", reason: "Non-cognizable — CSR sufficient at this stage" };
}

function nearestStationObj(lat: number, lng: number) {
  let best = STATIONS_REF[0];
  let bestD = Infinity;
  for (const s of STATIONS_REF) {
    const d = Math.hypot(s.lat - lat, s.lng - lng);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function nearestStation(lat: number, lng: number): string {
  return nearestStationObj(lat, lng).name;
}

function vehicleDistanceKm(vLat: number, vLng: number, lat: number, lng: number): number {
  const R = 6371;
  const dLat = (vLat - lat) * Math.PI / 180;
  const dLng = (vLng - lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat * Math.PI / 180) * Math.cos(vLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// If the alert was filed from outside the patrol zone (bad demo GPS), snap to patrol centre
function patrolCoords(lat: number, lng: number): [number, number] {
  if (lat >= 12.70 && lat <= 13.20 && lng >= 79.85 && lng <= 80.40) return [lat, lng];
  return [12.9349, 80.1706]; // Tambaram area centre
}


function toUtcDate(iso: string): Date {
  const utc = iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z";
  return new Date(utc);
}

function isToday(iso: string): boolean {
  return toUtcDate(iso).toDateString() === new Date().toDateString();
}

function sevColor(s: string) {
  if (s === "severe")   return "#dc2626";
  if (s === "moderate") return "#f59e0b";
  return "#22c55e";
}

// ── Elapsed stopwatch ────────────────────────────────────────────────────────

function ElapsedTimer({ iso }: { iso: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - toUtcDate(iso).getTime());

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - toUtcDate(iso).getTime()), 1000);
    return () => clearInterval(id);
  }, [iso]);

  const totalSec = Math.floor(elapsed / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const urgent = totalSec < 600; // < 10 min

  return (
    <span
      className={`font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded ${
        urgent
          ? "bg-red-500/20 text-red-400 animate-pulse"
          : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {hh > 0 ? `${String(hh).padStart(2, "0")}:` : ""}
      {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
    </span>
  );
}

// ── Left stats panel ─────────────────────────────────────────────────────────

function StatsPanel({
  alerts,
  vehicles,
  awpsAssignments,
}: {
  alerts: AlertRow[];
  vehicles: PatrolVehicle[];
  awpsAssignments: Record<number, string>;
}) {
  const today = alerts.filter(a => isToday(a.created_at));
  const total = today.length;

  const sevCounts = today.reduce(
    (acc, a) => { acc[alertSeverity(a.alert_type, a.id)]++; return acc; },
    { severe: 0, moderate: 0, low: 0 }
  );

  const statusCounts = today.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const stationCounts = today.reduce((acc, a) => {
    const s = nearestStation(a.lat, a.lng);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxStation = Math.max(...Object.values(stationCounts), 1);

  return (
    <div className="h-full overflow-y-auto bg-surface-L1 border-r border-border flex flex-col">

      {/* Today count hero */}
      <div className="p-4 border-b border-border bg-gradient-to-b from-blue-600/10 to-transparent">
        <p className="text-[10px] font-bold text-blue-400/70 uppercase tracking-widest mb-1">Today's Complaints</p>
        <div className="flex items-end gap-2">
          <p className="text-5xl font-black leading-none"
            style={{ background: "linear-gradient(135deg,#60a5fa,#818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {total}
          </p>
          <p className="text-xs text-text-muted pb-1">{alerts.length} total</p>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="p-4 border-b border-border">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-3">Severity</p>
        {([
          { label: "Severe",   key: "severe"   as const, color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
          { label: "Moderate", key: "moderate" as const, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
          { label: "Low",      key: "low"      as const, color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
        ]).map(({ label, key, color, bg }) => (
          <div key={key} className="mb-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-xs text-text-secondary flex-1">{label}</span>
              <span
                className="text-sm font-black tabular-nums px-2 py-0.5 rounded-md"
                style={{ color, background: bg }}
              >
                {sevCounts[key]}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: total ? `${(sevCounts[key] / total) * 100}%` : "0%", background: color, opacity: 0.85 }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Status badges */}
      <div className="p-4 border-b border-border">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2.5">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(statusCounts).length === 0 && (
            <p className="text-xs text-text-muted">No complaints today</p>
          )}
          {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
            const dotColor =
              status === "pending"  ? "#ef4444" :
              status === "dispatched" ? "#3b82f6" :
              status === "resolved" ? "#22c55e" : "#94a3b8";
            return (
              <div
                key={status}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface-L2"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                <span className="text-[11px] text-text-secondary capitalize">{status}</span>
                <span className="text-sm font-black text-text-primary tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-station */}
      <div className="p-4 border-b border-border">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2.5">By Station</p>
        <div className="space-y-2">
          {Object.keys(stationCounts).length === 0 && (
            <p className="text-xs text-text-muted">No complaints today</p>
          )}
          {Object.entries(stationCounts).sort((a, b) => b[1] - a[1]).map(([station, count]) => (
            <div key={station}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[11px] text-text-secondary truncate max-w-[145px]" title={station}>{station}</span>
                <span className="text-xs font-black text-text-primary tabular-nums shrink-0 ml-1">{count}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(count / maxStation) * 100}%`, background: "#6366f1", opacity: 0.7 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fleet status */}
      <div className="p-4 border-b border-border">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2.5">Fleet Status</p>
        {vehicles.length === 0 ? (
          <p className="text-xs text-text-muted">No vehicles loaded</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {vehicles.map(v => {
                const idColor = VEHICLE_COLORS[v.id] ?? "#94a3b8";
                const sc =
                  v.status === "responding" ? "#f97316" :
                  v.status === "patrolling" ? "#22c55e" : "#94a3b8";
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-1.5 p-1.5 rounded-lg bg-surface-L2 border"
                    style={{ borderColor: `${idColor}55` }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: idColor, boxShadow: `0 0 4px ${idColor}88` }}
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold leading-none" style={{ color: idColor }}>SSF-{v.id}</p>
                      <p className="text-[9px] capitalize mt-0.5" style={{ color: sc }}>{v.status}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              {[
                { label: "Busy",   color: "#f59e0b", status: "responding" },
                { label: "Patrol", color: "#22c55e", status: "patrolling" },
                { label: "Idle",   color: "#94a3b8", status: "idle" },
              ].map(({ label, color, status }) => (
                <div key={status} className="flex-1 text-center bg-surface-L2 rounded-lg py-1.5">
                  <p className="text-sm font-black tabular-nums" style={{ color }}>
                    {vehicles.filter(v => v.status === status).length}
                  </p>
                  <p className="text-[9px] text-text-muted">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* AWPS assignments */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">AWPS Assigned</p>
          <span className="text-xs font-black text-indigo-400 bg-indigo-500/15 px-1.5 py-0.5 rounded tabular-nums">
            {Object.keys(awpsAssignments).length}
          </span>
        </div>
        {Object.keys(awpsAssignments).length === 0 ? (
          <p className="text-xs text-text-muted">None yet</p>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(
              Object.values(awpsAssignments).reduce((acc, s) => {
                acc[s] = (acc[s] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).sort((a, b) => b[1] - a[1]).map(([station, count]) => (
              <div key={station} className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-text-secondary truncate" title={station}>{station}</span>
                <span className="text-xs font-black text-indigo-400 tabular-nums shrink-0">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Complaint detail card ────────────────────────────────────────────────────

function ComplaintDetail({
  alert,
  onClose,
  vehicles,
  onDispatch,
  onAwpsAssign,
  dispatchedVehicleId,
  isReached,
  onResolve,
}: {
  alert: AlertRow;
  onClose: () => void;
  vehicles: PatrolVehicle[];
  onDispatch: (vehicleId: number, alertId: number, etaMins: number) => void;
  onAwpsAssign: (stationName: string) => void;
  dispatchedVehicleId?: number | null;
  isReached?: boolean;
  onResolve?: () => void;
}) {
  const sev        = alertSeverity(alert.alert_type, alert.id);
  const ct         = caseType(alert.alert_type, sev);
  const stationObj = nearestStationObj(alert.lat, alert.lng);
  const phone      = simulatedPhone(alert.citizen_id);
  const [areaName, setAreaName]   = useState<string | null>(null);
  const [localAssigned, setLocalAssigned] = useState<number | null>(null);
  const [awpsAssigned, setAwpsAssigned] = useState(false);

  // Prefer parent-provided assignment (authoritative) over local optimistic state
  const effectiveAssigned = dispatchedVehicleId ?? localAssigned;

  useEffect(() => {
    setAreaName(null);
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${alert.lat}&lon=${alert.lng}&format=json`
    )
      .then(r => r.json())
      .then(data => {
        const a = data.address ?? {};
        const name =
          a.neighbourhood || a.suburb || a.village || a.town ||
          a.city_district || data.display_name?.split(",")[0] || null;
        setAreaName(name);
      })
      .catch(() => {});
  }, [alert.lat, alert.lng]);

  const [calcLat, calcLng] = patrolCoords(alert.lat, alert.lng);
  const sortedVehicles = [...vehicles]
    .filter(v => v.lat && v.lng)
    .sort((a, b) =>
      vehicleDistanceKm(a.lat, a.lng, calcLat, calcLng) -
      vehicleDistanceKm(b.lat, b.lng, calcLat, calcLng)
    );

  return (
    <div className="bg-surface-L2 border-b border-border p-3">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-black uppercase px-2 py-0.5 rounded"
            style={{ background: `${sevColor(sev)}22`, color: sevColor(sev) }}
          >
            {sev}
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              ct.label === "FIR" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {ct.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-xs px-1.5 py-0.5 rounded hover:bg-surface-L3 transition"
        >
          ✕
        </button>
      </div>

      {/* Alert info */}
      <div className="space-y-1.5">
        <Row label="Alert type"  value={alert.alert_type.toUpperCase()} />
        <Row label="Phone"       value={phone} />
        <Row label="Citizen ID"  value={`#${alert.citizen_id}`} />
        <Row label="Status"      value={alert.status} capitalize />
        <Row label="Case type"   value={ct.label} />
        <Row label="Location"    value={areaName ?? `${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`} />
        <Row label="Raised"      value={toUtcDate(alert.created_at).toLocaleString("en-IN")} />
        {alert.description && <Row label="Description" value={alert.description} />}
        {alert.eta_minutes && <Row label="ETA" value={`${alert.eta_minutes} min`} />}
      </div>

      {/* Legal reason */}
      <div className="mt-3 p-2 rounded-lg bg-surface-L3 border border-border">
        <p className="text-[10px] text-text-muted leading-relaxed">{ct.reason}</p>
      </div>

      {/* Vehicle dispatch */}
      <div className="mt-3">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Assign Vehicle</p>
        <div className="space-y-1.5">
          {sortedVehicles.map((v, i) => {
            const km     = vehicleDistanceKm(v.lat, v.lng, calcLat, calcLng);
            const etaMins = Math.round((km / 30) * 60);
            const busy   = v.status === "responding";
            const isAssigned = effectiveAssigned === v.id;
            const isOnScene  = isAssigned && isReached;

            return (
              <div
                key={v.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${
                  isOnScene
                    ? "border-green-500/40 bg-green-500/8"
                    : isAssigned
                      ? "border-blue-500/40 bg-blue-500/8"
                      : busy
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border bg-surface-L3"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-text-primary">SSF-{v.id}</span>
                    {i === 0 && !isAssigned && (
                      <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-400 font-bold">
                        NEAREST
                      </span>
                    )}
                    {isOnScene && (
                      <span className="text-[9px] px-1 rounded bg-green-500/20 text-green-400 font-bold animate-pulse">
                        ON SCENE ✓
                      </span>
                    )}
                    {isAssigned && !isOnScene && (
                      <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-400 font-bold">
                        DISPATCHED →
                      </span>
                    )}
                    {!isAssigned && busy && (
                      <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400 font-bold">
                        BUSY
                      </span>
                    )}
                    {!isAssigned && (
                      <span className="text-[9px] px-1 rounded bg-surface-L2 text-text-muted capitalize">
                        {v.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted">
                    {km.toFixed(1)} km · ~{etaMins} min ETA
                  </p>
                </div>
                <button
                  onClick={() => { setLocalAssigned(v.id); onDispatch(v.id, alert.id, etaMins); }}
                  disabled={effectiveAssigned !== null}
                  className={`text-[10px] font-bold px-2 py-1 rounded transition shrink-0 ${
                    isAssigned
                      ? "bg-green-600 text-white cursor-default"
                      : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                >
                  {isAssigned ? "Assigned ✓" : "Assign"}
                </button>
              </div>
            );
          })}
          {sortedVehicles.length === 0 && (
            <p className="text-xs text-text-muted">No vehicles available.</p>
          )}
        </div>

        {/* On-scene / resolve banner */}
        {isReached && onResolve && (
          <div className="mt-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
              <span className="text-xs font-bold text-green-400">Vehicle On Scene</span>
            </div>
            <button
              onClick={onResolve}
              className="text-[10px] font-bold px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white transition shrink-0"
            >
              Mark Resolved
            </button>
          </div>
        )}
        {effectiveAssigned !== null && !isReached && (
          <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-blue-400">SSF-{effectiveAssigned} en route…</span>
          </div>
        )}
      </div>

      {/* AWPS assignment */}
      <div className="mt-3">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Assign to AWPS</p>
        <div
          className={`flex items-center gap-2 px-2 py-2 rounded-lg border ${
            awpsAssigned ? "border-indigo-500/30 bg-indigo-500/5" : "border-border bg-surface-L3"
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-text-primary">{stationObj.name}</p>
            <p className="text-[10px] text-blue-400 mt-0.5">{stationObj.phone}</p>
          </div>
          <button
            onClick={() => { setAwpsAssigned(true); onAwpsAssign(stationObj.name); }}
            disabled={awpsAssigned}
            className={`text-[10px] font-bold px-2 py-1 rounded transition shrink-0 ${
              awpsAssigned
                ? "bg-indigo-600 text-white cursor-default"
                : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            }`}
          >
            {awpsAssigned ? "Assigned ✓" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-text-muted shrink-0 w-24">{label}</span>
      <span className={`text-text-secondary font-medium truncate ${capitalize ? "capitalize" : ""}`}>{value}</span>
    </div>
  );
}

// ── Live complaints feed ─────────────────────────────────────────────────────

function ComplaintsFeed({
  alerts,
  selectedId,
  onSelect,
  vehicles,
  onDispatch,
  onAwpsAssign,
  vehicleAssignments,
  reachedVehicleIds,
  onResolve,
}: {
  alerts: AlertRow[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  vehicles: PatrolVehicle[];
  onDispatch: (vehicleId: number, alertId: number, etaMins: number) => void;
  onAwpsAssign: (alertId: number, stationName: string) => void;
  vehicleAssignments: Record<number, number>;
  reachedVehicleIds: Set<number>;
  onResolve: (alertId: number) => void;
}) {
  const sorted = [...alerts].sort((a, b) => b.id - a.id);

  return (
    <div className="h-full flex flex-col bg-surface-L1 border-l border-border">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0 bg-surface-L1">
        <span className="text-sm font-black text-text-primary tracking-tight">Live Complaints</span>
        <span className="flex items-center gap-1 bg-red-500/15 text-red-400 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse inline-block" />
          Live
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {alerts.filter(a => a.status === "pending").length > 0 && (
            <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {alerts.filter(a => a.status === "pending").length} pending
            </span>
          )}
          <span className="text-[10px] text-text-muted tabular-nums">{alerts.length} total</span>
        </div>
      </div>

      {/* Feed — detail expands inline below the clicked row */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="p-4 text-xs text-text-muted">No complaints yet.</p>
        )}
        {sorted.map(alert => {
          const sev = alertSeverity(alert.alert_type, alert.id);
          const isSelected = alert.id === selectedId;
          const todayFlag = isToday(alert.created_at);
          const color = sevColor(sev);
          const statusColor =
            alert.status === "pending"    ? "#ef4444" :
            alert.status === "dispatched" ? "#3b82f6" :
            alert.status === "resolved"   ? "#22c55e" : "#94a3b8";

          // Dispatch / on-scene badge for this row
          const rowDispVid = (Object.keys(vehicleAssignments).map(Number)
            .find(vid => vehicleAssignments[vid] === alert.id)) ?? null;
          const rowReached = rowDispVid !== null && reachedVehicleIds.has(rowDispVid);

          return (
            <div key={alert.id}>
              {/* Row button */}
              <button
                onClick={() => onSelect(isSelected ? null : alert.id)}
                className={`w-full text-left px-3 py-2.5 transition flex items-start gap-0 ${
                  isSelected ? "bg-surface-L2" : "hover:bg-surface-L2/60"
                }`}
                style={{
                  borderLeft: `3px solid ${color}`,
                  borderBottom: isSelected ? "none" : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isSelected
                    ? `inset 0 0 0 1px ${color}30, 0 0 12px ${color}18`
                    : `inset 0 0 0 1px ${color}10`,
                }}
              >
                <div className="min-w-0 flex-1 pl-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-text-primary capitalize">{alert.alert_type}</span>
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
                    >
                      {sev}
                    </span>
                    {todayFlag && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 uppercase border border-indigo-500/20">
                        Today
                      </span>
                    )}
                    {rowReached && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/20">
                        On Scene ✓
                      </span>
                    )}
                    {rowDispVid !== null && !rowReached && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        SSF-{rowDispVid} En Route
                      </span>
                    )}
                    {alert.status === "pending" && rowDispVid === null && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                    )}
                  </div>
                  {alert.description && (
                    <p className="text-xs text-text-primary font-medium mt-1 leading-snug line-clamp-2 italic">"{alert.description}"</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <ElapsedTimer iso={alert.created_at} />
                    <span className="text-[10px] text-text-muted/40">·</span>
                    <span className="text-[10px] font-semibold capitalize" style={{ color: statusColor }}>
                      {alert.status}
                    </span>
                    <span className="text-[10px] text-text-muted/40 ml-auto">#{alert.id}</span>
                  </div>
                </div>
              </button>

              {/* Inline detail — appears directly below the clicked row */}
              {isSelected && (() => {
                const dispVid = (Object.keys(vehicleAssignments).map(Number)
                  .find(vid => vehicleAssignments[vid] === alert.id)) ?? null;
                const alertReached = dispVid !== null && reachedVehicleIds.has(dispVid);
                return (
                  <ComplaintDetail
                    alert={alert}
                    onClose={() => onSelect(null)}
                    vehicles={vehicles}
                    onDispatch={onDispatch}
                    onAwpsAssign={(stationName) => onAwpsAssign(alert.id, stationName)}
                    dispatchedVehicleId={dispVid}
                    isReached={alertReached}
                    onResolve={() => onResolve(alert.id)}
                  />
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Audio tone ───────────────────────────────────────────────────────────────

function playAlertTone() {
  try {
    const ctx = new AudioContext();
    [880, 1100, 880].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  } catch { /* ignore if AudioContext unavailable */ }
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function OfficerDashboard() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { alerts, connected } = useAlerts(user?.token ?? "");
  const seenAlertIdsRef = useRef<Set<number>>(new Set());

  const [activeTab, setActiveTab]       = useState<ViewTab>("map");
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [crimes,   setCrimes]   = useState<Crime[]>([]);
  const [hotspots, setHotspots] = useState<PatrolZone[]>([]);
  const [vehicles, setVehicles] = useState<PatrolVehicle[]>([]);
  const [venues,   setVenues]   = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setZoneRisks] = useState<ZoneRisk[]>([]);
  const [routedVehicles, setRoutedVehicles] = useState<PatrolVehicle[]>([]);
  const [awpsAssignments, setAwpsAssignments] = useState<Record<number, string>>({});
  const [vehicleAssignments, setVehicleAssignments] = useState<Record<number, number>>({});
  const [reachedVehicleIds, setReachedVehicleIds] = useState<Set<number>>(new Set());
  const [incomingToast, setIncomingToast] = useState<{ id: number; type: string; description: string | null } | null>(null);

  // Alert tone + toast + auto-select for any new incoming alert
  useEffect(() => {
    alerts.forEach(a => {
      if (!seenAlertIdsRef.current.has(a.id)) {
        seenAlertIdsRef.current.add(a.id);
        if (!["resolved", "cancelled"].includes(a.status)) {
          playAlertTone();
          setSelectedAlertId(a.id);
          setIncomingToast({ id: a.id, type: a.alert_type, description: a.description });
          setTimeout(() => setIncomingToast(null), 5000);
        }
      }
    });
  }, [alerts]);

  // Load map data
  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const [cr, hr, vr, vn] = await Promise.all([
          api.crimes(), api.hotspots(), api.vehicles(), api.venues(),
        ]);
        setCrimes(cr.crimes);
        setHotspots(hr.hotspots);
        setVehicles(vr.vehicles);
        setVenues(vn.venues);
      } catch { /* ignore */ }
      finally { setIsLoading(false); }
    })();
  }, []);

  const fetchRouting = useCallback(async () => {
    try {
      const hour = new Date().getHours();
      const res  = await api.routing(hour);
      setZoneRisks(res.zone_risks);
      setRoutedVehicles(res.vehicles);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRouting(); }, [fetchRouting]);

  const handleDispatch = useCallback((vehicleId: number, alertId: number, etaMins: number) => {
    // Optimistic local update
    setVehicleAssignments(prev => ({ ...prev, [vehicleId]: alertId }));
    setRoutedVehicles(prev =>
      prev.map(v => v.id === vehicleId ? { ...v, status: "responding" as const } : v)
    );
    setVehicles(prev =>
      prev.map(v => v.id === vehicleId ? { ...v, status: "responding" as const } : v)
    );
    // Persist to backend — triggers alert_updated broadcast → citizen sees "Police is on the way"
    if (user?.token) {
      api.dispatchAlert(user.token, alertId, vehicleId, etaMins).catch(console.error);
    }
  }, [user?.token]);

  const handleVehicleReached = useCallback((vehicleId: number) => {
    setReachedVehicleIds(prev => new Set([...prev, vehicleId]));
  }, []);

  const handleResolveAlert = useCallback((alertId: number) => {
    setVehicleAssignments(prev => {
      const next = { ...prev };
      for (const vid of Object.keys(next).map(Number)) {
        if (next[vid] === alertId) {
          setReachedVehicleIds(r => { const ns = new Set(r); ns.delete(vid); return ns; });
          setRoutedVehicles(rv => rv.map(v => v.id === vid ? { ...v, status: "patrolling" as const } : v));
          setVehicles(vs => vs.map(v => v.id === vid ? { ...v, status: "patrolling" as const } : v));
          delete next[vid];
        }
      }
      return next;
    });
    // Persist to backend — triggers alert_updated broadcast → citizen sees "Police have arrived"
    if (user?.token) {
      api.resolveAlert(user.token, alertId).catch(console.error);
    }
  }, [user?.token]);

  const handleAwpsAssign = useCallback((alertId: number, stationName: string) => {
    setAwpsAssignments(prev => ({ ...prev, [alertId]: stationName }));
  }, []);

  const displayVehicles = routedVehicles.length > 0 ? routedVehicles : vehicles;
  const pendingCount = alerts.filter(a => a.status === "pending").length;

  return (
    <div className="h-screen bg-bg-dark flex flex-col overflow-hidden">

      {/* ── Incoming alert toast ── */}
      {incomingToast && (
        <div
          className="absolute top-14 left-1/2 z-50 -translate-x-1/2 flex items-start gap-3 bg-red-600 text-white px-4 py-3 rounded-2xl shadow-2xl border border-red-400/40 max-w-sm w-[calc(100%-2rem)]"
          style={{ animation: "slideDown 0.25s ease-out" }}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-base">🆘</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-red-200">New Alert — #{incomingToast.id}</p>
            <p className="text-sm font-bold capitalize">{incomingToast.type}</p>
            {incomingToast.description && (
              <p className="text-xs text-red-100 mt-0.5 leading-snug">"{incomingToast.description}"</p>
            )}
          </div>
          <button onClick={() => setIncomingToast(null)} className="text-red-200 hover:text-white text-xs shrink-0 mt-0.5">✕</button>
        </div>
      )}

      {/* ── Slim header ── */}
      <div className="bg-surface-L1 border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-black text-text-primary leading-none">Singapenne · Command Centre</p>
            <p className="text-[10px] text-text-muted mt-0.5">{user?.full_name ?? "Command Centre Officer"}</p>
          </div>
          {/* Live indicator */}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
            connected ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"
          }`}>
            <Radio className="w-3 h-3" />
            {connected ? "LIVE" : "Reconnecting…"}
          </div>
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
              {pendingCount} pending
            </span>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-surface-L2 rounded-lg p-0.5 gap-0.5">
          {([
            { key: "map"       as ViewTab, label: "Live Map View" },
            { key: "analytics" as ViewTab, label: "Live Analytics" },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeTab === t.key
                  ? "bg-blue-600 text-white shadow"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/demo"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Live Demo"
            className="flex items-center gap-1.5 text-text-muted hover:text-blue-400 transition text-xs px-2 py-1 rounded-lg hover:bg-blue-500/10"
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline">Demo</span>
          </a>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-L2 transition"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition text-xs"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "map" ? (
        <div className="flex flex-1 overflow-hidden">

          {/* Left: aggregate stats */}
          <div className="w-[220px] shrink-0 overflow-hidden">
            <StatsPanel alerts={alerts} vehicles={displayVehicles} awpsAssignments={awpsAssignments} />
          </div>

          {/* Center: map */}
          <div className="flex-1 overflow-hidden">
            <Map
              crimes={crimes}
              hotspots={hotspots}
              vehicles={displayVehicles}
              venues={venues}
              isLoading={isLoading}
              venueZoomThreshold={12}
              activeAlerts={alerts.filter(a => !["resolved", "cancelled"].includes(a.status))}
              selectedAlertId={selectedAlertId}
              onResetView={() => setSelectedAlertId(null)}
              vehicleAssignments={vehicleAssignments}
              onVehicleReached={handleVehicleReached}
            />
          </div>

          {/* Right: live complaints feed */}
          <div className="w-[300px] shrink-0 overflow-hidden">
            <ComplaintsFeed
              alerts={alerts}
              selectedId={selectedAlertId}
              onSelect={setSelectedAlertId}
              vehicles={displayVehicles}
              onDispatch={handleDispatch}
              onAwpsAssign={handleAwpsAssign}
              vehicleAssignments={vehicleAssignments}
              reachedVehicleIds={reachedVehicleIds}
              onResolve={handleResolveAlert}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <AnalyticsPanel
            crimes={crimes}
            patrolZones={hotspots}
            vehicles={displayVehicles}
            activeAlerts={alerts.filter(a => !["resolved", "cancelled"].includes(a.status))}
          />
        </div>
      )}
    </div>
  );
}
