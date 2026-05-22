import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import { api } from "../api";
import { PatrolTrackPoint } from "../types";
import { Navigation, Clock, MapPin, Phone, User, ShieldCheck, Users } from "lucide-react";

const VEHICLE_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#10b981",
  3: "#a855f7",
  4: "#f59e0b",
};

// All personnel per patrol vehicle
const PATROL_PERSONNEL: Record<number, { name: string; rank: string; phone: string }[]> = {
  1: [
    { name: "HC Ravi Kumar",      rank: "Head Constable", phone: "9841000021" },
    { name: "Const. Divya Priya", rank: "Constable",      phone: "9841000025" },
    { name: "Const. Suresh Babu", rank: "Constable",      phone: "9841000029" },
  ],
  2: [
    { name: "HC Kavitha Devi",     rank: "Head Constable", phone: "9841000022" },
    { name: "Const. Selvi Lakshmi",rank: "Constable",      phone: "9841000026" },
    { name: "Const. Priya Rajan",  rank: "Constable",      phone: "9841000030" },
  ],
  3: [
    { name: "ASI Arjun Singh",     rank: "ASI",            phone: "9841000023" },
    { name: "Const. Meenakshi R",  rank: "Constable",      phone: "9841000027" },
  ],
  4: [
    { name: "Const. Meena Rani",   rank: "Constable",      phone: "9841000024" },
    { name: "Const. Vasantha D",   rank: "Constable",      phone: "9841000028" },
    { name: "Const. Anitha Kumar", rank: "Constable",      phone: "9841000031" },
  ],
};

type CrimeType = "Harassment" | "Suspicious Activity" | "SOS" | "Medical Emergency";
type ReportOutcome = "DSR" | "CSR";

interface ComplaintRecord {
  id: string;
  type: CrimeType;
  outcome: ReportOutcome;
  area: string;
  time: string;
}

// Simulated complaints attended per vehicle today
const PATROL_COMPLAINTS: Record<number, ComplaintRecord[]> = {
  1: [
    { id: "A-201", type: "Suspicious Activity", outcome: "DSR", area: "Vandalur Junction",    time: "08:45 am" },
    { id: "A-204", type: "Harassment",           outcome: "CSR", area: "Mudichur Bus Stop",    time: "10:20 am" },
    { id: "A-211", type: "Suspicious Activity",  outcome: "DSR", area: "GST Road, Vandalur",   time: "01:15 pm" },
  ],
  2: [
    { id: "A-202", type: "SOS",               outcome: "CSR", area: "Meenambakkam Metro",   time: "09:10 am" },
    { id: "A-207", type: "Harassment",        outcome: "DSR", area: "Pallavaram Market",     time: "11:40 am" },
    { id: "A-215", type: "Medical Emergency", outcome: "DSR", area: "Tirusulam Junction",    time: "02:55 pm" },
  ],
  3: [
    { id: "A-203", type: "Harassment", outcome: "CSR", area: "Perungalathur Main Rd", time: "09:30 am" },
    { id: "A-209", type: "SOS",        outcome: "CSR", area: "Chromepet Tank Road",   time: "12:15 pm" },
  ],
  4: [
    { id: "A-205", type: "Suspicious Activity", outcome: "DSR", area: "Semmenchery Nagar",    time: "08:55 am" },
    { id: "A-208", type: "Harassment",          outcome: "CSR", area: "Semmenchery East",      time: "11:00 am" },
    { id: "A-213", type: "SOS",                 outcome: "CSR", area: "Okkiyam Thoraipakkam",  time: "01:50 pm" },
    { id: "A-217", type: "Suspicious Activity", outcome: "DSR", area: "Perungudi Main Road",   time: "03:30 pm" },
  ],
};

// Named hotspot locations per vehicle — derived from seed data stop coordinates
const HOTSPOT_NAMES: Record<number, string[]> = {
  1: ["Vandalur Zoo Gate", "Mudichur Road Junction"],
  2: ["Tirusulam Signal", "Pallavaram Flyover"],
  3: ["Chromepet Railway Crossing", "Perungalathur Police Outpost"],
  4: ["Semmenchery Bus Terminus", "Thoraipakkam OMR Junction"],
};

const CRIME_TYPE_COLORS: Record<CrimeType, string> = {
  "Harassment":           "#ef4444",
  "Suspicious Activity":  "#f59e0b",
  "SOS":                  "#3b82f6",
  "Medical Emergency":    "#10b981",
};

