import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import { api } from "../api";
import { PatrolTrackPoint } from "../types";
import { Navigation, Clock, Activity, MapPin, Phone, User } from "lucide-react";

const VEHICLE_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#10b981",
  3: "#a855f7",
  4: "#f59e0b",
};

const OFFICER_INFO: Record<number, { name: string; phone: string }> = {
  1: { name: "Const. Ravi Kumar",   phone: "9841000021" },
  2: { name: "Const. Kavitha Devi", phone: "9841000022" },
  3: { name: "Const. Arjun Singh",  phone: "9841000023" },
  4: { name: "Const. Meena Rani",   phone: "9841000024" },
};

const MAP_CENTER: [number, number] = [12.9349, 80.1706];
const MAX_JUMP_KM = 2.0; // teleport threshold — skip drawing line segments longer than this

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
}

interface TrailStats {
  distanceKm: number;
  patrollingMin: number;
  pointCount: number;
  hotspots: Hotspot[];
}

function computeStats(pts: PatrolTrackPoint[]): TrailStats {
  if (pts.length < 2) return { distanceKm: 0, patrollingMin: 0, pointCount: pts.length, hotspots: [] };

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

  // Hotspot detection: compare each point to where the vehicle was 30 min earlier.
  // If displacement < 150m over 30 min the vehicle was effectively stationary (not patrolling).
  const LOOKBACK_MS = 30 * 60 * 1000; // 30-minute window
  const STOP_RADIUS_KM = 0.15;         // 150m — distinguishes slow patrol oval from true stop
  const hotspots: Hotspot[] = [];
  let stopStartIdx = 0;
  let inStop = false;
  let stopLats: number[] = [];
  let stopLngs: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tNow = toMs(sorted[i].recorded_at);
    // Find the point ~30 min ago
    let refIdx = i;
    while (refIdx > 0 && tNow - toMs(sorted[refIdx].recorded_at) < LOOKBACK_MS) refIdx--;
    if (refIdx === i) { continue; } // not enough history yet
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
        hotspots.push({
          lat: stopLats.reduce((s, v) => s + v, 0) / stopLats.length,
          lng: stopLngs.reduce((s, v) => s + v, 0) / stopLngs.length,
          durationMin,
          startTime: sorted[stopStartIdx].recorded_at,
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
      hotspots.push({
        lat: stopLats.reduce((s, v) => s + v, 0) / stopLats.length,
        lng: stopLngs.reduce((s, v) => s + v, 0) / stopLngs.length,
        durationMin,
        startTime: sorted[stopStartIdx].recorded_at,
      });
    }
  }

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    patrollingMin,
    pointCount: sorted.length,
    hotspots,
  };
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

  // Fetch tracks once
  useEffect(() => {
    setLoading(true);
    api.allPatrolTracks(token)
      .then(d => setTracks(d.tracks ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = L.map(mapContainerRef.current, {
      center: MAP_CENTER,
      zoom: 13,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Render trail for selected vehicle
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear previous layers
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

    // Build continuous segments, breaking on teleport jumps
    let segment: [number, number][] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        segment = [[sorted[0].lat, sorted[0].lng]];
        continue;
      }
      const d = haversine(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
      if (d > MAX_JUMP_KM && segment.length > 1) {
        const poly = L.polyline(segment, { color, weight: 3, opacity: 0.8 }).addTo(mapRef.current!);
        trailRef.current.push(poly);
        segment = [];
      }
      segment.push([sorted[i].lat, sorted[i].lng]);
    }
    if (segment.length > 1) {
      const poly = L.polyline(segment, { color, weight: 3, opacity: 0.8 }).addTo(mapRef.current!);
      trailRef.current.push(poly);
    }

    // Start marker (green dot)
    startMarkerRef.current = L.circleMarker([sorted[0].lat, sorted[0].lng], {
      radius: 7, fillColor: "#22c55e", fillOpacity: 1, color: "#fff", weight: 2,
    }).addTo(mapRef.current).bindTooltip("Start of shift", { direction: "top" });

    // End marker (current position — colored square via divIcon)
    const last = sorted[sorted.length - 1];
    const endIcon = L.divIcon({
      html: `<div style="width:12px;height:12px;background:${color};border:2px solid #fff;border-radius:3px;box-shadow:0 0 6px ${color}99"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      className: "",
    });
    endMarkerRef.current = L.circleMarker([last.lat, last.lng], {
      radius: 8, fillColor: color, fillOpacity: 1, color: "#fff", weight: 2,
    }).addTo(mapRef.current).bindTooltip(`Current position`, { direction: "top" });
    endMarkerRef.current.bindPopup(`
      <div style="min-width:180px;font-size:12px">
        <div style="font-weight:700;color:${color};font-size:13px;margin-bottom:6px">Patrol ${selectedVehicle}</div>
        <div style="color:#94a3b8;line-height:1.8">
          <div>👮 ${OFFICER_INFO[selectedVehicle].name}</div>
          <div>📞 ${OFFICER_INFO[selectedVehicle].phone}</div>
          <div>⏱ Last seen: ${fmtTime(last.recorded_at)}</div>
        </div>
      </div>
    `);
    void endIcon; // suppress unused warning

    // Hotspot circles
    const { hotspots } = computeStats(pts);
    hotspots.forEach((hs, idx) => {
      const cm = L.circleMarker([hs.lat, hs.lng], {
        radius: 16,
        fillColor: "#f59e0b",
        fillOpacity: 0.25,
        color: "#f59e0b",
        weight: 3,
        dashArray: undefined,
      })
        .addTo(mapRef.current!)
        .bindPopup(
          `<div style="font-size:12px">
            <div style="font-weight:700;color:#f59e0b">Hotspot ${idx + 1}</div>
            <div style="color:#94a3b8;margin-top:4px">
              <div>⏱ ${fmtDuration(hs.durationMin)} stationary</div>
              <div>🕐 From ${fmtTime(hs.startTime)}</div>
            </div>
          </div>`
        );
      hotspotLayersRef.current.push(cm);
    });

    // Fit map to trail
    const allPts = sorted.map(p => [p.lat, p.lng] as [number, number]);
    if (allPts.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(allPts).pad(0.15));
    }
  }, [tracks, selectedVehicle]);

  const stats = useMemo(() => {
    const pts = tracks[selectedVehicle];
    if (!pts) return null;
    return computeStats(pts);
  }, [tracks, selectedVehicle]);

  const color = VEHICLE_COLORS[selectedVehicle];
  const officer = OFFICER_INFO[selectedVehicle];

  return (
    <div className="flex flex-col h-full bg-bg-dark overflow-hidden">
      {/* Vehicle selector bar */}
      <div className="bg-surface-L1 border-b border-border px-5 py-3 flex items-center gap-3 shrink-0">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Select Vehicle</span>
        <div className="flex items-center bg-surface-L2 rounded-lg p-0.5 gap-0.5">
          {([1, 2, 3, 4] as const).map(id => (
            <button
              key={id}
              onClick={() => setSelectedVehicle(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                selectedVehicle === id
                  ? "text-white shadow"
                  : "text-text-secondary hover:text-text-primary"
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
        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-1.5 rounded-full" style={{ background: color }} />
            <span>Patrol route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "#f59e0b", opacity: 0.7 }} />
            <span>Hotspot (&gt;30 min)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Shift start</span>
          </div>
        </div>
      </div>

      {/* Map + Analytics */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 overflow-hidden relative">
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>

        {/* Analytics sidebar */}
        <div className="w-[280px] shrink-0 bg-surface-L1 border-l border-border overflow-y-auto">
          {/* Officer info */}
          <div className="px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: color }} />
              <span className="text-sm font-black text-text-primary">Patrol {selectedVehicle}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-secondary mb-1">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>{officer.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-secondary">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{officer.phone}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 py-3 grid grid-cols-2 gap-2.5">
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
                <Activity className="w-3 h-3 text-violet-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Data Points</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">{stats?.pointCount ?? "—"}</p>
              <p className="text-[10px] text-text-muted">GPS pings</p>
            </div>
            <div className="rounded-xl bg-surface-L2 border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <MapPin className="w-3 h-3 text-amber-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Hotspots</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">{stats?.hotspots.length ?? "—"}</p>
              <p className="text-[10px] text-text-muted">stops &gt;30 min</p>
            </div>
          </div>

          {/* Hotspot list */}
          <div className="px-4 pb-4">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Stationary Locations</p>
            {!stats || stats.hotspots.length === 0 ? (
              <div className="text-[11px] text-text-muted text-center py-6 bg-surface-L2 rounded-xl border border-border">
                No stops &gt; 30 min detected
              </div>
            ) : (
              <div className="space-y-2">
                {stats.hotspots.map((hs, i) => (
                  <div key={i} className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-amber-400">Hotspot {i + 1}</span>
                      <span className="text-[10px] font-black text-text-primary tabular-nums">
                        {fmtDuration(hs.durationMin)}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted">
                      <div>From {fmtTime(hs.startTime)}</div>
                      <div className="mt-0.5 font-mono">
                        {hs.lat.toFixed(4)}, {hs.lng.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All-vehicles summary */}
          <div className="px-4 pb-4 pt-1 border-t border-border">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Fleet Overview</p>
            <div className="space-y-1.5">
              {([1, 2, 3, 4] as const).map(id => {
                const pts = tracks[id];
                const s = pts ? computeStats(pts) : null;
                const c = VEHICLE_COLORS[id];
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
                    <span className="text-[11px] font-bold text-text-primary">Patrol {id}</span>
                    <span className="ml-auto text-[11px] text-text-muted tabular-nums">
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
