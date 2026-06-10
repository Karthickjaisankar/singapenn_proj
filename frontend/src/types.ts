export interface Crime {
  id: number;
  district: string;
  police_station: string;
  year: number;
  fir_number: string;
  section: string;
  head: string;
  penetrative_type: string;
  place_of_crime: string;
  severity: "low" | "moderate" | "severe";
  lat: number | null;
  lng: number | null;
  date_of_occurrence: string | null;
  date_of_report: string | null;
  hour: number | null;
  time_slot: "morning" | "afternoon" | "night" | null;
}

export interface PatrolZone {
  zone_id: number;
  centroid_lat: number;
  centroid_lng: number;
  crime_count: number;
  severity_score: number;
  top_spots: Array<{
    place: string;
    severity: string;
    weight: number;
  }>;
  risk_score: number;
  recency_score: number;
  time_slot_risks: { morning: number; afternoon: number; night: number };
  crime_spot_coords: Array<[number, number]>;
}

export interface ZoneRisk {
  zone_id: number;
  risk_score: number;
  time_slot_multiplier: number;
  adjusted_risk: number;
}

export interface RoutingResponse {
  hour: number;
  time_slot: "morning" | "afternoon" | "night";
  zone_risks: ZoneRisk[];
  vehicles: PatrolVehicle[];
}

export interface PatrolVehicle {
  id: number;
  zone_id: number;
  lat: number;
  lng: number;
  status: "patrolling" | "responding" | "idle";
  current_route: Array<[number, number]>;
  incident_location: [number, number] | null;
}

export interface DroneVehicle {
  id: number;    // 101, 102 — never collides with PPV ids 1–4
  lat: number;
  lng: number;
  label: string; // "Drone 1", "Drone 2"
}

export interface Venue {
  id: string;
  name: string;
  type: "school" | "college" | "mall" | "bar" | "restaurant" | "hospital";
  lat: number;
  lng: number;
  address?: string;
}

export interface Stats {
  by_year: Record<number, number>;
  by_severity: Record<string, number>;
  by_head: Record<string, number>;
  by_district: Record<string, number>;
  by_month: Record<string, number>;
  by_police_station: Record<string, number>;
  by_head_by_year: Record<string, Record<string, number>>;
  by_time_slot: Record<string, number>;
}

export type TimeSlot = "all" | "morning" | "afternoon" | "night";

export type AlertType = "sos" | "harassment" | "suspicious" | "medical" | "other";
export type AlertStatus = "pending" | "acknowledged" | "dispatched" | "on_scene" | "resolved" | "cancelled";

export interface AlertMessage {
  id: number;
  alert_id: number;
  sender_id: number;
  sender_role: string;
  body: string;
  created_at: string;
}

export interface CommissionerSummary {
  today_total: number;
  today_resolved: number;
  today_pending: number;
  today_dispatched: number;
  response_rate_pct: number;
  avg_eta_minutes: number;
}

export interface AlertRow {
  id: number;
  citizen_id: number;
  citizen_name?: string | null;
  alert_type: AlertType;
  description: string | null;
  lat: number;
  lng: number;
  status: AlertStatus;
  dispatched_vehicle_id: number | null;
  acknowledged_by: number | null;
  resolved_by: number | null;
  eta_minutes: number | null;
  report_type?: "DSR" | "CSR" | null;
  report_notes?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  messages?: AlertMessage[];
}

export interface PatrolTrackPoint {
  vehicle_id: number;
  lat: number;
  lng: number;
  status: string;
  recorded_at: string;
}

export interface WSMessage {
  type: "connected" | "initial_state" | "alert_created" | "alert_updated" | "location_update" | "pong" | "demo_reset";
  alert?: AlertRow;
  alerts?: AlertRow[];
  alert_id?: number;
  lat?: number;
  lng?: number;
  message?: string;
  vehicle?: PatrolVehicle;
}

export interface Meta {
  crimes_total: number;
  zones_total: number;
  vehicles_total: number;
  venues_total: number;
  last_refresh: string;
}

// ── Phase 2B Types ────────────────────────────────────────────────────────

export type ReportType = "dsr" | "csr" | "fir";
export type ReportStatus = "open" | "escalated" | "chargesheet" | "closed";

export interface IncidentReport {
  id: number;
  report_type: ReportType;
  crime_head: string;
  description: string | null;
  place: string | null;
  lat: number | null;
  lng: number | null;
  status: ReportStatus;
  escalated_to: string | null;
  alert_id: number | null;
  created_by: number;
  reviewed_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PatrolAnomaly {
  vehicle_id: number;
  stationary_minutes: number;
  last_lat: number;
  last_lng: number;
  km_today: number;
  status: string;
}

export interface FleetKm {
  vehicle_id: number;
  km_today: number;
}

export interface PatrolAnomalyResponse {
  anomalies: PatrolAnomaly[];
  fleet_km: FleetKm[];
}

export interface ReportingGapBucket {
  label: string;
  count: number;
  color: string;
}

export interface ReportingGapStats {
  mean_gap_days: number;
  median_gap_days: number;
  pct_within_7_days: number;
  total_with_dates: number;
  buckets: ReportingGapBucket[];
  by_severity: Record<string, { mean_gap_days: number; count: number }>;
  by_district: Record<string, { mean_gap_days: number; count: number }>;
}

export interface FoPVolunteer {
  id: number;
  user_id: number;
  full_name: string;
  area: string | null;
  verified: boolean | number;
  verified_by: number | null;
  created_at: string;
}
