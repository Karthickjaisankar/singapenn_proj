import asyncio
import threading
import math
import json
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
import os
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from backend.data_loader import load_crimes_from_excel
from backend.classifier import classify_crimes_batch
from backend.geocode import geocode_crimes_batch
from backend.hotspots import compute_patrol_zones
from backend.router import assign_patrol_routes, compute_optimal_routing
from backend.places import discover_venues, get_all_cached_venues
from backend.export import generate_pdf_report, generate_excel_report
from backend.auth import (
    get_current_user, require_officer, require_citizen, require_commissioner,
    require_patrol, require_command,
    verify_password, create_access_token, hash_password
)
from backend.database import (
    init_db, get_user_by_username, get_user_by_id,
    create_alert, get_alert_by_id, get_alerts_for_citizen,
    get_all_alerts, update_alert_status, upsert_alert_location,
    get_latest_location,
    create_alert_message, get_messages_for_alert, get_live_alert_summary,
    update_alert_report, get_all_patrol_tracks_today,
    log_patrol_position, get_last_telemetry, get_patrol_telemetry,
    get_stationary_alerts, get_shift_km,
    create_incident_report, get_incident_report, get_all_reports, escalate_report,
    register_fop, get_fop_volunteers, verify_fop, get_fop_by_user,
)
from backend.domain import MANDATORY_FIR_HEADS, PATROL_STATIONARY_THRESHOLD_MINUTES

# ============ Pydantic Models ============

class AlertCreateRequest(BaseModel):
    alert_type: str
    description: Optional[str] = None
    lat: float
    lng: float

class LocationUpdate(BaseModel):
    lat: float
    lng: float

class DispatchRequest(BaseModel):
    vehicle_id: Optional[int] = None
    eta_minutes: Optional[int] = None

class ReportCreateRequest(BaseModel):
    report_type: str = "dsr"
    crime_head: str
    description: Optional[str] = None
    place: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    alert_id: Optional[int] = None

class EscalateRequest(BaseModel):
    escalated_to: str  # 'csr' or 'fir'

class FoPRegisterRequest(BaseModel):
    area: Optional[str] = None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    full_name: str
    vehicle_id: Optional[int] = None

# ============ WebSocket Connection Manager ============

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass

ws_manager = ConnectionManager()

# Global state
_STATE = {
    "crimes": [],
    "zones": [],
    "vehicles": [],
    "venues": [],
    "last_refresh": None,
}
_LOCK = threading.Lock()


def derive_time_slot(date_of_occurrence):
    """Derive time of day slot from datetime. morning=6-11, afternoon=12-17, night=18-5."""
    if not date_of_occurrence:
        return None
    hour = date_of_occurrence.hour if isinstance(date_of_occurrence, datetime) else None
    if hour is None:
        return None
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 18:
        return "afternoon"
    else:  # 18-23 or 0-5
        return "night"


PATROL_CIRCUITS = {
    1: (12.9398, 80.1323), 2: (12.9657, 80.1588),
    3: (12.9314, 80.1496), 4: (12.9344, 80.2120),
}
PATROL_R_LAT = 0.006
PATROL_R_LNG = 0.008
PATROL_PERIOD_MIN = 480  # 8-hour loop per vehicle


def _oval_position(vehicle_id: int) -> tuple[float, float]:
    """Compute vehicle position on its oval patrol circuit based on current UTC time."""
    clat, clng = PATROL_CIRCUITS.get(vehicle_id, (12.9349, 80.1706))
    t = datetime.utcnow()
    minutes = t.hour * 60 + t.minute
    angle = (minutes / PATROL_PERIOD_MIN) * 2 * math.pi + (vehicle_id * math.pi / 2)
    return (
        round(clat + PATROL_R_LAT * math.sin(angle), 6),
        round(clng + PATROL_R_LNG * math.cos(angle), 6),
    )


