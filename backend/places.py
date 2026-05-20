import sqlite3
import requests
import os
from typing import List, Dict, Optional, Tuple
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../credentials/.env"))

GMAP_API_KEY = os.getenv("GMAP_API")
CACHE_DB = "cache/geocode.sqlite"


def init_places_cache():
    """Initialize SQLite cache for venues."""
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS venues (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT,
            lat REAL,
            lng REAL
        )
    """
    )
    conn.commit()
    conn.close()


def get_cached_venues(venue_type: str) -> List[Dict]:
    """Retrieve cached venues of a specific type."""
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, type, lat, lng FROM venues WHERE type = ?", (venue_type,))
    results = cursor.fetchall()
    conn.close()

    return [{"id": r[0], "name": r[1], "type": r[2], "lat": r[3], "lng": r[4]} for r in results]


def cache_venue(venue_id: str, name: str, venue_type: str, lat: float, lng: float):
    """Store venue in cache."""
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO venues (id, name, type, lat, lng) VALUES (?, ?, ?, ?, ?)",
        (venue_id, name, venue_type, lat, lng),
    )
    conn.commit()
    conn.close()


def search_nearby_places(lat: float, lng: float, place_type: str, radius: int = 8000) -> List[Dict]:
    """
    Search for places near a location using Google Places API with pagination.
    Returns list of venues with name, type, lat, lng, address.
    """
    if not GMAP_API_KEY:
        return []

    # Map venue types to Google Places types
    type_mapping = {
        "school": "school",
        "college": "university",
        "restaurant": "restaurant",
        "bar": "bar",
        "mall": "shopping_mall",
        "hospital": "hospital",
    }

    google_type = type_mapping.get(place_type, place_type)
    venues = []
    next_page_token = None
    pages = 0

    try:
        while pages < 3:  # Fetch up to 3 pages = 60 results max
            params = {
                "location": f"{lat},{lng}",
                "radius": radius,
                "type": google_type,
                "key": GMAP_API_KEY,
            }
            if next_page_token:
                params["pagetoken"] = next_page_token

            response = requests.get("https://maps.googleapis.com/maps/api/place/nearbysearch/json", params=params, timeout=10)
            data = response.json()

            for result in data.get("results", []):
                venue = {
                    "id": result.get("place_id"),
                    "name": result.get("name"),
                    "type": place_type,
                    "lat": result["geometry"]["location"]["lat"],
                    "lng": result["geometry"]["location"]["lng"],
                    "address": result.get("vicinity", ""),
                }
                venues.append(venue)
                cache_venue(venue["id"], venue["name"], place_type, venue["lat"], venue["lng"])

            next_page_token = data.get("next_page_token")
            if not next_page_token:
                break
            pages += 1

        return venues
    except Exception as e:
        print(f"Places API error for {place_type}: {e}")
        return []


def discover_venues() -> List[Dict]:
    """
    Discover all important venues in Tambaram and Pallikaranai areas.
    Returns combined list of schools, colleges, malls, bars, hospitals.
    """
    init_places_cache()

    venue_types = ["school", "college", "mall", "bar", "restaurant", "hospital"]

    # Centers for Tambaram and Pallikaranai
    centers = [
        (12.9249, 80.1000),  # Tambaram
        (12.9008, 80.2144),  # Pallikaranai
    ]

    all_venues = []

    for center_lat, center_lng in centers:
        for venue_type in venue_types:
            venues = search_nearby_places(center_lat, center_lng, venue_type, radius=8000)
            all_venues.extend(venues)

    # Remove duplicates by place_id
    unique_venues = {v["id"]: v for v in all_venues}
    return list(unique_venues.values())


def get_all_cached_venues() -> List[Dict]:
    """Get all venues from cache."""
    try:
        conn = sqlite3.connect(CACHE_DB)
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, type, lat, lng FROM venues")
        results = cursor.fetchall()
        conn.close()
        return [{"id": r[0], "name": r[1], "type": r[2], "lat": r[3], "lng": r[4]} for r in results]
    except sqlite3.OperationalError:
        return []
