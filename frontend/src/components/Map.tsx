import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.heat";
import { Delaunay } from "d3-delaunay";
import { Crime, PatrolZone, PatrolVehicle, Venue, AlertRow } from "../types";

// Corrected center: Tambaram + Pallikaranai area of Chennai
const MAP_CENTER: [number, number] = [12.9349, 80.1706];
const MAP_ZOOM = 12;

// Police station sub-areas with known crime counts from the dataset
const STATIONS = [
  { name: "Tambaram AWPS",    lat: 12.9398, lng: 80.1323, crimes: 38  },
  { name: "Pallavaram AWPS",  lat: 12.9657, lng: 80.1588, crimes: 96  },
  { name: "Vandalur AWPS",    lat: 12.9314, lng: 80.1496, crimes: 109 },
  { name: "Selaiyur AWPS",    lat: 12.9313, lng: 80.1746, crimes: 87  },
  { name: "Semmenchery AWPS", lat: 12.9344, lng: 80.2120, crimes: 95  },
  { name: "Kelambakkam AWPS", lat: 12.9132, lng: 80.1903, crimes: 64  },
  { name: "Kannagi Nagar",    lat: 12.9487, lng: 80.2112, crimes: 12  },
  { name: "Perumpakkam",      lat: 12.9189, lng: 80.1962, crimes: 18  },
] as const;

const MAX_STATION_CRIMES = 109;

type MapMode = "zones" | "crimes";

function crimeCountColor(n: number): string {
  const r = n / MAX_STATION_CRIMES;
  if (r > 0.75) return "#dc2626";
  if (r > 0.5)  return "#f97316";
  if (r > 0.25) return "#eab308";
  return "#22c55e";
}

function severityColor(s?: string): string {
  if (s === "severe")   return "#dc2626";
  if (s === "moderate") return "#f59e0b";
  return "#22c55e";
}

// Tight 12-point oval (~300m radius) used while OSRM patrol route loads
function syntheticPatrol(lat: number, lng: number): [number, number][] {
  const d = 0.003;
  const pts: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    pts.push([lat + d * Math.sin(a), lng + d * 0.8 * Math.cos(a)]);
  }
  return pts;
}

// Fetch a road-following patrol circuit from OSRM for one vehicle
async function fetchOsrmPatrol(lat: number, lng: number): Promise<[number, number][]> {
  const R = 0.006; // ~650m radius waypoints
  const circuit = [
    [lat,         lng        ],
    [lat + R,     lng + R * 0.6],
    [lat + R * 0.3, lng + R  ],
    [lat - R * 0.3, lng + R  ],
    [lat - R,     lng + R * 0.6],
    [lat - R,     lng - R * 0.6],
    [lat - R * 0.3, lng - R  ],
    [lat + R * 0.3, lng - R  ],
    [lat + R,     lng - R * 0.6],
    [lat,         lng        ], // close loop
  ].map(([la, ln]) => `${ln},${la}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${circuit}?geometries=geojson&overview=full&steps=false`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!data.routes?.[0]) throw new Error("no route");
  return (data.routes[0].geometry.coordinates as [number, number][]).map(
    ([ln, la]) => [la, ln] as [number, number]
  );
}

// Emoji badges — clean and universally readable at small sizes
const VENUE_EMOJI: Record<string, { emoji: string; color: string; label: string }> = {
  school:     { emoji: "🏫", color: "#3b82f6", label: "School"     },
  college:    { emoji: "🎓", color: "#8b5cf6", label: "College"    },
  hospital:   { emoji: "🏥", color: "#10b981", label: "Hospital"   },
  restaurant: { emoji: "🍽️", color: "#ef4444", label: "Restaurant" },
  bar:        { emoji: "🍺", color: "#f97316", label: "Bar"        },
  mall:       { emoji: "🛍️", color: "#06b6d4", label: "Mall"       },
};

function getVenueEmoji(type: string) {
  return VENUE_EMOJI[type] ?? VENUE_EMOJI.restaurant;
}

// Fixed identity color per vehicle — consistent across patrol and responding states
const VEHICLE_COLORS: Record<number, string> = {
  1: "#3b82f6", // blue
  2: "#10b981", // emerald
  3: "#a855f7", // violet
  4: "#f59e0b", // amber
};

function vehicleColor(id: number): string {
  return VEHICLE_COLORS[id] ?? "#ec4899";
}

