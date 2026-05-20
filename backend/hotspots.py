from dataclasses import dataclass, field
from typing import List, Optional, Dict
from datetime import datetime
import math
import numpy as np
from sklearn.cluster import KMeans
from backend.data_loader import CrimeRecord
from backend.classifier import get_severity_weight

# Crimes decay to half-weight after 365 days
_DECAY_LAMBDA = math.log(2) / 365.0
# Reference date: use mid-2024 as "now" for the historical dataset
_REFERENCE_DATE = datetime(2024, 6, 1)


@dataclass
class PatrolZone:
    zone_id: int
    centroid_lat: float
    centroid_lng: float
    crime_count: int
    severity_score: float
    top_spots: List[dict] = field(default_factory=list)
    # ── New fields ──────────────────────────────────────────────────────────
    risk_score: float = 0.0             # recency-decayed + severity-weighted total
    recency_score: float = 0.0         # 0–1, avg temporal weight across crimes in zone
    time_slot_risks: Dict[str, float] = field(default_factory=dict)  # slot → fraction
    crime_spot_coords: List[List[float]] = field(default_factory=list)  # [[lat,lng], …]


def _temporal_weight(date_of_occurrence: Optional[datetime]) -> float:
    """Exponential decay: recent crime → weight near 1.0, old crime → near 0."""
    if not date_of_occurrence:
        return 0.3
    days_ago = max(0, (_REFERENCE_DATE - date_of_occurrence).days)
    return math.exp(-_DECAY_LAMBDA * days_ago)


def _get_time_slot(hour: int) -> str:
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 18:
        return "afternoon"
    else:
        return "night"


def _time_slot_risks(crimes: list[CrimeRecord]) -> Dict[str, float]:
    """
    Per-slot share of severity-weighted crimes.
    Crimes with no date are excluded (don't bias the distribution).
    """
    counts: Dict[str, float] = {"morning": 0.0, "afternoon": 0.0, "night": 0.0}
    for c in crimes:
        if c.date_of_occurrence and c.date_of_occurrence.hour != 0:
            slot = _get_time_slot(c.date_of_occurrence.hour)
            counts[slot] += get_severity_weight(c.severity or "low")

    total = sum(counts.values())
    if total == 0:
        # No time data — distribute evenly
        return {"morning": 0.33, "afternoon": 0.33, "night": 0.34}
    return {k: round(v / total, 4) for k, v in counts.items()}


def _combined_weight(c: CrimeRecord) -> float:
    return get_severity_weight(c.severity or "low") * _temporal_weight(c.date_of_occurrence)


def compute_patrol_zones(crimes: list[CrimeRecord], k: int = 4) -> list[PatrolZone]:
    """
    K-means clustering weighted by (severity × temporal decay).

    Each zone carries:
    - risk_score       : sum of combined weights for crimes in zone
    - recency_score    : mean temporal weight (how fresh the crimes are)
    - time_slot_risks  : distribution of when crimes occur (morning/afternoon/night)
    - crime_spot_coords: ordered top-spot coords, used by the router to build patrol circuits
    """
    # Filter to Tambaram/Pallikaranai bounding box — discard geocoding outliers
    _LAT_MIN, _LAT_MAX = 12.5, 13.4
    _LNG_MIN, _LNG_MAX = 79.8, 80.7
    valid = [
        c for c in crimes
        if c.lat is not None and c.lng is not None
        and _LAT_MIN <= c.lat <= _LAT_MAX
        and _LNG_MIN <= c.lng <= _LNG_MAX
    ]

    if len(valid) < k:
        return _create_dummy_zones(k)

    coords = np.array([[c.lat, c.lng] for c in valid])

    # Duplicate each point proportional to combined weight → weighted K-means
    dup_coords: list[list[float]] = []
    dup_crimes: list[CrimeRecord] = []
    for coord, crime in zip(coords, valid):
        repeat = max(1, round(_combined_weight(crime) * 4))
        for _ in range(repeat):
            dup_coords.append(coord)
            dup_crimes.append(crime)

    dup_arr = np.array(dup_coords)
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = kmeans.fit_predict(dup_arr)

    zones: list[PatrolZone] = []
    for zone_id in range(k):
        idx = np.where(labels == zone_id)[0]
        cluster_crimes = [dup_crimes[i] for i in idx]

        if not cluster_crimes:
            continue

        centroid = kmeans.cluster_centers_[zone_id]
        lat, lng = float(centroid[0]), float(centroid[1])

        # De-duplicate by object id
        unique_crimes = list({id(c): c for c in cluster_crimes}.values())
        crime_count = len(unique_crimes)
        severity_score = sum(get_severity_weight(c.severity or "low") for c in unique_crimes)
        risk_score = sum(_combined_weight(c) for c in unique_crimes)
        recency_score = (
            sum(_temporal_weight(c.date_of_occurrence) for c in unique_crimes) / crime_count
        )

        # Top spots ranked by combined weight, with geocoords for routing
        spot_map: Dict[str, dict] = {}
        for c in unique_crimes:
            key = c.place_of_crime
            if key not in spot_map:
                spot_map[key] = {
                    "place": key,
                    "severity": c.severity,
                    "weight": 0.0,
                    "lat": c.lat,
                    "lng": c.lng,
                }
            spot_map[key]["weight"] += _combined_weight(c)

        top_spots_raw = sorted(spot_map.values(), key=lambda x: x["weight"], reverse=True)[:5]
        top_spots = [
            {"place": s["place"], "severity": s["severity"], "weight": round(s["weight"], 3)}
            for s in top_spots_raw
        ]
        crime_spot_coords = [
            [s["lat"], s["lng"]]
            for s in top_spots_raw
            if s.get("lat") is not None and s.get("lng") is not None
        ]

        zones.append(
            PatrolZone(
                zone_id=zone_id,
                centroid_lat=lat,
                centroid_lng=lng,
                crime_count=crime_count,
                severity_score=round(severity_score, 2),
                top_spots=top_spots,
                risk_score=round(risk_score, 2),
                recency_score=round(recency_score, 4),
                time_slot_risks=_time_slot_risks(unique_crimes),
                crime_spot_coords=crime_spot_coords,
            )
        )

    return sorted(zones, key=lambda z: z.zone_id)


def _create_dummy_zones(k: int) -> list[PatrolZone]:
    centers = [
        (12.9249, 80.1000),
        (12.9008, 80.2144),
        (12.9200, 80.1500),
        (12.8950, 80.1800),
    ]
    return [
        PatrolZone(
            zone_id=i,
            centroid_lat=lat,
            centroid_lng=lng,
            crime_count=0,
            severity_score=0.0,
            risk_score=0.0,
            time_slot_risks={"morning": 0.33, "afternoon": 0.33, "night": 0.34},
        )
        for i, (lat, lng) in enumerate(centers[:k])
    ]