def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in km between two coordinates using Haversine formula."""
    R = 6371  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _auto_dispatch(alert_lat: float, alert_lng: float) -> tuple[Optional[dict], Optional[int]]:
    """
    Find nearest patrolling vehicle to alert location.
    Updates vehicle status in _STATE and returns (vehicle, eta_minutes).
    """
    with _LOCK:
        vehicles = _STATE["vehicles"]

        # Prefer patrolling vehicles, fallback to any non-responding
        patrolling = [v for v in vehicles if v["status"] == "patrolling"]
        if not patrolling:
            patrolling = [v for v in vehicles if v["status"] != "responding"]

        if not patrolling:
            return None, None

        # Find nearest by Haversine distance
        nearest = min(patrolling, key=lambda v: _haversine_distance(v["lat"], v["lng"], alert_lat, alert_lng))
        dist_km = _haversine_distance(nearest["lat"], nearest["lng"], alert_lat, alert_lng)

        # ETA: assume 40 km/h average urban speed
        eta_minutes = max(1, round((dist_km / 40) * 60))

        # Update vehicle state
        nearest["status"] = "responding"
        nearest["incident_location"] = [alert_lat, alert_lng]
        nearest["current_route"] = [[nearest["lat"], nearest["lng"]], [alert_lat, alert_lng]]

        return nearest, eta_minutes


def load_data():
    """Load, process, and cache all data."""
    crimes = load_crimes_from_excel("data/POCSO - SINGA PENNAE.xlsx")
    crimes = classify_crimes_batch(crimes)
    crimes = geocode_crimes_batch(crimes)

    zones = compute_patrol_zones(crimes, k=4)
    current_hour = datetime.utcnow().hour
    vehicles = assign_patrol_routes(zones, current_hour=current_hour)

    # Load cached venues (venues discovery requires Google Places API and quota)
    venues = get_all_cached_venues()
    # Note: To fetch new venues, call /api/venues endpoint which triggers discovery

    with _LOCK:
        _STATE["crimes"] = [
            {
                "id": c.sl_no,
                "district": c.district,
                "police_station": c.police_station,
                "year": c.year,
                "fir_number": c.fir_number,
                "section": c.section,
                "head": c.head,
                "penetrative_type": c.penetrative_type,
                "place_of_crime": c.place_of_crime,
                "severity": c.severity,
                "lat": c.lat,
                "lng": c.lng,
                "date_of_occurrence": c.date_of_occurrence.isoformat() if c.date_of_occurrence else None,
                "date_of_report": c.date_of_report.isoformat() if c.date_of_report else None,
                "hour": c.date_of_occurrence.hour if c.date_of_occurrence else None,
                "time_slot": derive_time_slot(c.date_of_occurrence),
            }
            for c in crimes
        ]
        _STATE["zones"] = [
            {
                "zone_id": z.zone_id,
                "centroid_lat": z.centroid_lat,
                "centroid_lng": z.centroid_lng,
                "crime_count": z.crime_count,
                "severity_score": z.severity_score,
                "top_spots": z.top_spots,
                "risk_score": z.risk_score,
                "recency_score": z.recency_score,
                "time_slot_risks": z.time_slot_risks,
                "crime_spot_coords": z.crime_spot_coords,
            }
            for z in zones
        ]
        _STATE["vehicles"] = [v.to_dict() for v in vehicles]
        _STATE["venues"] = venues
        _STATE["last_refresh"] = "now"

    print(f"Loaded {len(crimes)} crimes, {len(zones)} zones, {len(vehicles)} vehicles, {len(venues)} venues")


def _reporting_gap_stats(crimes: list) -> dict:
    """Compute reporting lag histogram from in-memory crime list."""
    import statistics
    gaps = []
    by_severity: dict[str, list] = {}
    by_district: dict[str, list] = {}

    for c in crimes:
        occ = c.get("date_of_occurrence")
        rep = c.get("date_of_report")
        if not occ or not rep:
            continue
        try:
            d_occ = datetime.fromisoformat(occ)
            d_rep = datetime.fromisoformat(rep)
            delta = (d_rep - d_occ).days
            if 0 <= delta <= 730:
                gaps.append(delta)
                sev = c.get("severity", "low")
                dist = c.get("district", "Unknown")
                by_severity.setdefault(sev, []).append(delta)
                by_district.setdefault(dist, []).append(delta)
        except Exception:
            continue

    def _buckets(lst: list) -> list:
        b = [0, 0, 0, 0, 0, 0]
        for g in lst:
            if g == 0:        b[0] += 1
            elif g <= 3:      b[1] += 1
            elif g <= 7:      b[2] += 1
            elif g <= 30:     b[3] += 1
            elif g <= 90:     b[4] += 1
            else:             b[5] += 1
        labels = ["Same day", "1–3 days", "4–7 days", "8–30 days", "31–90 days", "90+ days"]
        colors = ["#22c55e", "#86efac", "#fbbf24", "#f97316", "#ef4444", "#dc2626"]
        return [{"label": labels[i], "count": b[i], "color": colors[i]} for i in range(6)]

    if not gaps:
        return {"mean_gap_days": 0, "median_gap_days": 0, "pct_within_7_days": 0,
                "buckets": _buckets([]), "by_severity": {}, "by_district": {}}

    within_7 = sum(1 for g in gaps if g <= 7)
    mean_gap = round(statistics.mean(gaps), 1)
    median_gap = round(statistics.median(gaps), 1)
    pct_within_7 = round(within_7 / len(gaps) * 100, 1)

    return {
        "mean_gap_days": mean_gap,
        "median_gap_days": median_gap,
        "pct_within_7_days": pct_within_7,
        "total_with_dates": len(gaps),
        "buckets": _buckets(gaps),
        "by_severity": {
            sev: {
                "mean_gap_days": round(statistics.mean(lst), 1),
                "count": len(lst),
            }
            for sev, lst in by_severity.items()
        },
        "by_district": {
            dist: {
                "mean_gap_days": round(statistics.mean(lst), 1),
                "count": len(lst),
            }
            for dist, lst in sorted(by_district.items(), key=lambda x: -len(x[1]))[:10]
        },
    }


async def _patrol_telemetry_loop():
    """Record patrol positions every 60 seconds for spaghetti trail and anomaly detection."""
    while True:
        await asyncio.sleep(60)
        try:
            with _LOCK:
                vehicles = list(_STATE["vehicles"])
            for v in vehicles:
                if v["status"] == "patrolling":
                    lat, lng = _oval_position(v["id"])
                else:
                    lat, lng = v["lat"], v["lng"]
                last = get_last_telemetry(v["id"])
                km = 0.0
                if last:
                    km = _haversine_distance(last["lat"], last["lng"], lat, lng)
                log_patrol_position(v["id"], lat, lng, v["status"], km)
        except Exception as e:
            print(f"Telemetry loop error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load data at startup."""
    init_db()
    load_data()
    asyncio.create_task(_patrol_telemetry_loop())
    yield


