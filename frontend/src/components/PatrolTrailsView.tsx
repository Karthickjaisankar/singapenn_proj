import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import { api } from "../api";
import { PatrolTrackPoint, Venue, Crime, PatrolZone } from "../types";
import { Navigation, Clock, MapPin, Phone, User, Users } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const VEHICLE_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#10b981",
  3: "#a855f7",
  4: "#f59e0b",
};

// Realistic patrol circuits for each PPV — 8-9 waypoints covering ~5 km of roads
// Each circuit closes on itself (first = last point)
const DEMO_CIRCUITS: Record<number, [number, number][]> = {
  1: [
    [12.9398, 80.1323], // Tambaram AWPS
    [12.9440, 80.1280], // Tambaram Railway Station
    [12.9470, 80.1350], // Tambaram Bus Stand
    [12.9420, 80.1440], // Tambaram East
    [12.9350, 80.1490], // GST Road junction
    [12.9280, 80.1440], // Mudichur junction
    [12.9230, 80.1370], // Mudichur Road
    [12.9290, 80.1290], // Mudichur market
    [12.9398, 80.1323], // back to AWPS
  ],
  2: [
    [12.9657, 80.1588], // Pallavaram AWPS
    [12.9700, 80.1540], // Pallavaram Flyover
    [12.9740, 80.1610], // St. Thomas Mount
    [12.9680, 80.1680], // Pallavaram north
    [12.9610, 80.1660], // Old Pallavaram
    [12.9560, 80.1600], // Tirusulam
    [12.9510, 80.1550], // Meenambakkam metro
    [12.9570, 80.1500], // Meenambakkam junction
    [12.9620, 80.1530], // south return
    [12.9657, 80.1588], // back to AWPS
  ],
  3: [
    [12.9314, 80.1496], // Vandalur AWPS
    [12.9260, 80.1540], // Perungalathur signal
    [12.9200, 80.1580], // Perungalathur south
    [12.9160, 80.1640], // Chromepet railway crossing
    [12.9205, 80.1710], // Chromepet market
    [12.9270, 80.1750], // Selaiyur junction
    [12.9313, 80.1746], // Selaiyur AWPS
    [12.9360, 80.1690], // back route north
    [12.9370, 80.1590], // GST Road south
    [12.9314, 80.1496], // back to Vandalur
  ],
  4: [
    [12.9344, 80.2120], // Semmenchery AWPS
    [12.9280, 80.2080], // Semmenchery south
    [12.9200, 80.2050], // Perungudi signal
    [12.9189, 80.1962], // Perumpakkam
    [12.9132, 80.1903], // Kelambakkam AWPS
    [12.9180, 80.2010], // Okkiyam Thoraipakkam
    [12.9260, 80.2150], // Thoraipakkam OMR junction
    [12.9330, 80.2190], // Semmenchery east
    [12.9344, 80.2120], // back to AWPS
  ],
};

// AWPS station labels shown on the dark map
const AWPS_STATIONS = [
  { name: "Tambaram AWPS",    lat: 12.9398, lng: 80.1323 },
  { name: "Pallavaram AWPS",  lat: 12.9657, lng: 80.1588 },
  { name: "Vandalur AWPS",    lat: 12.9314, lng: 80.1496 },
  { name: "Selaiyur AWPS",    lat: 12.9313, lng: 80.1746 },
  { name: "Semmenchery AWPS", lat: 12.9344, lng: 80.2120 },
  { name: "Kelambakkam AWPS", lat: 12.9132, lng: 80.1903 },
];

const VENUE_EMOJI: Record<string, { emoji: string; color: string }> = {
  school:     { emoji: "🏫", color: "#3b82f6" },
  college:    { emoji: "🎓", color: "#8b5cf6" },
  hospital:   { emoji: "🏥", color: "#10b981" },
  restaurant: { emoji: "🍽️", color: "#ef4444" },
  bar:        { emoji: "🍺", color: "#f97316" },
  mall:       { emoji: "🛍️", color: "#06b6d4" },
};

const MAP_CENTER: [number, number] = [12.9349, 80.1706];
const MAX_JUMP_KM = 2.0;

// ── Simulated data ─────────────────────────────────────────────────────────────