const MAP_CENTER: [number, number] = [12.9349, 80.1706];
const MAX_JUMP_KM = 2.0;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Hotspot {
  lat: number;
  lng: number;
  durationMin: number;
  startTime: string;
  name: string;
}

interface TrailStats {
  distanceKm: number;
  patrollingMin: number;
  hotspots: Hotspot[];
}

function computeStats(pts: PatrolTrackPoint[], vehicleId: number): TrailStats {
  if (pts.length < 2) return { distanceKm: 0, patrollingMin: 0, hotspots: [] };

  const sorted = [...pts].sort(
    (a, b) =>
      new Date((/Z|[+-]\d{2}:/.test(a.recorded_at) ? a.recorded_at : a.recorded_at.replace(" ", "T") + "Z")).getTime() -
      new Date((/Z|[+-]\d{2}:/.test(b.recorded_at) ? b.recorded_at : b.recorded_at.replace(" ", "T") + "Z")).getTime()
  );

  let distanceKm = 0;
  for (let i = 1; i < sorted.length; i++) {
    const d = haversine(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    if (d < MAX_JUMP_KM) distanceKm += d;
  }

  const toMs = (s: string) =>
    new Date(/Z|[+-]\d{2}:/.test(s) ? s : s.replace(" ", "T") + "Z").getTime();

  const patrollingMin = Math.round((toMs(sorted[sorted.length - 1].recorded_at) - toMs(sorted[0].recorded_at)) / 60000);

  const LOOKBACK_MS = 30 * 60 * 1000;
  const STOP_RADIUS_KM = 0.15;
  const hotspots: Hotspot[] = [];
  const names = HOTSPOT_NAMES[vehicleId] ?? [];
  let stopStartIdx = 0;
  let inStop = false;
  let stopLats: number[] = [];
  let stopLngs: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tNow = toMs(sorted[i].recorded_at);
    let refIdx = i;
    while (refIdx > 0 && tNow - toMs(sorted[refIdx].recorded_at) < LOOKBACK_MS) refIdx--;
    if (refIdx === i) continue;
    const d = haversine(sorted[refIdx].lat, sorted[refIdx].lng, sorted[i].lat, sorted[i].lng);
    const isStopped = d < STOP_RADIUS_KM;

    if (isStopped && !inStop) {
      inStop = true;
      stopStartIdx = refIdx;
      stopLats = [sorted[i].lat];
      stopLngs = [sorted[i].lng];
    } else if (isStopped && inStop) {
      stopLats.push(sorted[i].lat);
      stopLngs.push(sorted[i].lng);
    } else if (!isStopped && inStop) {
      const durationMin = Math.round((toMs(sorted[i - 1].recorded_at) - toMs(sorted[stopStartIdx].recorded_at)) / 60000);
      if (durationMin >= 30) {
        const idx = hotspots.length;
        hotspots.push({
          lat: stopLats.reduce((s, v) => s + v, 0) / stopLats.length,
          lng: stopLngs.reduce((s, v) => s + v, 0) / stopLngs.length,
          durationMin,
          startTime: sorted[stopStartIdx].recorded_at,
          name: names[idx] ?? `Area ${idx + 1}`,
        });
      }
      inStop = false;
      stopLats = [];
      stopLngs = [];
    }
  }
  if (inStop && stopLats.length > 0) {
    const durationMin = Math.round((toMs(sorted[sorted.length - 1].recorded_at) - toMs(sorted[stopStartIdx].recorded_at)) / 60000);
    if (durationMin >= 30) {
      const idx = hotspots.length;
      hotspots.push({
        lat: stopLats.reduce((s, v) => s + v, 0) / stopLats.length,
        lng: stopLngs.reduce((s, v) => s + v, 0) / stopLngs.length,
        durationMin,
        startTime: sorted[stopStartIdx].recorded_at,
        name: names[idx] ?? `Area ${idx + 1}`,
      });
    }
  }

  return { distanceKm: Math.round(distanceKm * 10) / 10, patrollingMin, hotspots };
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function fmtTime(iso: string): string {
  const utc = /Z|[+-]\d{2}:/.test(iso) ? iso : iso.replace(" ", "T") + "Z";
  return new Date(utc).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

interface Props {
  token: string;
}

export default function PatrolTrailsView({ token }: Props) {
  const [selectedVehicle, setSelectedVehicle] = useState<1 | 2 | 3 | 4>(1);
  const [tracks, setTracks] = useState<Record<number, PatrolTrackPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<L.Polyline[]>([]);
  const hotspotLayersRef = useRef<L.CircleMarker[]>([]);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    setLoading(true);
    api.allPatrolTracks(token)
      .then(d => setTracks(d.tracks ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = L.map(mapContainerRef.current, { center: MAP_CENTER, zoom: 13 });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(mapRef.current);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    trailRef.current.forEach(l => mapRef.current!.removeLayer(l));
    trailRef.current = [];
    hotspotLayersRef.current.forEach(l => mapRef.current!.removeLayer(l));
    hotspotLayersRef.current = [];
    startMarkerRef.current && mapRef.current.removeLayer(startMarkerRef.current);
    endMarkerRef.current && mapRef.current.removeLayer(endMarkerRef.current);

    const pts = tracks[selectedVehicle];
    if (!pts || pts.length === 0) return;

    const color = VEHICLE_COLORS[selectedVehicle] ?? "#ec4899";
    const sorted = [...pts].sort(
      (a, b) =>
        new Date((/Z|[+-]\d{2}:/.test(a.recorded_at) ? a.recorded_at : a.recorded_at.replace(" ", "T") + "Z")).getTime() -
        new Date((/Z|[+-]\d{2}:/.test(b.recorded_at) ? b.recorded_at : b.recorded_at.replace(" ", "T") + "Z")).getTime()
    );

    const allSegments: { pts: [number, number][]; endIdx: number }[] = [];
    let segment: [number, number][] = [[sorted[0].lat, sorted[0].lng]];
    for (let i = 1; i < sorted.length; i++) {
      const d = haversine(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
      if (d > MAX_JUMP_KM) {
        if (segment.length > 1) allSegments.push({ pts: [...segment], endIdx: i - 1 });
        segment = [[sorted[i].lat, sorted[i].lng]];
      } else {
        segment.push([sorted[i].lat, sorted[i].lng]);
      }
    }
    if (segment.length > 1) allSegments.push({ pts: segment, endIdx: sorted.length - 1 });

    const mainSeg = allSegments.reduce((a, b) => a.pts.length >= b.pts.length ? a : b, { pts: [], endIdx: 0 });
    allSegments.forEach(s => {
      const isMain = s === mainSeg;
      if (s.pts.length > 1) {
        const poly = L.polyline(s.pts, { color, weight: isMain ? 3 : 2, opacity: isMain ? 0.85 : 0.35 }).addTo(mapRef.current!);
        trailRef.current.push(poly);
      }
    });
    const lastValidPoint = mainSeg.pts.length > 0 ? sorted[mainSeg.endIdx] : sorted[0];

    startMarkerRef.current = L.circleMarker([sorted[0].lat, sorted[0].lng], {
      radius: 7, fillColor: "#22c55e", fillOpacity: 1, color: "#fff", weight: 2,
    }).addTo(mapRef.current).bindTooltip("Shift start", { direction: "top" });

    const personnel = PATROL_PERSONNEL[selectedVehicle] ?? [];
    endMarkerRef.current = L.circleMarker([lastValidPoint.lat, lastValidPoint.lng], {
      radius: 8, fillColor: color, fillOpacity: 1, color: "#fff", weight: 2,
    }).addTo(mapRef.current).bindPopup(`
      <div style="min-width:200px;font-size:12px">
        <div style="font-weight:700;color:${color};font-size:13px;margin-bottom:8px">Patrol ${selectedVehicle}</div>
        <div style="color:#94a3b8;line-height:2">
          ${personnel.map(p => `<div>👮 ${p.name} · <span style="color:#64748b">${p.rank}</span></div>`).join("")}
          <div style="margin-top:4px">⏱ Last seen: ${fmtTime(lastValidPoint.recorded_at)}</div>
        </div>
      </div>
    `);

    // Hotspot circles with area names
    const { hotspots } = computeStats(pts, selectedVehicle);
    hotspots.forEach((hs, idx) => {
      const cm = L.circleMarker([hs.lat, hs.lng], {
        radius: 20,
        fillColor: "#f59e0b",
        fillOpacity: 0.18,
        color: "#f59e0b",
        weight: 2.5,
      })
        .addTo(mapRef.current!)
        .bindTooltip(hs.name, { permanent: true, className: "hotspot-label", direction: "top", offset: [0, -18] })
        .bindPopup(
          `<div style="font-size:12px">
            <div style="font-weight:700;color:#f59e0b;font-size:13px">${hs.name}</div>
            <div style="color:#94a3b8;margin-top:6px;line-height:1.8">
              <div>⏱ Stationary for ${fmtDuration(hs.durationMin)}</div>
              <div>🕐 From ${fmtTime(hs.startTime)}</div>
              <div style="margin-top:4px;font-size:10px;color:#64748b">Stop #${idx + 1} of shift</div>
            </div>
          </div>`
        );
      hotspotLayersRef.current.push(cm);
    });

    if (mainSeg.pts.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(mainSeg.pts).pad(0.2));
    }
  }, [tracks, selectedVehicle]);

  const stats = useMemo(() => {
    const pts = tracks[selectedVehicle];
    if (!pts) return null;
    return computeStats(pts, selectedVehicle);
  }, [tracks, selectedVehicle]);

  const color = VEHICLE_COLORS[selectedVehicle];
  const personnel = PATROL_PERSONNEL[selectedVehicle] ?? [];
  const complaints = PATROL_COMPLAINTS[selectedVehicle] ?? [];
  const dsrCount = complaints.filter(c => c.outcome === "DSR").length;
  const csrCount = complaints.filter(c => c.outcome === "CSR").length;

  // Crime type breakdown
  const crimeBreakdown = complaints.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-bg-dark overflow-hidden">
      {/* Vehicle selector bar */}
      <div className="bg-surface-L1 border-b border-border px-5 py-3 flex items-center gap-3 shrink-0">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Select Patrol</span>
        <div className="flex items-center bg-surface-L2 rounded-lg p-0.5 gap-0.5">
          {([1, 2, 3, 4] as const).map(id => (
            <button
              key={id}
              onClick={() => setSelectedVehicle(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                selectedVehicle === id ? "text-white shadow" : "text-text-secondary hover:text-text-primary"
              }`}
              style={selectedVehicle === id ? { background: VEHICLE_COLORS[id] } : undefined}
            >
              Patrol {id}
            </button>
          ))}
        </div>
        {loading && (
          <span className="text-[11px] text-text-muted ml-2 flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
            Loading trails…
          </span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-[10px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-1.5 rounded-full" style={{ background: color }} />
            <span>Patrol route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "#f59e0b", opacity: 0.7 }} />
            <span>Stationary area</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Shift start</span>
          </div>
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 overflow-hidden relative">
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>

        {/* Analytics sidebar */}
        <div className="w-[300px] shrink-0 bg-surface-L1 border-l border-border overflow-y-auto">

          {/* Vehicle + Personnel header */}
          <div className="px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: color }} />
              <span className="text-sm font-black text-text-primary">Patrol {selectedVehicle}</span>
              <span className="ml-auto text-[10px] font-bold text-text-muted bg-surface-L2 px-2 py-0.5 rounded-full border border-border">
                {personnel.length} on duty
              </span>
            </div>
            <div className="space-y-1.5">
              {personnel.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-surface-L2 border border-border flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-text-primary truncate">{p.name}</p>
                    <p className="text-[9px] text-text-muted">{p.rank}</p>
                  </div>
                  <a href={`tel:${p.phone}`} className="flex items-center gap-1 text-[9px] text-text-muted hover:text-blue-400 transition">
                    <Phone className="w-2.5 h-2.5" />
                    {p.phone}
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* KPI grid */}
          <div className="px-4 py-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-L2 border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Navigation className="w-3 h-3 text-blue-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Distance</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">{stats?.distanceKm ?? "—"}</p>
              <p className="text-[10px] text-text-muted">km today</p>
            </div>
            <div className="rounded-xl bg-surface-L2 border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">On Duty</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">
                {stats ? fmtDuration(stats.patrollingMin) : "—"}
              </p>
              <p className="text-[10px] text-text-muted">hours active</p>
            </div>
            <div className="rounded-xl bg-surface-L2 border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Users className="w-3 h-3 text-violet-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Personnel</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">{personnel.length}</p>
              <p className="text-[10px] text-text-muted">officers on duty</p>
            </div>
            <div className="rounded-xl bg-surface-L2 border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Complaints</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">{complaints.length}</p>
              <p className="text-[10px] text-text-muted">attended today</p>
            </div>
          </div>

          {/* DSR / CSR summary */}
          <div className="px-4 pb-3">
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-blue-500/5 border border-blue-500/20 px-3 py-2.5 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-1">DSR Filed</p>
                <p className="text-2xl font-black text-blue-300 tabular-nums">{dsrCount}</p>
                <p className="text-[9px] text-text-muted mt-0.5">No crime found</p>
              </div>
              <div className="flex-1 rounded-xl bg-red-500/5 border border-red-500/20 px-3 py-2.5 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-red-400 mb-1">CSR Filed</p>
                <p className="text-2xl font-black text-red-300 tabular-nums">{csrCount}</p>
                <p className="text-[9px] text-text-muted mt-0.5">Crime confirmed</p>
              </div>
            </div>
          </div>

          {/* Crime types */}
          {Object.keys(crimeBreakdown).length > 0 && (
            <div className="px-4 pb-3 border-t border-border pt-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Crime Types Attended</p>
              <div className="space-y-1.5">
                {(Object.entries(crimeBreakdown) as [CrimeType, number][]).map(([type, count]) => {
                  const pct = Math.round((count / complaints.length) * 100);
                  const tc = CRIME_TYPE_COLORS[type] ?? "#6b7280";
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-semibold text-text-secondary">{type}</span>
                        <span className="text-[10px] font-black text-text-primary tabular-nums">{count}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-surface-L2 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: tc }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Complaints list */}
          <div className="px-4 pb-3 border-t border-border pt-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Complaints Attended</p>
            {complaints.length === 0 ? (
              <div className="text-[11px] text-text-muted text-center py-4 bg-surface-L2 rounded-xl border border-border">
                No complaints attended today
              </div>
            ) : (
              <div className="space-y-1.5">
                {complaints.map(c => (
                  <div key={c.id} className="rounded-xl bg-surface-L2 border border-border px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CRIME_TYPE_COLORS[c.type] ?? "#6b7280" }} />
                          <span className="text-[10px] font-bold text-text-primary truncate">{c.type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-text-muted">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{c.area}</span>
                        </div>
                        <div className="text-[9px] text-text-muted mt-0.5">{c.time} · {c.id}</div>
                      </div>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                        c.outcome === "CSR"
                          ? "bg-red-500/15 text-red-400 border border-red-500/30"
                          : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                      }`}>
                        {c.outcome}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stationary locations */}
          <div className="px-4 pb-3 border-t border-border pt-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Stationary Areas</p>
            {!stats || stats.hotspots.length === 0 ? (
              <div className="text-[11px] text-text-muted text-center py-4 bg-surface-L2 rounded-xl border border-border">
                No stops &gt; 30 min detected
              </div>
            ) : (
              <div className="space-y-1.5">
                {stats.hotspots.map((hs, i) => (
                  <div key={i} className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-bold text-amber-400">{hs.name}</span>
                      <span className="text-[10px] font-black text-text-primary tabular-nums">{fmtDuration(hs.durationMin)}</span>
                    </div>
                    <p className="text-[9px] text-text-muted">From {fmtTime(hs.startTime)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fleet overview */}
          <div className="px-4 pb-4 border-t border-border pt-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Fleet Overview</p>
            <div className="space-y-1">
              {([1, 2, 3, 4] as const).map(id => {
                const pts = tracks[id];
                const s = pts ? computeStats(pts, id) : null;
                const c = VEHICLE_COLORS[id];
                const crew = PATROL_PERSONNEL[id] ?? [];
                const jobs = PATROL_COMPLAINTS[id] ?? [];
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedVehicle(id)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                      selectedVehicle === id ? "bg-surface-L2" : "hover:bg-surface-L2/50"
                    }`}
                    style={selectedVehicle === id ? { outline: `1.5px solid ${c}`, outlineOffset: "-1.5px" } : undefined}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-text-primary">Patrol {id}</p>
                      <p className="text-[9px] text-text-muted">{crew.length} officers · {jobs.length} complaints</p>
                    </div>
                    <span className="text-[11px] text-text-muted tabular-nums shrink-0">
                      {s ? `${s.distanceKm} km` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