# Create FastAPI app
app = FastAPI(
    title="Singapene Scheme - Crime Prevention",
    description="Real-time crime hotspot analysis and police vehicle routing",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.netlify\.app|https://.*\.up\.railway\.app|http://localhost:\d+",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.get("/api/meta")
def get_meta():
    """Get metadata about the app."""
    with _LOCK:
        return {
            "crimes_total": len(_STATE["crimes"]),
            "zones_total": len(_STATE["zones"]),
            "vehicles_total": len(_STATE["vehicles"]),
            "venues_total": len(_STATE["venues"]),
            "last_refresh": _STATE["last_refresh"],
        }


@app.get("/api/crimes")
def get_crimes():
    """Get all geocoded and classified crimes."""
    with _LOCK:
        return {"crimes": _STATE["crimes"], "total": len(_STATE["crimes"])}


@app.get("/api/hotspots")
def get_hotspots():
    """Get crime hotspot clusters."""
    with _LOCK:
        return {"hotspots": _STATE["zones"]}


@app.get("/api/zones")
def get_zones():
    """Get patrol zone definitions."""
    with _LOCK:
        return {"zones": _STATE["zones"]}


@app.get("/api/routing")
def get_routing(hour: Optional[int] = None):
    """
    Return time-optimised vehicle assignments for a given hour (0-23).
    Defaults to current UTC hour if omitted.
    Zones with higher risk at that hour of day receive more vehicles.
    """
    target_hour = hour if hour is not None else datetime.utcnow().hour
    target_hour = max(0, min(23, target_hour))

    with _LOCK:
        from backend.hotspots import PatrolZone
        zones = [
            PatrolZone(
                zone_id=z["zone_id"],
                centroid_lat=z["centroid_lat"],
                centroid_lng=z["centroid_lng"],
                crime_count=z["crime_count"],
                severity_score=z["severity_score"],
                top_spots=z["top_spots"],
                risk_score=z["risk_score"],
                recency_score=z["recency_score"],
                time_slot_risks=z["time_slot_risks"],
                crime_spot_coords=z["crime_spot_coords"],
            )
            for z in _STATE["zones"]
        ]

    vehicles = compute_optimal_routing(zones, target_hour, n_vehicles=4)

    slot = "morning" if 6 <= target_hour < 12 else "afternoon" if 12 <= target_hour < 18 else "night"
    zone_risks = sorted(
        [
            {
                "zone_id": z.zone_id,
                "risk_score": z.risk_score,
                "time_slot_multiplier": z.time_slot_risks.get(slot, 0.33),
                "adjusted_risk": round(z.risk_score * (1 + z.time_slot_risks.get(slot, 0.33)), 2),
            }
            for z in zones
        ],
        key=lambda x: x["adjusted_risk"],
        reverse=True,
    )

    return {
        "hour": target_hour,
        "time_slot": slot,
        "zone_risks": zone_risks,
        "vehicles": [v.to_dict() for v in vehicles],
    }


@app.get("/api/vehicles")
def get_vehicles():
    """Get police vehicle positions and routes."""
    with _LOCK:
        return {"vehicles": _STATE["vehicles"]}


@app.post("/api/vehicles/{vehicle_id}/dispatch")
def dispatch_vehicle(vehicle_id: int, incident_lat: float, incident_lng: float):
    """Dispatch a vehicle to an incident location."""
    with _LOCK:
        vehicles = _STATE["vehicles"]
        if vehicle_id < 1 or vehicle_id > len(vehicles):
            return {"error": "Invalid vehicle ID"}, 404

        vehicle = vehicles[vehicle_id - 1]
        vehicle["status"] = "responding"
        vehicle["incident_location"] = [incident_lat, incident_lng]
        vehicle["current_route"] = [[vehicle["lat"], vehicle["lng"]], [incident_lat, incident_lng]]

        return {"vehicle": vehicle}


@app.get("/api/venues")
def get_venues():
    """Get all venues (schools, colleges, malls, etc.)."""
    with _LOCK:
        return {"venues": _STATE["venues"]}


@app.post("/api/venues/discover")
def discover_venues_endpoint():
    """Discover venues from Google Places API and cache them."""
    try:
        venues = discover_venues()
        with _LOCK:
            _STATE["venues"] = venues
        return {"discovered": len(venues), "venues": venues}
    except Exception as e:
        print(f"Error discovering venues: {e}")
        return {"error": str(e)}, 500


@app.get("/api/stats")
def get_stats():
    """Get crime statistics and analytics."""
    with _LOCK:
        crimes = _STATE["crimes"]

        # Crime by year
        by_year = {}
        for crime in crimes:
            year = crime["year"]
            by_year[year] = by_year.get(year, 0) + 1

        # Crime by severity
        by_severity = {"low": 0, "moderate": 0, "severe": 0}
        for crime in crimes:
            severity = crime.get("severity", "low")
            by_severity[severity] = by_severity.get(severity, 0) + 1

        # Crime by head
        by_head = {}
        for crime in crimes:
            head = crime["head"]
            by_head[head] = by_head.get(head, 0) + 1

        # Crime by district
        by_district = {}
        for crime in crimes:
            district = crime["district"]
            by_district[district] = by_district.get(district, 0) + 1

        # Crime by month (YYYY-MM format)
        by_month = {}
        for crime in crimes:
            date_str = crime.get("date_of_occurrence")
            if date_str:
                month_key = date_str[:7]  # Extract YYYY-MM from ISO string
                by_month[month_key] = by_month.get(month_key, 0) + 1

        # Crime by police station
        by_police_station = {}
        for crime in crimes:
            station = crime.get("police_station", "Unknown")
            by_police_station[station] = by_police_station.get(station, 0) + 1

        # Crime by head by year (nested)
        by_head_by_year = {}
        for crime in crimes:
            head = crime.get("head", "unknown")
            year = crime.get("year", "unknown")
            if head not in by_head_by_year:
                by_head_by_year[head] = {}
            by_head_by_year[head][str(year)] = by_head_by_year[head].get(str(year), 0) + 1

        # Crime by time slot
        by_time_slot = {"morning": 0, "afternoon": 0, "night": 0, "unknown": 0}
        for crime in crimes:
            slot = crime.get("time_slot")
            if slot in by_time_slot:
                by_time_slot[slot] += 1
            else:
                by_time_slot["unknown"] += 1

        return {
            "by_year": by_year,
            "by_severity": by_severity,
            "by_head": by_head,
            "by_district": by_district,
            "by_month": by_month,
            "by_police_station": by_police_station,
            "by_head_by_year": by_head_by_year,
            "by_time_slot": by_time_slot,
        }


@app.post("/api/refresh")
def refresh_data():
    """Manually refresh all data."""
    load_data()
    return {"status": "refreshed"}


@app.get("/api/export/pdf")
def export_pdf():
    """Export crime statistics as PDF report."""
    try:
        with _LOCK:
            pdf_bytes = generate_pdf_report(_STATE)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=singapene_report.pdf"},
        )
    except Exception as e:
        print(f"PDF export error: {e}")
        return {"error": str(e)}, 500