function createVehicleIcon(id: number, status: string): L.DivIcon {
  const color = vehicleColor(id);
  const responding = status === "responding";
  const gradId = `vg${id}`;
  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${color};stop-opacity:1"/>
        <stop offset="100%" style="stop-color:${color}cc;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <path d="M20 55 L25 40 L40 35 L60 35 L75 40 L80 55 L85 60 L85 70 Q85 75 80 75 L20 75 Q15 75 15 70 L15 60 Z"
      fill="url(#${gradId})" />
    <polygon points="30,40 45,38 45,48 30,50" fill="#87ceeb" opacity=".7"/>
    <polygon points="55,38 70,40 70,50 55,48" fill="#87ceeb" opacity=".7"/>
    <circle cx="32" cy="75" r="8" fill="#1f2937"/>
    <circle cx="32" cy="75" r="5" fill="#4b5563"/>
    <circle cx="68" cy="75" r="8" fill="#1f2937"/>
    <circle cx="68" cy="75" r="5" fill="#4b5563"/>
    <circle cx="82" cy="58" r="2.5" fill="#fbbf24" opacity=".9"/>
    ${responding ? `<circle cx="50" cy="20" r="8" fill="#ef4444" opacity=".95"/>
    <text x="50" y="24" text-anchor="middle" font-size="10" font-weight="900" fill="white">!</text>` : ""}
  </svg>`;
  // Responding: add pulsing orange outer ring via box-shadow animation
  const outerStyle = responding
    ? `width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;animation:vehicle-dispatch-pulse 1.2s ease-in-out infinite;`
    : `width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;`;
  const innerStyle = `width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.9);border:2.5px solid ${color};border-radius:8px;box-shadow:0 4px 14px ${color}55`;
  return L.divIcon({
    html: `<div style="${outerStyle}"><div style="${innerStyle}">${svg}</div></div>`,
    className: "",
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  });
}

interface MapProps {
  crimes: Crime[];
  hotspots: PatrolZone[];
  vehicles: PatrolVehicle[];
  venues: Venue[];
  isLoading?: boolean;
  activeAlerts?: AlertRow[];
  liveAlertLocations?: Record<number, { lat: number; lng: number }>;
  selectedAlertId?: number | null;
  onResetView?: () => void;
  vehicleAssignments?: Record<number, number>;
  onVehicleReached?: (vehicleId: number) => void;
  hideCrimes?: boolean;
  venueZoomThreshold?: number;
}

export default function Map({
  crimes, hotspots, vehicles, venues, isLoading, activeAlerts, liveAlertLocations,
  selectedAlertId, onResetView, vehicleAssignments, onVehicleReached,
  hideCrimes, venueZoomThreshold,
}: MapProps) {
  const mapEl  = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Data layers (cleared + rebuilt on mode/data change)
  const layerRefsRef = useRef<Record<string, L.Layer>>({});

  // Vehicle markers live in their own refs so animation can mutate them independently
  const vehicleMarkersRef = useRef<Record<number, L.Marker>>({});
  const waypointsRef      = useRef<Record<number, [number, number][]>>({});
  const wpIdxRef          = useRef<Record<number, number>>({});
  const vehiclePosRef     = useRef<Record<number, { fromLat: number; fromLng: number; toLat: number; toLng: number; t: number }>>({});
  const animRef           = useRef<number | null>(null);
  const iAmHereRef        = useRef<L.Marker | null>(null);
  const dispatchLinesRef  = useRef<Record<number, L.Polyline>>({});
  const vehicleAssignmentsRef = useRef<Record<number, number>>({});  // vehicleId → alertId
  const reachedRef        = useRef<Set<number>>(new Set());          // vehicleIds that reached
  const onVehicleReachedRef = useRef<((vid: number) => void) | undefined>(undefined);

  // Venue layer lives in its own ref so zoom-gating can toggle it without re-rendering
  const venueLayerRef         = useRef<L.LayerGroup | null>(null);
  const showVenuesRef         = useRef(true); // kept in sync below
  const venueZoomThresholdRef = useRef(venueZoomThreshold ?? 14);

  const [mode, setMode]             = useState<MapMode>("crimes");
  const [showVenues, setShowVenues]   = useState(true);
  const [showAlerts, setShowAlerts]   = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  useEffect(() => { showVenuesRef.current = showVenues; }, [showVenues]);
  useEffect(() => { onVehicleReachedRef.current = onVehicleReached; }, [onVehicleReached]);
  useEffect(() => { venueZoomThresholdRef.current = venueZoomThreshold ?? 14; }, [venueZoomThreshold]);

  // ── Effect 1: init map + static district polygons (runs once) ─────────────
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const m = L.map(mapEl.current, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(m);

    // District boundary borders — permanent layers, visible in both map modes
    const fetchBoundary = (
      url: string,
      color: string,
      label: string,
    ) => {
      fetch(url, { headers: { "User-Agent": "singapen-app/1.0", "Accept-Language": "en" } })
        .then(r => r.json())
        .then(data => {
          const features = data.features ?? (data.type === "FeatureCollection" ? [] : [data]);
          const poly = features.find(
            (f: any) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
          );
          if (poly && mapRef.current) {
            L.geoJSON(poly, {
              style: { color, weight: 3, opacity: 0.85, fill: false },
            }).bindTooltip(label, { sticky: true }).addTo(mapRef.current);
          }
        })
        .catch(() => {});
    };

    // Tambaram taluk — confirmed OSM relation R10326121
    fetchBoundary(
      "https://nominatim.openstreetmap.org/lookup?osm_ids=R10326121&format=geojson&polygon_geojson=1",
      "#818cf8",
      "Tambaram Taluk",
    );
    // Pallikaranai — search by name, take first polygon result
    fetchBoundary(
      "https://nominatim.openstreetmap.org/search?q=Pallikaranai,Chennai&countrycodes=in&format=geojson&polygon_geojson=1&limit=1",
      "#22d3ee",
      "Pallikaranai",
    );

    // Zoom-gate venues: show at zoom ≥ threshold (default 14), hide below
    m.on("zoomend", () => {
      if (!venueLayerRef.current) return;
      const shouldShow = showVenuesRef.current && m.getZoom() >= venueZoomThresholdRef.current;
      if (shouldShow && !m.hasLayer(venueLayerRef.current)) venueLayerRef.current.addTo(m);
      else if (!shouldShow && m.hasLayer(venueLayerRef.current)) m.removeLayer(venueLayerRef.current);
    });

    // District name labels (no polygon borders — approximate polygons look artificial)
    const addDistrictLabel = (lat: number, lng: number, text: string) => {
      L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="font-size:13px;font-weight:800;color:#0f172a;background:rgba(255,255,255,0.92);padding:3px 9px;border-radius:5px;box-shadow:0 1px 5px rgba(0,0,0,0.18);pointer-events:none;white-space:nowrap;border-left:3px solid #1e293b">${text}</div>`,
          className: "",
          iconAnchor: [0, 0],
        }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(m);
    };
    addDistrictLabel(13.02, 80.07, "Tambaram");
    addDistrictLabel(12.95, 80.26, "Pallikaranai");

    // Zoom controls (floating, top-right)
    L.control.zoom({ position: "topright" }).addTo(m);

    mapRef.current = m;
    return () => {};
  }, []);

  // ── Effect 2: data layers (stations, crimes, venues, alerts) ─────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    Object.values(layerRefsRef.current).forEach(l => m.removeLayer(l));
    layerRefsRef.current = {};

    const validCrimes = crimes.filter(c => c.lat != null && c.lng != null);

    const stationGroup = L.layerGroup();

    if (mode === "zones") {
      // Voronoi choropleth — full area fill per station, colored by crime count
      // Bounding box covers the full SSF operations area
      const BBOX: [number, number, number, number] = [79.85, 12.70, 80.40, 13.20];
      // d3-delaunay works in [x, y] = [lng, lat] space
      const pts = STATIONS.map(s => [s.lng, s.lat] as [number, number]);
      const delaunay = Delaunay.from(pts);
      const voronoi = delaunay.voronoi(BBOX);

      STATIONS.forEach((s, i) => {
        const cell = voronoi.cellPolygon(i);
        if (!cell) return;
        // cell is [[lng, lat], ...] — convert to Leaflet [lat, lng]
        const latLngs = cell.map((pt: number[]) => [pt[1], pt[0]] as [number, number]);
        const color = crimeCountColor(s.crimes);

        L.polygon(latLngs, {
          fillColor: color,
          fillOpacity: 0.22,
          color: color,
          weight: 1,
          opacity: 0.5,
        })
          .bindTooltip(`<b>${s.name}</b><br/>${s.crimes} crimes`, { sticky: true })
          .addTo(stationGroup);

        // Station centroid dot + label
        L.circleMarker([s.lat, s.lng], {
          radius: 6, fillColor: color, color: "#fff", weight: 1.5, fillOpacity: 1,
        }).addTo(stationGroup);

        L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            html: `<div style="font-size:9px;font-weight:700;color:#1e293b;background:rgba(255,255,255,0.9);padding:1px 5px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.15);pointer-events:none;white-space:nowrap;margin-top:4px">${s.name}</div>`,
            className: "",
            iconAnchor: [0, -2],
          }),
          interactive: false,
        }).addTo(stationGroup);
      });
    } else {
      // Crime View — just faint station outlines for geographic reference
      STATIONS.forEach(s => {
        L.circle([s.lat, s.lng], {
          radius: 1800, fillOpacity: 0, color: "#94a3b8", weight: 1, opacity: 0.22, dashArray: "4 4",
        }).addTo(stationGroup);
        L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            html: `<div style="font-size:9px;font-weight:700;color:#1e293b;background:rgba(255,255,255,0.86);padding:1px 5px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.12);pointer-events:none;white-space:nowrap">${s.name}</div>`,
            className: "",
            iconAnchor: [0, 8],
          }),
          interactive: false,
        }).addTo(stationGroup);
      });
    }

    stationGroup.addTo(m);
    layerRefsRef.current.stations = stationGroup;

    if (!hideCrimes && mode === "crimes" && validCrimes.length > 0) {
      // Heatmap — only when explicitly enabled
      if (showHeatmap) {
        const heatPoints: [number, number, number][] = validCrimes.map(c => [
          c.lat!, c.lng!,
          c.severity === "severe" ? 1.0 : c.severity === "moderate" ? 0.6 : 0.3,
        ]);
        const heat = (L as any).heatLayer(heatPoints, {
          radius: 15,
          blur: 12,
          max: 0.22,
          maxZoom: 13,
          gradient: { 0.0: "#3b82f6", 0.45: "#0891b2", 0.72: "#eab308", 0.9: "#f97316", 1.0: "#dc2626" },
        });
        heat.addTo(m);
        layerRefsRef.current.heatmap = heat;
      }

      // Crime clusters — compact sizing
      const clusterGroup = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
        iconCreateFunction: (c: any) => {
          const n = c.getChildCount();
          const children = c.getAllChildMarkers();
          let maxSev = "low";
          for (const mk of children) {
            const sev = (mk.options as any).crimeSeverity;
            if (sev === "severe") { maxSev = "severe"; break; }
            if (sev === "moderate") maxSev = "moderate";
          }
          const color = severityColor(maxSev);
          const size = n >= 50 ? 40 : n >= 15 ? 32 : 26;
          return L.divIcon({
            html: `<div style="width:${size}px;height:${size}px;background:${color};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.22)">${n}</div>`,
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
      validCrimes.forEach(c => {
        const icon = L.divIcon({
          html: `<div style="width:8px;height:8px;background:${severityColor(c.severity)};border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.2)"></div>`,
          className: "",
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        });
        clusterGroup.addLayer(
          L.marker([c.lat!, c.lng!], { icon, crimeSeverity: c.severity } as any)
            .bindPopup(
              `<div style="font-size:12px;min-width:180px">
                <div style="font-weight:700;color:#1e40af;margin-bottom:3px">${c.head}</div>
                <div style="color:#475569;font-size:11px">
                  <div><b>Place:</b> ${c.place_of_crime}</div>
                  <div><b>Severity:</b> <span style="color:${severityColor(c.severity)};font-weight:600">${c.severity}</span></div>
                  ${c.date_of_occurrence ? `<div><b>Date:</b> ${c.date_of_occurrence}</div>` : ""}
                </div>
              </div>`
            )
        );
      });
      clusterGroup.addTo(m);
      layerRefsRef.current.clusters = clusterGroup;
    }

    // Venues — zoom-gated: only render when zoomed in to zoom ≥ 14
    if (venueLayerRef.current) { venueLayerRef.current.remove(); venueLayerRef.current = null; }
    if (venues.length > 0) {
      const venueGroup = L.layerGroup();
      venues.forEach(v => {
        const ve = getVenueEmoji(v.type);
        const icon = L.divIcon({
          html: `<div style="width:22px;height:22px;background:#fff;border:1.5px solid ${ve.color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,0.18);line-height:1">${ve.emoji}</div>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([v.lat, v.lng], { icon })
          .bindPopup(
            `<div style="font-size:12px">
              <b style="color:${ve.color}">${ve.emoji} ${v.name}</b>
              <div style="color:#475569;font-size:11px;margin-top:2px">${ve.label}</div>
              ${v.address ? `<div style="color:#475569;font-size:10px;margin-top:1px">${v.address}</div>` : ""}
            </div>`
          )
          .on("mouseover", function(this: L.Marker) { this.openPopup(); })
          .on("mouseout",  function(this: L.Marker) { this.closePopup(); })
          .addTo(venueGroup);
      });
      venueLayerRef.current = venueGroup;
      // Only add to map if checkbox is on AND zoomed in enough
      if (showVenues && m.getZoom() >= venueZoomThresholdRef.current) venueGroup.addTo(m);
    }

    // SOS / active alert markers — severity-colored, triple-ring glow
    if (showAlerts && activeAlerts && activeAlerts.length > 0) {
      const alertGroup = L.layerGroup();
      activeAlerts.forEach(alert => {
        const loc = liveAlertLocations?.[alert.id] ?? { lat: alert.lat, lng: alert.lng };
        if (!loc?.lat || !loc?.lng) return;

        const sev   = alert.alert_type.toLowerCase();
        const color =
          ["assault","rape","molestation","abduction","kidnap","pocso","sos"].some(k => sev.includes(k))
            ? "#dc2626"
            : ["harassment","stalking","threat"].some(k => sev.includes(k))
              ? "#f97316"
              : "#22c55e";
        const rgb =
          color === "#dc2626" ? "220,38,38" :
          color === "#f97316" ? "249,115,22" : "34,197,94";

        const icon = L.divIcon({
          html: `
            <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
              <div style="position:absolute;width:40px;height:40px;border-radius:50%;
                background:rgba(${rgb},0.15);border:2px solid rgba(${rgb},0.35);
                animation:alert-ring 1.8s ease-out infinite;"></div>
              <div style="position:absolute;width:26px;height:26px;border-radius:50%;
                background:rgba(${rgb},0.25);border:2px solid rgba(${rgb},0.6);
                animation:alert-ring 1.8s ease-out 0.6s infinite;"></div>
              <div style="position:relative;width:16px;height:16px;border-radius:50%;
                background:${color};border:2.5px solid #fff;
                box-shadow:0 0 10px ${color},0 2px 6px rgba(0,0,0,0.3);
                z-index:1;"></div>
            </div>`,
          className: "",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        L.marker([loc.lat, loc.lng], { icon, zIndexOffset: 2000 })
          .bindPopup(
            `<div style="font-size:12px;min-width:160px">
              <b style="color:${color}">⚠ ${alert.alert_type.toUpperCase()}</b>
              <div style="color:#475569;font-size:11px;margin-top:3px">
                <div><b>Status:</b> ${alert.status}</div>
                <div><b>ID:</b> #${alert.id}</div>
                ${alert.description ? `<div><b>Note:</b> ${alert.description}</div>` : ""}
              </div>
            </div>`
          )
          .addTo(alertGroup);
      });
      alertGroup.addTo(m);
      layerRefsRef.current.alerts = alertGroup;
    }
  }, [crimes, hotspots, venues, mode, showVenues, showAlerts, showHeatmap, activeAlerts, liveAlertLocations, hideCrimes]);

  // ── Effect 3: "I'm here" pin for selected alert (no aggressive zoom) ─────
  useEffect(() => {
    // Always remove old pin first
    if (iAmHereRef.current) {
      iAmHereRef.current.remove();
      iAmHereRef.current = null;
    }

    if (!selectedAlertId || !mapRef.current) {
      // Deselected — fly back to monitoring overview
      mapRef.current?.flyTo(MAP_CENTER, MAP_ZOOM, { animate: true, duration: 0.9 });
      return;
    }

    const alert = activeAlerts?.find(a => a.id === selectedAlertId);
    if (!alert?.lat || !alert?.lng) return;

    // Snap out-of-zone demo GPS to patrol centre so pin lands on map
    const lat = alert.lat >= 12.70 && alert.lat <= 13.20 ? alert.lat : MAP_CENTER[0];
    const lng = alert.lng >= 79.85 && alert.lng <= 80.40 ? alert.lng : MAP_CENTER[1];

    // Pan gently to the pin — do NOT zoom in past current level
    mapRef.current.panTo([lat, lng], { animate: true, duration: 0.6 });

    // "I'm here" pulsing pin
    const pin = L.divIcon({
      className: "",
      html: `<div class="iam-here-outer" style="
        width:52px;height:52px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        background:rgba(239,68,68,0.12);">
        <div style="
          width:22px;height:22px;border-radius:50%;
          background:#ef4444;border:3px solid white;
          box-shadow:0 0 14px rgba(239,68,68,0.9);">
        </div>
      </div>`,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
    });

    iAmHereRef.current = L.marker([lat, lng], { icon: pin, zIndexOffset: 2000 })
      .bindTooltip("📍 Alert here", { permanent: false, direction: "top", offset: [0, -28] })
      .addTo(mapRef.current);
  }, [selectedAlertId, activeAlerts]);

  // ── Effect 4: vehicle markers + OSRM patrol + smooth lerp animation ─────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (animRef.current !== null) clearInterval(animRef.current);
    Object.values(vehicleMarkersRef.current).forEach(mk => m.removeLayer(mk));
    vehicleMarkersRef.current = {};
    waypointsRef.current = {};
    wpIdxRef.current = {};
    vehiclePosRef.current = {};
    reachedRef.current = new Set();

    if (!vehicles.length) return;

    vehicles.forEach(v => {
      // Start with synthetic patrol; OSRM upgrade arrives async below
      const startIdx = (v.id * 3) % 12;
      const synthetic = syntheticPatrol(v.lat, v.lng);
      waypointsRef.current[v.id] = synthetic;
      wpIdxRef.current[v.id] = startIdx;
      vehiclePosRef.current[v.id] = {
        fromLat: synthetic[startIdx][0],
        fromLng: synthetic[startIdx][1],
        toLat:   synthetic[(startIdx + 1) % synthetic.length][0],
        toLng:   synthetic[(startIdx + 1) % synthetic.length][1],
        t: 0,
      };

      const mk = L.marker([synthetic[startIdx][0], synthetic[startIdx][1]], {
        icon: createVehicleIcon(v.id, v.status),
        zIndexOffset: 1000,
      });
      mk.bindPopup(
        `<div style="font-size:12px;min-width:200px">
          <div style="font-weight:700;color:${vehicleColor(v.id)};font-size:13px">SSF-${v.id}</div>
          <div style="color:#475569;font-size:11px;margin-top:4px;line-height:1.6">
            <div><b>Status:</b> <span style="text-transform:capitalize;font-weight:600">${v.status}</span></div>
            <div><b>Zone:</b> ${v.zone_id}</div>
          </div>
        </div>`
      );
      mk.on("mouseover", function(this: L.Marker) { this.openPopup(); });
      mk.on("mouseout",  function(this: L.Marker) { this.closePopup(); });
      mk.addTo(m);
      vehicleMarkersRef.current[v.id] = mk;

      // Upgrade patrol waypoints to road-following OSRM route (async)
      fetchOsrmPatrol(v.lat, v.lng)
        .then(roadWps => {
          if (!waypointsRef.current[v.id] || vehicleAssignmentsRef.current[v.id]) return; // dispatched mid-load
          const cur = vehicleMarkersRef.current[v.id]?.getLatLng();
          if (!cur) return;
          // Find nearest waypoint in the road route to current position
          let nearestIdx = 0;
          let nearestDist = Infinity;
          roadWps.forEach(([la, ln], i) => {
            const d = Math.hypot(la - cur.lat, ln - cur.lng);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          });
          waypointsRef.current[v.id] = roadWps;
          wpIdxRef.current[v.id] = nearestIdx;
          vehiclePosRef.current[v.id] = {
            fromLat: cur.lat, fromLng: cur.lng,
            toLat: roadWps[(nearestIdx + 1) % roadWps.length][0],
            toLng: roadWps[(nearestIdx + 1) % roadWps.length][1],
            t: 0,
          };
        })
        .catch(() => {}); // keep synthetic on failure
    });

    // Smooth lerp at 50ms, 0.8% per tick ≈ ~city speed on OSRM route
    animRef.current = window.setInterval(() => {
      vehicles.forEach(v => {
        const pos = vehiclePosRef.current[v.id];
        const mk  = vehicleMarkersRef.current[v.id];
        if (!pos || !mk || reachedRef.current.has(v.id)) return;

        pos.t = Math.min(1, pos.t + 0.008);
        mk.setLatLng([
          pos.fromLat + (pos.toLat - pos.fromLat) * pos.t,
          pos.fromLng + (pos.toLng - pos.fromLng) * pos.t,
        ]);

        if (pos.t >= 1) {
          const wps  = waypointsRef.current[v.id];
          const ni   = (wpIdxRef.current[v.id] + 1) % wps.length;
          const isLast = vehicleAssignmentsRef.current[v.id] !== undefined
            && ni >= wps.length - 2;

          if (isLast && !reachedRef.current.has(v.id)) {
            // Vehicle reached crime location
            reachedRef.current.add(v.id);
            onVehicleReachedRef.current?.(v.id);
            // Stop at destination — don't advance further
            return;
          }

          wpIdxRef.current[v.id] = ni;
          pos.fromLat = pos.toLat; pos.fromLng = pos.toLng;
          pos.toLat = wps[(ni + 1) % wps.length][0];
          pos.toLng = wps[(ni + 1) % wps.length][1];
          pos.t = 0;
        }
      });
    }, 50);

    return () => {
      if (animRef.current !== null) clearInterval(animRef.current);
      Object.values(vehicleMarkersRef.current).forEach(mk => { mapRef.current?.removeLayer(mk); });
      vehicleMarkersRef.current = {};
    };
  }, [vehicles]);

  // ── Effect 5: dispatch routing — dotted OSRM line + redirect vehicle ────────
  useEffect(() => {
    if (!mapRef.current || !vehicleAssignments) return;
    const m = mapRef.current;

    // New assignments
    Object.entries(vehicleAssignments).forEach(([vidStr, alertId]) => {
      const vid = Number(vidStr);
      if (vehicleAssignmentsRef.current[vid] === alertId) return; // already routed
      vehicleAssignmentsRef.current[vid] = alertId;
      reachedRef.current.delete(vid); // reset reached flag for re-dispatch

      const alert = activeAlerts?.find(a => a.id === alertId);
      if (!alert) return;

      // If alert GPS is outside the patrol area (demo data from other districts),
      // pick one of the AWPS station locations as the crime target so the route
      // is non-trivial and clearly visible on the map.
      const AWPS_FALLBACKS: [number, number][] = [
        [12.9657, 80.1588], // Pallavaram AWPS
        [12.9314, 80.1496], // Vandalur AWPS
        [12.9313, 80.1746], // Selaiyur AWPS
        [12.9344, 80.2120], // Semmenchery AWPS
        [12.9132, 80.1903], // Kelambakkam AWPS
        [12.9398, 80.1323], // Tambaram AWPS
      ];
      const inRange = alert.lat >= 12.70 && alert.lat <= 13.20 &&
                      alert.lng >= 79.85 && alert.lng <= 80.40;
      const [tLat, tLng]: [number, number] = inRange
        ? [alert.lat, alert.lng]
        : AWPS_FALLBACKS[alertId % AWPS_FALLBACKS.length];

      const mk = vehicleMarkersRef.current[vid];
      // Ensure cur ≠ target even if vehicle happens to sit exactly at the fallback
      const rawCur = mk?.getLatLng() ?? { lat: tLat - 0.008, lng: tLng };
      const cur = Math.abs(rawCur.lat - tLat) < 0.0005 && Math.abs(rawCur.lng - tLng) < 0.0005
        ? { lat: tLat - 0.008, lng: tLng - 0.008 }
        : rawCur;

      const doRoute = (routeCoords: [number, number][]) => {
        // Replace patrol waypoints with dispatch route
        waypointsRef.current[vid] = routeCoords;
        wpIdxRef.current[vid] = 0;
        vehiclePosRef.current[vid] = {
          fromLat: cur.lat, fromLng: cur.lng,
          toLat: routeCoords[0][0], toLng: routeCoords[0][1],
          t: 0,
        };
        // Switch icon to "responding" state (pulsing red ring)
        mk?.setIcon(createVehicleIcon(vid, "responding"));

        // Remove old lines (halo + colored)
        (dispatchLinesRef.current[vid] as any)?._halo?.remove();
        dispatchLinesRef.current[vid]?.remove();

        // Dark outer shadow for maximum contrast on any tile background
        const halo = L.polyline(routeCoords, {
          color: "#0f172a", weight: 10, opacity: 0.5,
        }).addTo(m);

        const line = L.polyline(routeCoords, {
          color: vehicleColor(vid), weight: 5, dashArray: "16 8", opacity: 1.0,
        }).addTo(m);

        // Attach halo reference so we can clean it up later
        (line as any)._halo = halo;
        dispatchLinesRef.current[vid] = line;

        // Fit map to show ALL currently active dispatch routes
        try {
          const allPts: [number, number][] = [[cur.lat, cur.lng], [tLat, tLng]];
          // Add endpoints of already-assigned vehicles
          Object.entries(vehicleAssignmentsRef.current).forEach(([existVid, existAlertId]) => {
            if (Number(existVid) === vid) return; // already included
            const existAlert = activeAlerts?.find(a => a.id === existAlertId);
            const existMk = vehicleMarkersRef.current[Number(existVid)];
            if (existMk) allPts.push([existMk.getLatLng().lat, existMk.getLatLng().lng]);
            if (existAlert) {
              const inRng = existAlert.lat >= 12.70 && existAlert.lat <= 13.20 &&
                            existAlert.lng >= 79.85 && existAlert.lng <= 80.40;
              allPts.push(inRng
                ? [existAlert.lat, existAlert.lng]
                : AWPS_FALLBACKS[existAlert.id % AWPS_FALLBACKS.length]);
            }
          });
          m.fitBounds(
            L.latLngBounds(allPts).pad(0.25),
            { maxZoom: 14, animate: true, duration: 0.8 }
          );
        } catch { /* ignore if bounds degenerate */ }
      };

      const osrmUrl =
        `https://router.project-osrm.org/route/v1/driving/${cur.lng},${cur.lat};${tLng},${tLat}` +
        `?geometries=geojson&overview=full&steps=false`;

      fetch(osrmUrl)
        .then(r => r.json())
        .then(data => {
          const coords: [number, number][] = (
            data.routes?.[0]?.geometry?.coordinates ?? []
          ).map(([ln, la]: number[]) => [la, ln] as [number, number]);
          if (coords.length < 2) throw new Error("short");
          doRoute(coords);
        })
        .catch(() => {
          // Fallback: straight line directly to crime
          doRoute([[cur.lat, cur.lng], [tLat, tLng]]);
        });
    });

    // Cleared assignments (resolve)
    Object.keys(vehicleAssignmentsRef.current).forEach(vidStr => {
      const vid = Number(vidStr);
      if (vehicleAssignments[vid] === undefined) {
        delete vehicleAssignmentsRef.current[vid];
        reachedRef.current.delete(vid);
        (dispatchLinesRef.current[vid] as any)?._halo?.remove();
        dispatchLinesRef.current[vid]?.remove();
        delete dispatchLinesRef.current[vid];
        // Restore patrol icon and resume movement from current position
        const mk = vehicleMarkersRef.current[vid];
        mk?.setIcon(createVehicleIcon(vid, "patrolling"));
        const v  = vehicles.find(x => x.id === vid);
        if (mk && v) {
          const cur = mk.getLatLng();
          const patrol = syntheticPatrol(cur.lat, cur.lng);
          waypointsRef.current[vid] = patrol;
          wpIdxRef.current[vid] = 0;
          vehiclePosRef.current[vid] = {
            fromLat: cur.lat, fromLng: cur.lng,
            toLat: patrol[1][0], toLng: patrol[1][1], t: 0,
          };
          fetchOsrmPatrol(cur.lat, cur.lng)
            .then(roadWps => {
              if (vehicleAssignmentsRef.current[vid]) return;
              waypointsRef.current[vid] = roadWps;
              wpIdxRef.current[vid] = 0;
              vehiclePosRef.current[vid] = {
                fromLat: cur.lat, fromLng: cur.lng,
                toLat: roadWps[1][0], toLng: roadWps[1][1], t: 0,
              };
            })
            .catch(() => {});
        }
      }
    });
  }, [vehicleAssignments, activeAlerts, vehicles]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <style>{`
        @keyframes sos-pulse {
          0%   { box-shadow: 0 0 0 4px rgba(220,38,38,0.55); }
          100% { box-shadow: 0 0 0 18px rgba(220,38,38,0); }
        }
        @keyframes vehicle-dispatch-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          55%       { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
        }
        @keyframes alert-ring {
          0%   { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <div ref={mapEl} className="absolute inset-0" />

      {/* View mode toggle + layer toggles — hidden in citizen mode */}
      {!hideCrimes && (
        <>
          <div className="absolute top-3 left-3 z-[1000] flex items-center bg-surface-L2/90 backdrop-blur-md border border-border rounded-xl p-1 shadow-lg gap-0.5">
            {(["zones", "crimes"] as MapMode[]).map(opt => (
              <button
                key={opt}
                onClick={() => setMode(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === opt
                    ? "bg-surface-L3 text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {opt === "zones" ? "Zone View" : "Crime View"}
              </button>
            ))}
          </div>

          <div className="absolute top-14 left-3 z-[1000] bg-surface-L2/90 backdrop-blur-md border border-border rounded-xl px-3 py-2.5 shadow-lg space-y-1.5">
            {([
              { label: "Heatmap", value: showHeatmap, set: setShowHeatmap, onlyInCrimes: true },
              { label: `Venues (zoom ${venueZoomThresholdRef.current}+)`, value: showVenues,  set: setShowVenues,  onlyInCrimes: false },
              { label: "Alerts",  value: showAlerts,  set: setShowAlerts,  onlyInCrimes: false },
            ] as const).map(({ label, value, set, onlyInCrimes }) => (
              (!onlyInCrimes || mode === "crimes") && (
                <label key={label} className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary hover:text-text-primary transition">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={e => (set as (v: boolean) => void)(e.target.checked)}
                    className="w-3 h-3 accent-blue-400"
                  />
                  <span>{label}</span>
                </label>
              )
            ))}
          </div>
        </>
      )}

      {/* Reset view button — appears when a complaint is selected */}
      {selectedAlertId && (
        <button
          onClick={onResetView}
          className="absolute top-3 right-14 z-[1000] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-L2/90 backdrop-blur-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-L2 shadow-lg transition"
        >
          ↩ Reset view
        </button>
      )}

      {/* Legend */}
      {!hideCrimes && (<div className="absolute bottom-4 right-14 z-[1000] bg-surface-L2/90 backdrop-blur-md border border-border rounded-xl p-3 shadow-lg min-w-[140px]">
        {mode === "zones" ? (
          <>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Crime Count</p>
            {[
              { color: "#dc2626", label: "High  (90+)" },
              { color: "#f97316", label: "Med-H (60–90)" },
              { color: "#eab308", label: "Med   (30–60)" },
              { color: "#22c55e", label: "Low   (< 30)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1.5">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-text-secondary">{label}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Severity</p>
            {[
              { color: "#dc2626", label: "Severe" },
              { color: "#f59e0b", label: "Moderate" },
              { color: "#22c55e", label: "Low" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1.5">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-text-secondary">{label}</span>
              </div>
            ))}
          </>
        )}
        <div className="mt-2 pt-2 border-t border-border space-y-1.5">
          {([1, 2, 3, 4] as const).map(id => (
            <div key={id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ background: vehicleColor(id), boxShadow: `0 0 5px ${vehicleColor(id)}88` }}
              />
              <span className="text-[11px] text-text-secondary">SSF-{id}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0 bg-red-500 ring-2 ring-red-400/40" />
            <span className="text-[11px] text-text-secondary">SOS Alert</span>
          </div>
        </div>

        {showVenues && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Venues</p>
            <div className="space-y-1">
              {Object.values(VENUE_EMOJI).map(({ emoji, color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0"
                    style={{ background: `${color}22`, border: `1.5px solid ${color}66` }}
                  >
                    {emoji}
                  </span>
                  <span className="text-[11px] text-text-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>)}

      {isLoading && (
        <div className="absolute inset-0 bg-bg-dark/30 flex items-center justify-center z-[500]">
          <div className="bg-surface-L2/90 backdrop-blur-md text-text-secondary text-sm font-medium px-4 py-2.5 rounded-xl border border-border animate-pulse">
            Loading map data…
          </div>
        </div>
      )}
    </div>
  );
}
