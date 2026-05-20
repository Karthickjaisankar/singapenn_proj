import {
  Crime, PatrolZone, PatrolVehicle, Venue, Stats, Meta, RoutingResponse,
  IncidentReport, PatrolAnomalyResponse, ReportingGapStats, FoPVolunteer,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string, token?: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function post<T>(path: string, body: any, token?: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function put<T>(path: string, body: any, token?: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  crimes: () => get<{ crimes: Crime[]; total: number }>("/api/crimes"),
  hotspots: () => get<{ hotspots: PatrolZone[] }>("/api/hotspots"),
  zones: () => get<{ zones: PatrolZone[] }>("/api/zones"),
  vehicles: () => get<{ vehicles: PatrolVehicle[] }>("/api/vehicles"),
  venues: () => get<{ venues: Venue[] }>("/api/venues"),
  stats: () => get<Stats>("/api/stats"),
  discoverVenues: () => post<{ discovered: number; venues: Venue[] }>("/api/venues/discover", {}),
  dispatchVehicle: (vehicleId: number, lat: number, lng: number) =>
    post<{ vehicle: PatrolVehicle }>(`/api/vehicles/${vehicleId}/dispatch`, { incident_lat: lat, incident_lng: lng }),
  routing: (hour?: number) =>
    get<RoutingResponse>(`/api/routing${hour !== undefined ? `?hour=${hour}` : ""}`),
  refresh: () => post<{ status: string }>("/api/refresh", {}),
  exportPdf: () => window.open(`${API_BASE}/api/export/pdf`),
  exportExcel: () => window.open(`${API_BASE}/api/export/excel`),

  // Auth endpoints
  login: (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);
    return fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).then(r => r.json());
  },
  me: (token: string) => get<{ user_id: number; username: string; role: string; full_name: string }>("/api/auth/me", token),

  // Alert endpoints
  createAlert: (token: string, body: any) => post<{ alert: any }>("/api/alerts", body, token),
  myAlerts: (token: string) => get<{ alerts: any[] }>("/api/alerts/mine", token),
  getAlert: (token: string, id: number) => get(`/api/alerts/${id}`, token),
  updateLocation: (token: string, id: number, lat: number, lng: number) =>
    put<void>(`/api/alerts/${id}/location`, { lat, lng }, token),
  cancelAlert: (token: string, id: number) => put<{ alert: any }>(`/api/alerts/${id}/cancel`, {}, token),
  getAllAlerts: (token: string, limit = 100, offset = 0, status?: string) => {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) query.append("status", status);
    return get<{ alerts: any[]; total: number }>(`/api/alerts?${query}`, token);
  },
  acknowledgeAlert: (token: string, id: number) => put<{ alert: any }>(`/api/alerts/${id}/acknowledge`, {}, token),
  dispatchAlert: (token: string, id: number, vehicle_id?: number, eta_minutes?: number) =>
    put<{ alert: any; vehicle: any }>(`/api/alerts/${id}/dispatch`, { vehicle_id, eta_minutes }, token),
  resolveAlert: (token: string, id: number) => put<{ alert: any }>(`/api/alerts/${id}/resolve`, {}, token),

  // Reporting gap
  reportingGap: () => get<ReportingGapStats>("/api/stats/reporting-gap"),

  // Patrol telemetry & anomaly
  patrolAnomalies: (token: string) => get<PatrolAnomalyResponse>("/api/patrol/anomalies", token),
  vehicleTrack: (token: string, vehicleId: number) =>
    get<{ vehicle_id: number; track: any[] }>(`/api/patrol/${vehicleId}/track`, token),

  // Incident reports
  createReport: (token: string, body: {
    report_type?: string; crime_head: string; description?: string;
    place?: string; lat?: number; lng?: number; alert_id?: number;
  }) => post<{ report: IncidentReport; auto_promoted_to_fir: boolean }>("/api/reports", body, token),
  getReports: (token: string, report_type?: string, status?: string) => {
    const q = new URLSearchParams();
    if (report_type) q.append("report_type", report_type);
    if (status) q.append("status", status);
    const qs = q.toString() ? `?${q}` : "";
    return get<{ reports: IncidentReport[]; total: number }>(`/api/reports${qs}`, token);
  },
  getPendingFir: (token: string) =>
    get<{ reports: IncidentReport[]; total: number }>("/api/reports/pending-fir", token),
  escalateReport: (token: string, id: number, escalated_to: string) =>
    put<{ report: IncidentReport }>(`/api/reports/${id}/escalate`, { escalated_to }, token),

  // Friend of Police
  registerFoP: (token: string, area?: string) =>
    post<{ volunteer: FoPVolunteer }>("/api/fop/register", { area }, token),
  getFoPVolunteers: (token: string) =>
    get<{ volunteers: FoPVolunteer[]; total: number }>("/api/fop/volunteers", token),
  verifyFoP: (token: string, fopId: number) =>
    put<{ volunteer: FoPVolunteer }>(`/api/fop/${fopId}/verify`, {}, token),
  myFoPStatus: (token: string) =>
    get<{ registered: boolean; volunteer: FoPVolunteer | null }>("/api/fop/me", token),
};