@app.get("/api/export/excel")
def export_excel():
    """Export crime data as Excel spreadsheet."""
    try:
        with _LOCK:
            excel_bytes = generate_excel_report(_STATE)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=singapene_report.xlsx"},
        )
    except Exception as e:
        print(f"Excel export error: {e}")
        return {"error": str(e)}, 500


# ============ Auth Endpoints ============

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """User login endpoint. Accepts username and password (form data)."""
    user = get_user_by_username(form_data.username)

    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={
            "sub": str(user["id"]),
            "username": user["username"],
            "role": user["role"],
            "full_name": user["full_name"],
            "vehicle_id": user.get("vehicle_id"),
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
        "user_id": user["id"],
        "full_name": user["full_name"],
        "vehicle_id": user.get("vehicle_id"),
    }


@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info."""
    return current_user


# ============ Citizen Alert Endpoints ============

@app.post("/api/alerts")
async def create_alert_endpoint(
    request: AlertCreateRequest,
    current_user: dict = Depends(require_citizen),
):
    """Create a new alert. Stays pending until an officer manually dispatches."""
    alert = create_alert(
        citizen_id=current_user["user_id"],
        alert_type=request.alert_type,
        description=request.description,
        lat=request.lat,
        lng=request.lng,
    )

    # Broadcast to all connected officers — alert is pending, awaiting manual dispatch
    await ws_manager.broadcast({
        "type": "alert_created",
        "alert": alert,
        "vehicle": None,
    })

    return {"alert": alert}


@app.get("/api/alerts/mine")
async def get_my_alerts(current_user: dict = Depends(require_citizen)):
    """Get citizen's own alerts."""
    alerts = get_alerts_for_citizen(current_user["user_id"])
    return {"alerts": alerts}


