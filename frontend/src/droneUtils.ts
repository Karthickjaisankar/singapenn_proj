import L from "leaflet";

export const DRONE_COLORS: Record<number, string> = { 101: "#06b6d4", 102: "#67e8f9" };
export const DRONE_CENTER: [number, number] = [12.9349, 80.1706];
export const DRONE_R_LAT     = 0.018;
export const DRONE_R_LNG     = 0.024;
export const DRONE_PERIOD_MS = 180_000; // 3-minute figure-8 loop
export const DRONE_IDS       = [101, 102] as const;

export function dronePosition(droneId: number, nowMs: number): [number, number] {
  const t = ((nowMs % DRONE_PERIOD_MS) / DRONE_PERIOD_MS) * 2 * Math.PI
            + (droneId - 101) * Math.PI;
  const denom = 1 + Math.cos(t) ** 2;
  return [
    DRONE_CENTER[0] + DRONE_R_LAT * Math.sin(t) * Math.cos(t) / denom,
    DRONE_CENTER[1] + DRONE_R_LNG * Math.sin(t) / denom,
  ];
}

export function createDroneIcon(droneId: number): L.DivIcon {
  const color = DRONE_COLORS[droneId] ?? "#06b6d4";
  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="43" y="43" width="14" height="14" rx="3" fill="${color}" opacity=".95"/>
    <line x1="50" y1="50" x2="22" y2="22" stroke="${color}" stroke-width="4" opacity=".8"/>
    <line x1="50" y1="50" x2="78" y2="22" stroke="${color}" stroke-width="4" opacity=".8"/>
    <line x1="50" y1="50" x2="22" y2="78" stroke="${color}" stroke-width="4" opacity=".8"/>
    <line x1="50" y1="50" x2="78" y2="78" stroke="${color}" stroke-width="4" opacity=".8"/>
    <circle cx="22" cy="22" r="9" fill="${color}" opacity=".7" style="transform-origin:22px 22px;animation:drone-rotor 0.35s linear infinite"/>
    <circle cx="78" cy="22" r="9" fill="${color}" opacity=".7" style="transform-origin:78px 22px;animation:drone-rotor 0.35s linear infinite reverse"/>
    <circle cx="22" cy="78" r="9" fill="${color}" opacity=".7" style="transform-origin:22px 78px;animation:drone-rotor 0.35s linear infinite reverse"/>
    <circle cx="78" cy="78" r="9" fill="${color}" opacity=".7" style="transform-origin:78px 78px;animation:drone-rotor 0.35s linear infinite"/>
    <circle cx="50" cy="60" r="3" fill="#0f172a" opacity=".9"/>
  </svg>`;
  const inner = `width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.88);border:2px solid ${color}99;border-radius:50%;box-shadow:0 0 10px ${color}55;`;
  return L.divIcon({
    html: `<div style="width:54px;height:54px;display:flex;align-items:center;justify-content:center;"><div style="${inner}">${svg}</div></div>`,
    className: "",
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  });
}

export function dronePopupHtml(droneId: number): string {
  const color = DRONE_COLORS[droneId] ?? "#06b6d4";
  return `<div style="font-size:12px;min-width:160px">
    <div style="font-weight:700;color:${color};font-size:13px;margin-bottom:6px">Drone ${droneId - 100}</div>
    <div style="font-size:11px;line-height:1.9;color:#94a3b8">
      <div>🛸 <span style="color:#e2e8f0;font-weight:600">UAV Surveillance</span></div>
      <div>📡 <span style="color:#e2e8f0">Active · Aerial Patrol</span></div>
    </div>
  </div>`;
}