const PATROL_PERSONNEL: Record<number, { name: string; rank: string; phone: string }[]> = {
  1: [
    { name: "HC Ravi Kumar",      rank: "Head Constable", phone: "9841000021" },
    { name: "Const. Divya Priya", rank: "Constable",      phone: "9841000025" },
    { name: "Const. Suresh Babu", rank: "Constable",      phone: "9841000029" },
  ],
  2: [
    { name: "HC Kavitha Devi",      rank: "Head Constable", phone: "9841000022" },
    { name: "Const. Selvi Lakshmi", rank: "Constable",      phone: "9841000026" },
    { name: "Const. Priya Rajan",   rank: "Constable",      phone: "9841000030" },
  ],
  3: [
    { name: "ASI Arjun Singh",    rank: "ASI",       phone: "9841000023" },
    { name: "Const. Meenakshi R", rank: "Constable", phone: "9841000027" },
  ],
  4: [
    { name: "Const. Meena Rani",   rank: "Constable", phone: "9841000024" },
    { name: "Const. Vasantha D",   rank: "Constable", phone: "9841000028" },
    { name: "Const. Anitha Kumar", rank: "Constable", phone: "9841000031" },
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
    { id: "A-205", type: "Suspicious Activity", outcome: "DSR", area: "Semmenchery Nagar",   time: "08:55 am" },
    { id: "A-208", type: "Harassment",          outcome: "CSR", area: "Semmenchery East",     time: "11:00 am" },
    { id: "A-213", type: "SOS",                 outcome: "CSR", area: "Okkiyam Thoraipakkam", time: "01:50 pm" },
    { id: "A-217", type: "Suspicious Activity", outcome: "DSR", area: "Perungudi Main Road",  time: "03:30 pm" },
  ],
};

const HOTSPOT_NAMES: Record<number, string[]> = {
  1: ["Vandalur Zoo Gate", "Mudichur Road Junction"],
  2: ["Tirusulam Signal", "Pallavaram Flyover"],
  3: ["Chromepet Railway Crossing", "Perungalathur Police Outpost"],
  4: ["Semmenchery Bus Terminus", "Thoraipakkam OMR Junction"],
};

const CRIME_TYPE_COLORS: Record<CrimeType, string> = {
  "Harassment":          "#ef4444",
  "Suspicious Activity": "#f59e0b",
  "SOS":                 "#3b82f6",
  "Medical Emergency":   "#10b981",
};

// ── Idle event data ────────────────────────────────────────────────────────────
// Locations where the vehicle was stationary for 45+ minutes during the shift

interface IdleEvent {
  lat: number;
  lng: number;
  locationName: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  reason: string;
}

