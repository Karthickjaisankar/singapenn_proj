import sqlite3
import requests
import os
from typing import Optional, Tuple
from pathlib import Path
from backend.data_loader import CrimeRecord
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../credentials/.env"))

GMAP_API_KEY = os.getenv("GMAP_API")
CACHE_DB = "cache/geocode.sqlite"

# Ensure cache database exists
Path(CACHE_DB).parent.mkdir(parents=True, exist_ok=True)


def init_geocode_cache():
    """Initialize SQLite cache database."""
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS crime_geo (
            address TEXT PRIMARY KEY,
            lat REAL,
            lng REAL
        )
    """
    )
    conn.commit()
    conn.close()


def get_cached_geo(address: str) -> Optional[Tuple[float, float]]:
    """Retrieve cached lat/lng for address."""
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT lat, lng FROM crime_geo WHERE address = ?", (address,))
    result = cursor.fetchone()
    conn.close()
    return result if result else None


def cache_geo(address: str, lat: float, lng: float):
    """Store lat/lng in cache."""
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO crime_geo (address, lat, lng) VALUES (?, ?, ?)",
        (address, lat, lng),
    )
    conn.commit()
    conn.close()


def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """
    Geocode address using Google Geocoding API with cache.
    Returns (lat, lng) or None if not found.
    """
    if not address or not address.strip():
        return None

    # Check cache first
    cached = get_cached_geo(address)
    if cached:
        return cached

    # Query Google Geocoding API
    try:
        full_address = f"{address}, Tambaram/Pallikaranai, Chennai, Tamil Nadu, India"
        params = {
            "address": full_address,
            "key": GMAP_API_KEY,
            "region": "in",
        }
        response = requests.get("https://maps.googleapis.com/maps/api/geocode/json", params=params, timeout=5)
        data = response.json()

        if data.get("results"):
            location = data["results"][0]["geometry"]["location"]
            lat, lng = location["lat"], location["lng"]
            cache_geo(address, lat, lng)
            return (lat, lng)
    except Exception as e:
        print(f"Geocoding error for '{address}': {e}")

    return None


def geocode_crimes_batch(crimes: list[CrimeRecord]) -> list[CrimeRecord]:
    """Geocode all crimes and attach lat/lng."""
    init_geocode_cache()

    for crime in crimes:
        lat_lng = geocode_address(crime.place_of_crime)
        if lat_lng:
            crime.lat, crime.lng = lat_lng

    return crimes