@app.get("/api/alerts/{alert_id}")
async def get_alert_endpoint(alert_id: int, current_user: dict = Depends(get_current_user)):
    """Get alert by ID. Citizen can only access their own."""
    alert = get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if current_user["role"] == "citizen" and alert["citizen_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    location = get_latest_location(alert_id)

    return {"alert": alert, "latest_location": location}


@app.put("/api/alerts/{alert_id}/location")
async def update_location_endpoint(
    alert_id: int,
    request: LocationUpdate,
    current_user: dict = Depends(require_citizen),
):
    """Update alert location (live tracking)."""
    alert = get_alert_by_id(alert_id)

    if not alert or alert["citizen_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    upsert_alert_location(alert_id, request.lat, request.lng)

    # Broadcast location update
    await ws_manager.broadcast({
        "type": "location_update",
        "alert_id": alert_id,
        "lat": request.lat,
        "lng": request.lng,
    })

    return {"ok": True}


@app.put("/api/alerts/{alert_id}/cancel")
async def cancel_alert(alert_id: int, current_user: dict = Depends(require_citizen)):
    """Cancel an alert (citizen only)."""
    alert = get_alert_by_id(alert_id)

    if not alert or alert["citizen_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    alert = update_alert_status(alert_id, status="cancelled")

    await ws_manager.broadcast({
        "type": "alert_updated",
        "alert": alert,
    })

    return {"alert": alert}


# ============ Officer Alert Endpoints ============

@app.get("/api/alerts")
async def get_all_alerts_endpoint(
    limit: int = 100,
    offset: int = 0,
    status: Optional[str] = None,
    current_user: dict = Depends(require_command),
):
    """Get all alerts (officers and commissioner)."""
    alerts, total = get_all_alerts(limit=limit, offset=offset, status_filter=status)
    return {"alerts": alerts, "total": total}


@app.put("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, current_user: dict = Depends(require_officer)):
    """Officer acknowledges an alert."""
    alert = get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert = update_alert_status(alert_id, status="acknowledged", officer_id=current_user["user_id"])

    await ws_manager.broadcast({
        "type": "alert_updated",
        "alert": alert,
    })

    return {"alert": alert}


@app.put("/api/alerts/{alert_id}/dispatch")
async def dispatch_alert(
    alert_id: int,
    request: DispatchRequest,
    current_user: dict = Depends(require_officer),
):
    """Dispatch a vehicle to the alert (auto-selects if not specified)."""
    alert = get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    vehicle = None
    eta = request.eta_minutes

    if request.vehicle_id:
        # Manual vehicle selection
        with _LOCK:
            vehicle = next((v for v in _STATE["vehicles"] if v["id"] == request.vehicle_id), None)

        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        if not eta:
            dist_km = _haversine_distance(vehicle["lat"], vehicle["lng"], alert["lat"], alert["lng"])
            eta = max(1, round((dist_km / 40) * 60))
    else:
        # Auto-dispatch
        vehicle, eta = _auto_dispatch(alert["lat"], alert["lng"])

        if not vehicle:
            raise HTTPException(status_code=400, detail="No vehicles available")

    # Update alert
    alert = update_alert_status(
        alert_id,
        status="dispatched",
        vehicle_id=vehicle["id"],
        eta_minutes=eta,
    )

    await ws_manager.broadcast({
        "type": "alert_updated",
        "alert": alert,
    })

    return {"alert": alert, "vehicle": vehicle}


@app.put("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, current_user: dict = Depends(require_officer)):
    """Officer resolves an alert and returns vehicle to patrolling."""
    alert = get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    # Return vehicle to patrolling
    vehicle_id = alert["dispatched_vehicle_id"]
    if vehicle_id:
        with _LOCK:
            vehicle = next((v for v in _STATE["vehicles"] if v["id"] == vehicle_id), None)
            if vehicle:
                vehicle["status"] = "patrolling"
                vehicle["incident_location"] = None

                # Restore patrol route from zone
                zone = next((z for z in _STATE["zones"] if z["zone_id"] == vehicle["zone_id"]), None)
                if zone:
                    vehicle["current_route"] = [[vehicle["lat"], vehicle["lng"]], [zone["centroid_lat"], zone["centroid_lng"]]]

    # Update alert
    resolved_at = datetime.utcnow().isoformat()
    alert = update_alert_status(
        alert_id,
        status="resolved",
        resolved_at=resolved_at,
    )

    await ws_manager.broadcast({
        "type": "alert_updated",
        "alert": alert,
    })

    return {"alert": alert}


# ============ Stats: Reporting Gap ============

@app.get("/api/stats/reporting-gap")
def get_reporting_gap():
    """Return histogram of days between crime occurrence and report date."""
    with _LOCK:
        crimes = list(_STATE["crimes"])
    return _reporting_gap_stats(crimes)


# ============ Patrol Telemetry & Anomaly ============

@app.get("/api/patrol/anomalies")
def get_patrol_anomalies(current_user: dict = Depends(require_officer)):
    """Return patrol vehicles with anomalies (stationary >2 hrs) and km covered today."""
    anomalies = get_stationary_alerts(PATROL_STATIONARY_THRESHOLD_MINUTES)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    with _LOCK:
        vehicle_ids = [v["id"] for v in _STATE["vehicles"]]
    fleet_km = [
        {"vehicle_id": vid, "km_today": round(get_shift_km(vid, today), 2)}
        for vid in vehicle_ids
    ]
    return {"anomalies": anomalies, "fleet_km": fleet_km}


@app.get("/api/patrol/{vehicle_id}/track")
def get_vehicle_track(vehicle_id: int, current_user: dict = Depends(require_officer)):
    """Get position history for a vehicle over the last 8 hours."""
    track = get_patrol_telemetry(vehicle_id, since_minutes=480)
    return {"vehicle_id": vehicle_id, "track": track}


# ============ Incident Reports (DSR/CSR/FIR) ============

@app.post("/api/reports")
def create_report(request: ReportCreateRequest, current_user: dict = Depends(require_officer)):
    """File a new incident report. Mandatory crime heads auto-promote to FIR."""
    report_type = request.report_type
    if request.crime_head in MANDATORY_FIR_HEADS:
        report_type = "fir"

    report = create_incident_report(
        report_type=report_type,
        crime_head=request.crime_head,
        description=request.description,
        place=request.place,
        lat=request.lat,
        lng=request.lng,
        created_by=current_user["user_id"],
        alert_id=request.alert_id,
    )
    auto_promoted = report_type != request.report_type
    return {"report": report, "auto_promoted_to_fir": auto_promoted}


@app.get("/api/reports/pending-fir")
def get_pending_fir(current_user: dict = Depends(require_officer)):
    """DSRs that should be converted to FIR (mandatory crime heads)."""
    all_dsrs = get_all_reports(report_type="dsr", status_filter="open")
    pending = [r for r in all_dsrs if r["crime_head"] in MANDATORY_FIR_HEADS]
    return {"reports": pending, "total": len(pending)}


@app.get("/api/reports")
def list_reports(
    report_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_officer),
):
    """List incident reports with optional type and status filter."""
    reports = get_all_reports(report_type=report_type, status_filter=status)
    return {"reports": reports, "total": len(reports)}


@app.put("/api/reports/{report_id}/escalate")
def escalate_report_endpoint(
    report_id: int,
    request: EscalateRequest,
    current_user: dict = Depends(require_officer),
):
    """Escalate a DSR to CSR or FIR."""
    report = get_incident_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    updated = escalate_report(report_id, request.escalated_to, current_user["user_id"])
    return {"report": updated}


# ============ Friend of Police ============

@app.post("/api/fop/register")
def register_fop_endpoint(request: FoPRegisterRequest, current_user: dict = Depends(require_citizen)):
    """Register current citizen as a Friend of Police volunteer."""
    volunteer = register_fop(current_user["user_id"], request.area)
    return {"volunteer": volunteer}


@app.get("/api/fop/volunteers")
def list_fop_volunteers(current_user: dict = Depends(require_officer)):
    """List all Friend of Police volunteers."""
    volunteers = get_fop_volunteers()
    return {"volunteers": volunteers, "total": len(volunteers)}


@app.put("/api/fop/{fop_id}/verify")
def verify_fop_endpoint(fop_id: int, current_user: dict = Depends(require_officer)):
    """Mark a FoP volunteer as verified."""
    result = verify_fop(fop_id, current_user["user_id"])
    if not result:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return {"volunteer": result}


@app.get("/api/fop/me")
def get_my_fop_status(current_user: dict = Depends(require_citizen)):
    """Get the current citizen's FoP registration status."""
    vol = get_fop_by_user(current_user["user_id"])
    return {"registered": bool(vol), "volunteer": vol}


# ============ WebSocket ============

@app.put("/api/alerts/{alert_id}/accept")
async def accept_alert(alert_id: int, current_user: dict = Depends(require_patrol)):
    """Patrol officer confirms they are responding to their dispatched alert."""
    alert = get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.get("dispatched_vehicle_id") != current_user.get("vehicle_id"):
        raise HTTPException(status_code=403, detail="This alert is not assigned to your vehicle")
    updated = update_alert_status(alert_id, status="acknowledged", officer_id=current_user["user_id"])
    await ws_manager.broadcast({"type": "alert_updated", "alert": updated})
    return {"alert": updated}


@app.put("/api/alerts/{alert_id}/reject")
async def reject_alert(alert_id: int, request: dict, current_user: dict = Depends(require_patrol)):
    """Patrol officer rejects a dispatched alert with a reason; alert returns to pending."""
    alert = get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.get("dispatched_vehicle_id") != current_user.get("vehicle_id"):
        raise HTTPException(status_code=403, detail="This alert is not assigned to your vehicle")
    reason = (request.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason required")
    conn = get_conn()
    conn.execute(
        "UPDATE alerts SET status='pending', dispatched_vehicle_id=NULL, acknowledged_by=NULL, "
        "updated_at=datetime('now') WHERE id=?",
        (alert_id,),
    )
    conn.commit()
    conn.close()
    create_alert_message(alert_id, current_user["user_id"], "patrol", f"[REJECTED] {reason}")
    updated = get_alert_by_id(alert_id)
    await ws_manager.broadcast({"type": "alert_updated", "alert": updated})
    return {"alert": updated}


@app.post("/api/alerts/{alert_id}/message")
async def send_alert_message(alert_id: int, request: dict, current_user: dict = Depends(get_current_user)):
    """Patrol officer or citizen sends a message on their alert."""
    alert = get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    role = current_user["role"]
    uid  = current_user["user_id"]
    vid  = current_user.get("vehicle_id")

    is_patrol  = role == "patrol" and alert.get("dispatched_vehicle_id") == vid
    is_citizen = role == "citizen" and alert["citizen_id"] == uid

    if not is_patrol and not is_citizen:
        raise HTTPException(status_code=403, detail="Not authorized to message on this alert")

    body = request.get("body", "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body required")

    sender_role = "patrol" if is_patrol else "citizen"
    msg = create_alert_message(alert_id, uid, sender_role, body)
    await ws_manager.broadcast({"type": "alert_updated", "alert": get_alert_by_id(alert_id)})
    return {"message": msg}


@app.put("/api/alerts/{alert_id}/arrive")
async def patrol_arrive(alert_id: int, current_user: dict = Depends(require_patrol)):
    """Patrol officer marks arrival on scene."""
    alert = get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.get("dispatched_vehicle_id") != current_user.get("vehicle_id"):
        raise HTTPException(status_code=403, detail="Not your alert")
    updated = update_alert_status(alert_id, status="on_scene")
    await ws_manager.broadcast({"type": "alert_updated", "alert": updated})
    return {"alert": updated}


@app.put("/api/alerts/{alert_id}/file-report")
async def file_report(alert_id: int, request: dict, current_user: dict = Depends(require_patrol)):
    """Patrol officer files DSR or CSR report, auto-resolving the alert."""
    alert = get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.get("dispatched_vehicle_id") != current_user.get("vehicle_id"):
        raise HTTPException(status_code=403, detail="Not your alert")
    report_type = request.get("report_type", "").upper()
    if report_type not in ("DSR", "CSR"):
        raise HTTPException(status_code=400, detail="report_type must be DSR or CSR")
    report_notes = request.get("report_notes", "")
    updated = update_alert_report(alert_id, report_type, report_notes)
    # Return vehicle to patrolling status
    vehicle_id = alert.get("dispatched_vehicle_id")
    if vehicle_id:
        with _LOCK:
            vehicle = next((v for v in _STATE["vehicles"] if v["id"] == vehicle_id), None)
            if vehicle:
                vehicle["status"] = "patrolling"
                vehicle["incident_location"] = None
    await ws_manager.broadcast({"type": "alert_updated", "alert": updated})
    return {"alert": updated}


@app.get("/api/patrol/all-tracks")
def get_all_tracks(current_user: dict = Depends(require_command)):
    """Return today's patrol telemetry for all 4 vehicles (spaghetti trail view)."""
    tracks = get_all_patrol_tracks_today()
    return {"tracks": tracks}


@app.get("/api/alerts/{alert_id}/messages")
async def get_alert_messages_endpoint(alert_id: int, current_user: dict = Depends(get_current_user)):
    """Get messages for an alert."""
    msgs = get_messages_for_alert(alert_id)
    return {"messages": msgs}


@app.get("/api/commissioner/summary")
async def commissioner_summary(current_user: dict = Depends(require_commissioner)):
    """Live today KPIs for the Commissioner dashboard."""
    s = get_live_alert_summary()
    total = s.get("total") or 0
    resolved = s.get("resolved_today") or 0
    return {
        "today_total": total,
        "today_resolved": resolved,
        "today_pending": s.get("pending") or 0,
        "today_dispatched": s.get("dispatched") or 0,
        "response_rate_pct": round((resolved / total * 100) if total > 0 else 0.0, 1),
        "avg_eta_minutes": round(float(s.get("avg_eta") or 0), 1),
    }


@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time alert updates (officers, commissioner, patrol)."""
    try:
        from backend.auth import decode_token

        payload = decode_token(token)
        role = payload.get("role")
        vehicle_id = payload.get("vehicle_id")

        if role not in ("officer", "commissioner", "patrol"):
            await websocket.close(code=4003, reason="Forbidden: Command/patrol access required")
            return
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized: Invalid token")
        return

    await ws_manager.connect(websocket)

    try:
        all_alerts, _ = get_all_alerts(limit=500)
        # Patrol officers only receive their own vehicle's alerts in initial state
        if role == "patrol" and vehicle_id is not None:
            initial = [a for a in all_alerts if a.get("dispatched_vehicle_id") == vehicle_id]
        else:
            initial = all_alerts
        await websocket.send_text(json.dumps({"type": "connected", "message": "Connected to alert feed"}))
        await websocket.send_text(json.dumps({"type": "initial_state", "alerts": initial}))

        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if os.getenv("DEMO_MODE") == "1":

    # Holds the active demo alert ID across steps
    _DEMO = {"alert_id": None}

    def _demo_user_id(username: str) -> int:
        conn = get_conn()
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()
        if not row:
            raise HTTPException(400, f"Demo user '{username}' not found")
        return row[0]

    @app.post("/api/demo/reset")
    async def demo_reset():
        conn = get_conn()
        conn.execute("DELETE FROM alert_messages")
        conn.execute("DELETE FROM alerts")
        conn.commit()
        conn.close()
        _DEMO["alert_id"] = None
        # Return PPV-1 to patrolling
        with _LOCK:
            for v in _STATE["vehicles"]:
                if v["id"] == 1:
                    v["status"] = "patrolling"
                    v["incident_location"] = None
        await ws_manager.broadcast({"type": "demo_reset"})
        return {"status": "reset"}

    @app.post("/api/demo/step/raise-sos")
    async def demo_raise_sos():
        """Step 1 — create SOS alert as citizen1."""
        citizen_id = _demo_user_id("citizen1")
        alert = create_alert(
            citizen_id=citizen_id,
            alert_type="Harassment",
            description="Man following me near the bus stand. I am scared.",
            lat=12.9314,
            lng=80.1496,
        )
        _DEMO["alert_id"] = alert["id"]
        await ws_manager.broadcast({"type": "alert_created", "alert": alert})
        return {"status": "ok", "alert_id": alert["id"]}

    @app.post("/api/demo/step/dispatch")
    async def demo_dispatch():
        """Step 2 — officer dispatches PPV-1."""
        alert_id = _DEMO.get("alert_id")
        if not alert_id:
            raise HTTPException(400, "No active demo alert — run raise-sos first")
        with _LOCK:
            v = next((x for x in _STATE["vehicles"] if x["id"] == 1), None)
            if v:
                v["status"] = "responding"
                v["incident_location"] = [12.9314, 80.1496]
                v["current_route"] = [[v["lat"], v["lng"]], [12.9314, 80.1496]]
        alert = update_alert_status(alert_id, status="dispatched", vehicle_id=1, eta_minutes=4)
        await ws_manager.broadcast({"type": "alert_updated", "alert": alert})
        return {"status": "ok"}

    @app.post("/api/demo/step/patrol-accept")
    async def demo_patrol_accept():
        """Step 3 — patrol1 accepts the dispatched alert."""
        alert_id = _DEMO.get("alert_id")
        if not alert_id:
            raise HTTPException(400, "No active demo alert")
        officer_id = _demo_user_id("patrol1")
        alert = update_alert_status(alert_id, status="acknowledged", officer_id=officer_id)
        await ws_manager.broadcast({"type": "alert_updated", "alert": alert})
        return {"status": "ok"}

    @app.post("/api/demo/step/chat")
    async def demo_chat():
        """Step 4 — exchange three demo chat messages with delays."""
        import asyncio
        alert_id = _DEMO.get("alert_id")
        if not alert_id:
            raise HTTPException(400, "No active demo alert")
        patrol_id  = _demo_user_id("patrol1")
        citizen_id = _demo_user_id("citizen1")

        msg1 = create_alert_message(alert_id, patrol_id, "patrol",
                                    "On my way — ETA 4 min. Stay calm, I am close.")
        await ws_manager.broadcast({"type": "alert_updated",
                                    "alert": get_alert_by_id(alert_id)})
        await asyncio.sleep(4)

        msg2 = create_alert_message(alert_id, citizen_id, "citizen",
                                    "I am near the tea shop on the main road.")
        await ws_manager.broadcast({"type": "alert_updated",
                                    "alert": get_alert_by_id(alert_id)})
        await asyncio.sleep(3)

        msg3 = create_alert_message(alert_id, patrol_id, "patrol",
                                    "I can see you. Stay where you are.")
        await ws_manager.broadcast({"type": "alert_updated",
                                    "alert": get_alert_by_id(alert_id)})
        _ = msg1, msg2, msg3  # silence unused warnings
        return {"status": "ok"}

    @app.post("/api/demo/step/arrive")
    async def demo_arrive():
        """Step 5 — patrol marks arrival on scene."""
        alert_id = _DEMO.get("alert_id")
        if not alert_id:
            raise HTTPException(400, "No active demo alert")
        alert = update_alert_status(alert_id, status="on_scene")
        await ws_manager.broadcast({"type": "alert_updated", "alert": alert})
        return {"status": "ok"}

    @app.post("/api/demo/step/file-csr")
    async def demo_file_csr():
        """Step 6 — patrol files CSR, alert resolves."""
        alert_id = _DEMO.get("alert_id")
        if not alert_id:
            raise HTTPException(400, "No active demo alert")
        alert = update_alert_report(
            alert_id,
            "CSR",
            "Victim located. Perpetrator identified. Escorting victim to Vandalur AWPS.",
        )
        with _LOCK:
            v = next((x for x in _STATE["vehicles"] if x["id"] == 1), None)
            if v:
                v["status"] = "patrolling"
                v["incident_location"] = None
        await ws_manager.broadcast({"type": "alert_updated", "alert": alert})
        _DEMO["alert_id"] = None
        return {"status": "ok"}


# Serve built frontend (production only — skipped when dist/ doesn't exist in dev)
_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(_frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