const IDLE_EVENTS: Record<number, IdleEvent[]> = {
  1: [
    { lat: 12.9440, lng: 80.1280, locationName: "Tambaram Railway Station",
      startTime: "08:15 AM", endTime: "09:23 AM", durationMin: 68,
      reason: "Vehicle parked – morning duty briefing" },
    { lat: 12.9290, lng: 80.1290, locationName: "Mudichur Market",
      startTime: "11:40 AM", endTime: "12:32 PM", durationMin: 52,
      reason: "Lunch break" },
    { lat: 12.9350, lng: 80.1490, locationName: "GST Road Junction",
      startTime: "14:10 PM", endTime: "15:37 PM", durationMin: 87,
      reason: "Traffic duty – assigned by SI" },
  ],
  2: [
    { lat: 12.9700, lng: 80.1540, locationName: "Pallavaram Market Area",
      startTime: "07:50 AM", endTime: "09:03 AM", durationMin: 73,
      reason: "Morning deployment briefing" },
    { lat: 12.9570, lng: 80.1500, locationName: "Meenambakkam Junction",
      startTime: "12:20 PM", endTime: "13:18 PM", durationMin: 58,
      reason: "Lunch break" },
    { lat: 12.9560, lng: 80.1600, locationName: "Tirusulam Bus Stand",
      startTime: "15:45 PM", endTime: "17:19 PM", durationMin: 94,
      reason: "Vehicle maintenance – reported breakdown" },
  ],
  3: [
    { lat: 12.9260, lng: 80.1540, locationName: "Perungalathur Signal",
      startTime: "09:00 AM", endTime: "10:01 AM", durationMin: 61,
      reason: "Documentation at police outpost" },
    { lat: 12.9205, lng: 80.1710, locationName: "Chromepet Market",
      startTime: "13:05 PM", endTime: "13:53 PM", durationMin: 48,
      reason: "Complaint filing at local beat post" },
  ],
  4: [
    { lat: 12.9280, lng: 80.2080, locationName: "Semmenchery Nagar",
      startTime: "08:30 AM", endTime: "09:25 AM", durationMin: 55,
      reason: "Shift briefing at sector HQ" },
    { lat: 12.9260, lng: 80.2150, locationName: "Thoraipakkam OMR Junction",
      startTime: "12:00 PM", endTime: "13:22 PM", durationMin: 82,
      reason: "Lunch break + vehicle inspection" },
    { lat: 12.9132, lng: 80.1903, locationName: "Kelambakkam Signal",
      startTime: "15:00 PM", endTime: "16:03 PM", durationMin: 63,
      reason: "Community liaison – women safety meeting" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Generate a realistic 3-lap demo trail for a vehicle (used when real data is sparse)
function generateDemoTrail(vehicleId: number): PatrolTrackPoint[] {
  const circuit = DEMO_CIRCUITS[vehicleId];
  if (!circuit) return [];
  const TOTAL = 180;
  const LAPS  = 3;
  const N     = circuit.length; // last point == first point
  const now   = Date.now();
  const start = now - 8 * 3_600_000;
  const step  = (8 * 3_600_000) / TOTAL;

  return Array.from({ length: TOTAL }, (_, i) => {
    const progress  = (i / (TOTAL - 1)) * LAPS * (N - 1);
    const segIdx    = Math.floor(progress) % (N - 1);
    const segT      = progress - Math.floor(progress);
    const from      = circuit[segIdx];
    const to        = circuit[(segIdx + 1) % N];
    const noise     = (Math.random() - 0.5) * 0.0008;
    return {
      vehicle_id:  vehicleId,
      lat:         from[0] + (to[0] - from[0]) * segT + noise,
      lng:         from[1] + (to[1] - from[1]) * segT + noise,
      status:      "patrolling",
      recorded_at: new Date(start + i * step).toISOString(),
    };
  });
}

// Siren-equipped patrol car DivIcon for the trail end marker
function createPatrolIcon(vehicleId: number): L.DivIcon {
  const color = VEHICLE_COLORS[vehicleId] ?? "#ec4899";
  const gradId = `tg${vehicleId}`;
  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${color}cc;stop-opacity:1"/>
    </linearGradient></defs>
    <path d="M20 55 L25 40 L40 35 L60 35 L75 40 L80 55 L85 60 L85 70 Q85 75 80 75 L20 75 Q15 75 15 70 L15 60 Z" fill="url(#${gradId})"/>
    <polygon points="30,40 45,38 45,48 30,50" fill="#87ceeb" opacity=".7"/>
    <polygon points="55,38 70,40 70,50 55,48" fill="#87ceeb" opacity=".7"/>
    <circle cx="32" cy="75" r="8" fill="#1f2937"/>
    <circle cx="32" cy="75" r="5" fill="#4b5563"/>
    <circle cx="68" cy="75" r="8" fill="#1f2937"/>
    <circle cx="68" cy="75" r="5" fill="#4b5563"/>
    <circle cx="82" cy="58" r="2.5" fill="#fbbf24" opacity=".9"/>
  </svg>`;
  const siren = `
    <style>
      @keyframes tsr{0%,49%{opacity:1;box-shadow:0 0 10px 4px #ef4444}50%,100%{opacity:0.15;box-shadow:none}}
      @keyframes tsb{0%,49%{opacity:0.15;box-shadow:none}50%,100%{opacity:1;box-shadow:0 0 10px 4px #3b82f6}}
      @keyframes tsg{0%,49%{box-shadow:0 0 16px 7px rgba(239,68,68,0.6)}50%,100%{box-shadow:0 0 16px 7px rgba(59,130,246,0.6)}}
    </style>
    <div style="position:absolute;top:-2px;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:2;
                animation:tsg 0.8s step-end infinite;padding:2px 4px;border-radius:6px;background:rgba(0,0,0,0.6);">
      <div style="width:7px;height:7px;border-radius:50%;background:#ef4444;animation:tsr 0.8s step-end infinite;"></div>
      <div style="width:7px;height:7px;border-radius:50%;background:#3b82f6;animation:tsb 0.8s step-end infinite;"></div>
    </div>`;
  const inner = `width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2.5px solid ${color};border-radius:8px;box-shadow:0 0 0 3px ${color}88,0 4px 16px ${color}66;`;
  return L.divIcon({
    html: `<div style="width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;position:relative;">${siren}<div style="${inner}">${svg}</div></div>`,
    className: "",
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  });
}

// Pulsing amber marker for idle events
function createIdleIcon(durationMin: number): L.DivIcon {
  const h     = Math.floor(durationMin / 60);
  const m     = durationMin % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m} min`;
  // amber < 90 min, red ≥ 90 min (very long idle = flag)
  const color = durationMin >= 90 ? "#ef4444" : durationMin >= 60 ? "#f97316" : "#f59e0b";
  return L.divIcon({
    html: `
      <div style="position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;inset:0;border-radius:50%;border:2.5px solid ${color};animation:idle-ring-pulse 1.8s ease-in-out infinite;pointer-events:none"></div>
        <div style="position:absolute;inset:8px;border-radius:50%;background:rgba(15,23,42,0.88);border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 12px ${color}55">
          ⏸
        </div>
        <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:${color};color:#0f172a;font-size:9px;font-weight:900;padding:2px 7px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,0.5)">
          ${label}
        </div>
      </div>`,
    className: "",
    iconSize:   [52, 52],
    iconAnchor: [26, 26],
  });
}

interface Hotspot { lat: number; lng: number; durationMin: number; startTime: string; name: string; }
interface TrailStats { distanceKm: number; patrollingMin: number; hotspots: Hotspot[]; }

function computeStats(pts: PatrolTrackPoint[], vehicleId: number): TrailStats {
  if (pts.length < 2) return { distanceKm: 0, patrollingMin: 0, hotspots: [] };
  const toMs = (s: string) => new Date(/Z|[+-]\d{2}:/.test(s) ? s : s.replace(" ", "T") + "Z").getTime();
  const sorted = [...pts].sort((a, b) => toMs(a.recorded_at) - toMs(b.recorded_at));

  let distanceKm = 0;
  for (let i = 1; i < sorted.length; i++) {
    const d = haversine(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    if (d < MAX_JUMP_KM) distanceKm += d;
  }
  const patrollingMin = Math.round((toMs(sorted[sorted.length - 1].recorded_at) - toMs(sorted[0].recorded_at)) / 60000);

  const LOOKBACK_MS = 30 * 60_000;
  const STOP_RADIUS_KM = 0.15;
  const hotspots: Hotspot[] = [];
  const names = HOTSPOT_NAMES[vehicleId] ?? [];
  let stopStartIdx = 0, inStop = false;
  let stopLats: number[] = [], stopLngs: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tNow = toMs(sorted[i].recorded_at);
    let refIdx = i;
    while (refIdx > 0 && tNow - toMs(sorted[refIdx].recorded_at) < LOOKBACK_MS) refIdx--;
    if (refIdx === i) continue;
    const d = haversine(sorted[refIdx].lat, sorted[refIdx].lng, sorted[i].lat, sorted[i].lng);
    if (d < STOP_RADIUS_KM && !inStop) {
      inStop = true; stopStartIdx = refIdx;
      stopLats = [sorted[i].lat]; stopLngs = [sorted[i].lng];
    } else if (d < STOP_RADIUS_KM && inStop) {
      stopLats.push(sorted[i].lat); stopLngs.push(sorted[i].lng);
    } else if (d >= STOP_RADIUS_KM && inStop) {
      const dur = Math.round((toMs(sorted[i - 1].recorded_at) - toMs(sorted[stopStartIdx].recorded_at)) / 60000);
      if (dur >= 30) {
        const idx = hotspots.length;
        hotspots.push({ lat: stopLats.reduce((s, v) => s + v, 0) / stopLats.length, lng: stopLngs.reduce((s, v) => s + v, 0) / stopLngs.length, durationMin: dur, startTime: sorted[stopStartIdx].recorded_at, name: names[idx] ?? `Area ${idx + 1}` });
      }
      inStop = false; stopLats = []; stopLngs = [];
    }
  }
  if (inStop && stopLats.length > 0) {
    const dur = Math.round((toMs(sorted[sorted.length - 1].recorded_at) - toMs(sorted[stopStartIdx].recorded_at)) / 60000);
    if (dur >= 30) {
      const idx = hotspots.length;
      hotspots.push({ lat: stopLats.reduce((s, v) => s + v, 0) / stopLats.length, lng: stopLngs.reduce((s, v) => s + v, 0) / stopLngs.length, durationMin: dur, startTime: sorted[stopStartIdx].recorded_at, name: names[idx] ?? `Area ${idx + 1}` });
    }
  }
  return { distanceKm: Math.round(distanceKm * 10) / 10, patrollingMin, hotspots };
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { token: string; }

export default function PatrolTrailsView({ token }: Props) {
  const [selectedVehicle, setSelectedVehicle] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(true);
  const [venues, setVenues]   = useState<Venue[]>([]);
  const [crimes, setCrimes]   = useState<Crime[]>([]);
  const [zones, setZones]     = useState<PatrolZone[]>([]);

  const mapRef          = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const trailRef        = useRef<L.Polyline[]>([]);
  const glowRef         = useRef<L.Polyline[]>([]);
  const hotspotLayersRef= useRef<L.Layer[]>([]);
  const startMarkerRef  = useRef<L.Marker | null>(null);
  const vehicleMarkerRef= useRef<L.Marker | null>(null);
  const animTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const venueLayerRef   = useRef<L.LayerGroup | null>(null);
  const crimeLayerRef   = useRef<L.LayerGroup | null>(null);
  const zoneLayerRef    = useRef<L.LayerGroup | null>(null);

  // ── Fetch data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.venues().then(d => setVenues(d.venues ?? [])).catch(() => {});
    api.crimes().then(d => setCrimes(d.crimes ?? [])).catch(() => {});
    api.hotspots().then(d => setZones(d.hotspots ?? [])).catch(() => {});
    setLoading(false);
  }, [token]);

  // ── Map init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const m = L.map(mapContainerRef.current, {
      center: MAP_CENTER, zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark CartoDB tiles (same style as before but richer)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(m);

    L.control.zoom({ position: "topright" }).addTo(m);

    // AWPS station labels — white pills on the dark map
    AWPS_STATIONS.forEach(({ name, lat, lng }) => {
      L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="font-size:10px;font-weight:800;color:#f1f5f9;background:rgba(30,41,59,0.92);padding:2px 8px;border-radius:4px;white-space:nowrap;border:1px solid rgba(148,163,184,0.25);pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${name}</div>`,
          className: "",
          iconAnchor: [0, 0],
        }),
        interactive: false,
        zIndexOffset: 400,
      }).addTo(m);
    });

    // District area labels
    const addLabel = (lat: number, lng: number, text: string) =>
      L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="font-size:13px;font-weight:900;color:#e2e8f0;background:rgba(15,23,42,0.85);padding:3px 10px;border-radius:5px;white-space:nowrap;pointer-events:none;border-left:3px solid #475569;letter-spacing:0.03em">${text}</div>`,
          className: "",
          iconAnchor: [0, 0],
        }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(m);

    addLabel(13.01, 80.08, "Tambaram");
    addLabel(12.96, 80.26, "Pallikaranai");

    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, []);

  // ── Venue markers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m || venues.length === 0) return;
    if (venueLayerRef.current) { m.removeLayer(venueLayerRef.current); }
    const group = L.layerGroup();
    venues.forEach(v => {
      if (!v.lat || !v.lng) return;
      const info = VENUE_EMOJI[v.type] ?? VENUE_EMOJI.restaurant;
      L.marker([v.lat, v.lng], {
        icon: L.divIcon({
          html: `<div style="font-size:14px;background:rgba(15,23,42,0.85);border-radius:6px;padding:2px 3px;border:1px solid ${info.color}44;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${info.emoji}</div>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: 100,
      })
        .bindTooltip(`<span style="font-size:11px;font-weight:600">${v.name}</span>`, { direction: "top", offset: [0, -10] })
        .addTo(group);
    });
    group.addTo(m);
    venueLayerRef.current = group;
  }, [venues]);

  // ── Crime dots ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m || crimes.length === 0) return;
    if (crimeLayerRef.current) { m.removeLayer(crimeLayerRef.current); }
    const group = L.layerGroup();
    crimes.forEach(c => {
      if (!c.lat || !c.lng) return;
      const color = c.severity === "severe" ? "#dc2626" : c.severity === "moderate" ? "#f59e0b" : "#22c55e";
      L.circleMarker([c.lat, c.lng], {
        radius: 3.5, fillColor: color, fillOpacity: 0.55,
        color: color, weight: 1, opacity: 0.7,
      })
        .bindTooltip(`<span style="font-size:10px">${c.head} · ${c.year}</span>`, { direction: "top" })
        .addTo(group);
    });
    group.addTo(m);
    crimeLayerRef.current = group;
  }, [crimes]);

  // ── Patrol zone circles ───────────────────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m || zones.length === 0) return;
    if (zoneLayerRef.current) { m.removeLayer(zoneLayerRef.current); }
    const group = L.layerGroup();
    zones.forEach(z => {
      const color = VEHICLE_COLORS[(z.zone_id + 1) as 1 | 2 | 3 | 4] ?? "#6366f1";
      L.circle([z.centroid_lat, z.centroid_lng], {
        radius: 2800,
        color, weight: 1.5, opacity: 0.5,
        fillColor: color, fillOpacity: 0.05,
      })
        .bindTooltip(`Zone ${z.zone_id + 1} · PPV-${z.zone_id + 1}`, { direction: "top" })
        .addTo(group);
    });
    group.addTo(m);
    zoneLayerRef.current = group;
  }, [zones]);

  // ── Animated patrol car + historical trail + live growing tail ────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // Stop previous animation
    if (animTimerRef.current) clearInterval(animTimerRef.current);

    // Clear existing layers
    [...trailRef.current, ...glowRef.current].forEach(l => m.removeLayer(l));
    trailRef.current = []; glowRef.current = [];
    hotspotLayersRef.current.forEach(l => m.removeLayer(l));
    hotspotLayersRef.current = [];
    startMarkerRef.current && m.removeLayer(startMarkerRef.current);
    vehicleMarkerRef.current && m.removeLayer(vehicleMarkerRef.current);

    const circuit = DEMO_CIRCUITS[selectedVehicle];
    if (!circuit) return;

    const color    = VEHICLE_COLORS[selectedVehicle] ?? "#ec4899";
    const N        = circuit.length - 1;   // segment count (circuit closes on itself)
    const SPEED    = 0.006;                // progress/tick at 50ms → ~67 s per lap
    const TAIL_LEN = 280;                  // live tail: last 280 positions (~14 s of trail)

    // ── Historical trail (already-traveled portion of the shift) ──────────────
    // Represent ~1.5 laps already done — sampled cleanly from the circuit
    const HISTORY_PROGRESS = N * 1.5;
    const HISTORY_SAMPLES  = 90;
    const historyPts: [number, number][] = [];
    for (let i = 0; i <= HISTORY_SAMPLES; i++) {
      const t      = (i / HISTORY_SAMPLES) * HISTORY_PROGRESS;
      const segIdx = Math.floor(t) % N;
      const segT   = t - Math.floor(t);
      const from   = circuit[segIdx];
      const to     = circuit[(segIdx + 1) % circuit.length];
      historyPts.push([from[0] + (to[0] - from[0]) * segT, from[1] + (to[1] - from[1]) * segT]);
    }
    const historyEndPos = historyPts[historyPts.length - 1];

    // Draw historical trail — dimmer to read as "already traveled"
    const hGlowWide = L.polyline(historyPts, { color, weight: 22, opacity: 0.07 }).addTo(m);
    const hGlowMid  = L.polyline(historyPts, { color, weight: 11, opacity: 0.14 }).addTo(m);
    const hLine     = L.polyline(historyPts, { color, weight: 3.5, opacity: 0.50, dashArray: "12 7" }).addTo(m);
    glowRef.current  = [hGlowWide, hGlowMid];
    trailRef.current = [hLine];

    // ── Live tail polylines (bright — current movement, on top of history) ─────
    const glowWide = L.polyline([historyEndPos], { color, weight: 24, opacity: 0.15 }).addTo(m);
    const glowMid  = L.polyline([historyEndPos], { color, weight: 12, opacity: 0.28 }).addTo(m);
    const trailLine= L.polyline([historyEndPos], { color, weight: 4,  opacity: 0.98, dashArray: "12 7" }).addTo(m);
    glowRef.current.push(glowWide, glowMid);
    trailRef.current.push(trailLine);

    // ── Start marker (shift start = circuit origin) ────────────────────────────
    const startPos: [number, number] = [circuit[0][0], circuit[0][1]];
    startMarkerRef.current = L.marker(startPos, {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;box-shadow:0 0 8px #22c55e88;"></div>`,
        className: "", iconSize: [14, 14], iconAnchor: [7, 7],
      }),
      zIndexOffset: 900,
    }).bindTooltip("Shift start", { direction: "top" }).addTo(m);

    // ── Patrol car — starts at end of historical trail ─────────────────────────
    const personnel = PATROL_PERSONNEL[selectedVehicle] ?? [];
    vehicleMarkerRef.current = L.marker(historyEndPos, {
      icon: createPatrolIcon(selectedVehicle),
      zIndexOffset: 1000,
    })
      .bindPopup(
        `<div style="min-width:200px;font-size:12px;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:0">
          <div style="font-weight:800;color:${color};font-size:13px;margin-bottom:8px;padding:10px 12px 0">PPV-${selectedVehicle} · Patrolling</div>
          <div style="padding:0 12px 10px;color:#94a3b8;line-height:2">
            ${personnel.map(p => `<div>👮 <span style="color:#e2e8f0;font-weight:600">${p.name}</span> · <span style="font-size:10px">${p.rank}</span></div>`).join("")}
          </div>
        </div>`,
        { maxWidth: 240 }
      )
      .addTo(m);

    // ── Idle event markers ─────────────────────────────────────────────────────
    const idleEvents = IDLE_EVENTS[selectedVehicle] ?? [];
    idleEvents.forEach(evt => {
      const h     = Math.floor(evt.durationMin / 60);
      const m2    = evt.durationMin % 60;
      const dur   = h > 0 ? `${h}h ${m2}m` : `${m2} min`;
      const color = evt.durationMin >= 90 ? "#ef4444" : evt.durationMin >= 60 ? "#f97316" : "#f59e0b";
      const mk = L.marker([evt.lat, evt.lng], {
        icon: createIdleIcon(evt.durationMin),
        zIndexOffset: 800,
      })
        .addTo(m)
        .bindPopup(
          `<div style="font-size:12px;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px 14px;min-width:230px">
            <div style="font-weight:900;color:${color};font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:6px">
              <span style="font-size:16px">⏸</span> Idle for ${dur}
            </div>
            <div style="color:#94a3b8;line-height:2.1;font-size:11px">
              <div><span style="color:#64748b">📍</span>&nbsp;<span style="color:#e2e8f0;font-weight:600">${evt.locationName}</span></div>
              <div><span style="color:#64748b">🕐</span>&nbsp;${evt.startTime} → ${evt.endTime}</div>
              <div style="margin-top:6px;padding:6px 8px;background:rgba(${evt.durationMin >= 90 ? "239,68,68" : evt.durationMin >= 60 ? "249,115,22" : "245,158,11"},0.08);border-left:2px solid ${color};border-radius:3px;color:#cbd5e1">
                ${evt.reason}
              </div>
            </div>
          </div>`,
          { maxWidth: 270 }
        );
      hotspotLayersRef.current.push(mk);
    });

    // Fit map to full circuit
    m.fitBounds(L.latLngBounds(circuit as [number, number][]).pad(0.2), { maxZoom: 14 });

    // ── Animation: car continues from end of history ───────────────────────────
    let progress = HISTORY_PROGRESS;
    const livePts: [number, number][] = [historyEndPos];

    animTimerRef.current = setInterval(() => {
      progress += SPEED;
      const t      = progress % N;
      const segIdx = Math.floor(t) % N;
      const segT   = t - Math.floor(t);
      const from   = circuit[segIdx];
      const to     = circuit[(segIdx + 1) % circuit.length];
      const lat    = from[0] + (to[0] - from[0]) * segT;
      const lng    = from[1] + (to[1] - from[1]) * segT;

      livePts.push([lat, lng]);
      if (livePts.length > TAIL_LEN) livePts.shift();

      vehicleMarkerRef.current?.setLatLng([lat, lng]);
      glowWide.setLatLngs(livePts);
      glowMid.setLatLngs(livePts);
      trailLine.setLatLngs(livePts);
    }, 50);

    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [selectedVehicle]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const stats = useMemo(
    () => computeStats(generateDemoTrail(selectedVehicle), selectedVehicle),
    [selectedVehicle]
  );

  const color      = VEHICLE_COLORS[selectedVehicle];
  const personnel  = PATROL_PERSONNEL[selectedVehicle] ?? [];
  const complaints = PATROL_COMPLAINTS[selectedVehicle] ?? [];
  const dsrCount   = complaints.filter(c => c.outcome === "DSR").length;
  const csrCount   = complaints.filter(c => c.outcome === "CSR").length;
  const crimeBreakdown = complaints.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1; return acc;
  }, {});
  const idleEvents    = IDLE_EVENTS[selectedVehicle] ?? [];
  const totalIdleMin  = idleEvents.reduce((s, e) => s + e.durationMin, 0);
  const idleColor = (min: number) => min >= 90 ? "#ef4444" : min >= 60 ? "#f97316" : "#f59e0b";

  // ── Render ────────────────────────────────────────────────────────────────────

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
              PPV-{id}
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
            <div className="w-8 h-0.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <div className="w-1.5 h-1.5 rounded-full mr-1" style={{ background: color, opacity: 0.4 }} />
            <span>Patrol trail</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]">⏸</span>
            <span>Idle 45 min+</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500 border border-white/30" />
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
              <span className="text-sm font-black text-text-primary">PPV-{selectedVehicle}</span>
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
              <p className="text-xl font-black text-text-primary tabular-nums">{stats.distanceKm}</p>
              <p className="text-[10px] text-text-muted">km today</p>
            </div>
            <div className="rounded-xl bg-surface-L2 border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">On Duty</span>
              </div>
              <p className="text-xl font-black text-text-primary tabular-nums">{fmtDuration(stats.patrollingMin)}</p>
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
            {/* Idle time KPI — highlights non-patrol time */}
            <div className="rounded-xl px-3 py-2.5 border"
              style={{
                background: totalIdleMin >= 120 ? "rgba(239,68,68,0.07)" : totalIdleMin >= 60 ? "rgba(249,115,22,0.07)" : "rgba(245,158,11,0.07)",
                borderColor: idleColor(totalIdleMin) + "44",
              }}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px]">⏸</span>
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: idleColor(totalIdleMin) }}>Idle Time</span>
              </div>
              <p className="text-xl font-black tabular-nums" style={{ color: idleColor(totalIdleMin) }}>{fmtDuration(totalIdleMin)}</p>
              <p className="text-[10px] text-text-muted">{idleEvents.length} stops · 45 min+</p>
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
                  const tc  = CRIME_TYPE_COLORS[type] ?? "#6b7280";
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

          {/* Idle Events — 45 min+ stationary periods */}
          <div className="px-4 pb-3 border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Idle Events · 45 min+</p>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full border"
                style={{ color: idleColor(totalIdleMin), borderColor: idleColor(totalIdleMin) + "55", background: idleColor(totalIdleMin) + "11" }}>
                {idleEvents.length} stops
              </span>
            </div>
            {idleEvents.length === 0 ? (
              <div className="text-[11px] text-text-muted text-center py-4 bg-surface-L2 rounded-xl border border-border">
                No idle events detected
              </div>
            ) : (
              <div className="space-y-2">
                {idleEvents.map((evt, i) => {
                  const h   = Math.floor(evt.durationMin / 60);
                  const m   = evt.durationMin % 60;
                  const dur = h > 0 ? `${h}h ${m}m` : `${m} min`;
                  const c   = idleColor(evt.durationMin);
                  return (
                    <div key={i} className="rounded-xl px-3 py-2.5 border"
                      style={{ background: c + "08", borderColor: c + "33" }}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm shrink-0">⏸</span>
                          <span className="text-[10px] font-bold truncate" style={{ color: c }}>{evt.locationName}</span>
                        </div>
                        <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: c }}>{dur}</span>
                      </div>
                      <div className="text-[9px] text-text-muted space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span>🕐</span>
                          <span>{evt.startTime} – {evt.endTime}</span>
                        </div>
                        <div className="flex items-start gap-1 mt-1">
                          <span className="shrink-0">📋</span>
                          <span className="text-slate-400">{evt.reason}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fleet overview */}
          <div className="px-4 pb-4 border-t border-border pt-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Fleet Overview</p>
            <div className="space-y-1">
              {([1, 2, 3, 4] as const).map(id => {
                const s      = computeStats(generateDemoTrail(id), id);
                const c      = VEHICLE_COLORS[id];
                const crew   = PATROL_PERSONNEL[id] ?? [];
                const jobs   = PATROL_COMPLAINTS[id] ?? [];
                const idles  = IDLE_EVENTS[id] ?? [];
                const idleTotal = idles.reduce((acc, e) => acc + e.durationMin, 0);
                const ic     = idleColor(idleTotal);
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
                      <p className="text-[11px] font-bold text-text-primary">PPV-{id}</p>
                      <p className="text-[9px] text-text-muted">{crew.length} officers · {jobs.length} complaints</p>
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-0.5">
                      <span className="text-[10px] text-text-muted tabular-nums">{s.distanceKm} km</span>
                      <span className="text-[9px] font-bold tabular-nums" style={{ color: ic }}>⏸ {idles.length} idle</span>
                    </div>
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
