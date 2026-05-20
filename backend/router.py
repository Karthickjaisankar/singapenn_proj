from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum
import math
from backend.hotspots import PatrolZone


class VehicleStatus(str, Enum):
    PATROLLING = "patrolling"
    RESPONDING = "responding"
    IDLE = "idle"


@dataclass
class PatrolVehicle:
    id: int
    zone_id: int
    lat: float
    lng: float
    status: VehicleStatus = VehicleStatus.PATROLLING
    current_route: List[list] = field(default_factory=list)
    incident_location: Optional[list] = None

    def to_dict(self):
        return {
            "id": self.id,
            "zone_id": self.zone_id,
            "lat": self.lat,
            "lng": self.lng,
            "status": self.status.value,
            "current_route": self.current_route,
            "incident_location": self.incident_location,
        }


# ── Spatial helpers ────────────────────────────────────────────────────────

def _haversine(p1: list, p2: list) -> float:
    """Distance in km between [lat1, lng1] and [lat2, lng2]."""
    R = 6371.0
    lat1, lng1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lng2 = math.radians(p2[0]), math.radians(p2[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(min(1.0, a)))


def _greedy_circuit(points: list[list]) -> list[list]:
    """
    Nearest-neighbour TSP heuristic.
    Starts from points[0], visits each remaining point by shortest hop, closes the loop.
    """
    if len(points) <= 2:
        return points
    remaining = list(points[1:])
    circuit = [points[0]]
    while remaining:
        last = circuit[-1]
        nearest = min(remaining, key=lambda p: _haversine(last, p))
        circuit.append(nearest)
        remaining.remove(nearest)
    circuit.append(circuit[0])   # close loop
    return circuit


def _get_time_slot(hour: int) -> str:
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 18:
        return "afternoon"
    else:
        return "night"


# ── Core routing logic ─────────────────────────────────────────────────────

def compute_optimal_routing(
    zones: list[PatrolZone], current_hour: int, n_vehicles: int = 4
) -> list[PatrolVehicle]:
    """
    Assign n_vehicles to zones based on time-of-day adjusted risk.

    Risk_at_hour(zone) = zone.risk_score × (1 + time_slot_fraction)

    Allocation: proportional to risk, with floor of 0 per zone.
    The highest-risk zone absorbs any rounding remainder.
    Each vehicle gets a greedy patrol circuit through the zone's top crime spots.
    """
    slot = _get_time_slot(current_hour)

    zone_risks = [
        (z, z.risk_score * (1.0 + z.time_slot_risks.get(slot, 0.33)))
        for z in zones
    ]
    zone_risks.sort(key=lambda x: x[1], reverse=True)

    n_zones = len(zone_risks)
    # Every zone gets at least 1 vehicle; extras go proportionally to highest risk
    base = min(1, n_vehicles // n_zones)           # 1 if we have enough, else 0
    alloc = [base] * n_zones
    extras = n_vehicles - sum(alloc)

    if extras > 0:
        total_risk = sum(r for _, r in zone_risks) or 1.0
        # Proportional share of extras
        extra_shares = [(r / total_risk) * extras for _, r in zone_risks]
        for i, share in enumerate(extra_shares):
            alloc[i] += int(share)
        # Distribute any rounding remainder to the top-risk zones
        remainder = n_vehicles - sum(alloc)
        for i in range(remainder):
            alloc[i % n_zones] += 1

    vehicles: list[PatrolVehicle] = []
    vehicle_id = 1

    for (zone, _risk), n_assigned in zip(zone_risks, alloc):
        for _ in range(n_assigned):
            centroid = [zone.centroid_lat, zone.centroid_lng]
            waypoints = [centroid] + (zone.crime_spot_coords[:4] or [])
            circuit = _greedy_circuit(waypoints)

            vehicles.append(
                PatrolVehicle(
                    id=vehicle_id,
                    zone_id=zone.zone_id,
                    lat=zone.centroid_lat,
                    lng=zone.centroid_lng,
                    status=VehicleStatus.PATROLLING,
                    current_route=circuit,
                )
            )
            vehicle_id += 1

    return vehicles


def assign_patrol_routes(zones: list[PatrolZone], current_hour: int = 12) -> list[PatrolVehicle]:
    """Entry point used at startup — delegates to compute_optimal_routing."""
    return compute_optimal_routing(zones, current_hour, n_vehicles=4)


# ── Dispatch helpers (unchanged interface) ─────────────────────────────────

def dispatch_vehicle_to_incident(
    vehicles: list[PatrolVehicle], incident_lat: float, incident_lng: float
) -> PatrolVehicle:
    if not vehicles:
        raise ValueError("No vehicles available")

    nearest = min(
        vehicles,
        key=lambda v: _haversine([v.lat, v.lng], [incident_lat, incident_lng]),
    )
    nearest.status = VehicleStatus.RESPONDING
    nearest.incident_location = [incident_lat, incident_lng]
    nearest.current_route = [
        [nearest.lat, nearest.lng],
        [incident_lat, incident_lng],
    ]
    return nearest


def update_vehicle_position(vehicle: PatrolVehicle, new_lat: float, new_lng: float):
    vehicle.lat = new_lat
    vehicle.lng = new_lng


def return_vehicle_to_patrol(vehicle: PatrolVehicle, zone: PatrolZone):
    vehicle.status = VehicleStatus.PATROLLING
    vehicle.incident_location = None
    vehicle.lat = zone.centroid_lat
    vehicle.lng = zone.centroid_lng
    centroid = [zone.centroid_lat, zone.centroid_lng]
    waypoints = [centroid] + (zone.crime_spot_coords[:4] or [])
    vehicle.current_route = _greedy_circuit(waypoints)
