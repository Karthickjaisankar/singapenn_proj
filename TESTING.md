# Testing Guide - Singapene Scheme

## Quick Start Test

### 1. Start Backend
```bash
source venv/bin/activate
uvicorn backend.app:app --reload --port 8000
```

Wait for output like:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 2. Test Backend APIs

Open a new terminal and test these endpoints:

```bash
# Test metadata
curl http://localhost:8000/api/meta | jq

# Should return:
# {
#   "crimes_total": 555,
#   "zones_total": 4,
#   "vehicles_total": 4,
#   "venues_total": <number>,
#   "last_refresh": "now"
# }

# Test crimes
curl http://localhost:8000/api/crimes | jq '.crimes[0]'

# Should show a crime with lat/lng and severity

# Test zones
curl http://localhost:8000/api/zones | jq '.zones[0]'

# Should show patrol zones with centroids

# Test vehicles
curl http://localhost:8000/api/vehicles | jq '.vehicles[0]'

# Should show 4 vehicles with positions

# Test stats
curl http://localhost:8000/api/stats | jq

# Should show crime distribution by year, severity, etc.
```

### 3. Start Frontend

```bash
cd frontend
npm run dev
```

Open browser to: http://localhost:5173

### 4. Verify Frontend

- [ ] Map loads without errors
- [ ] Crime data displays (should see heatmap or clusters)
- [ ] Left sidebar shows crime summary
- [ ] Right panel shows vehicle status
- [ ] Can toggle between heatmap/clusters views
- [ ] Can toggle individual layers (venues, vehicles, zones)
- [ ] Can see analytics charts in right panel

## Detailed Tests

### Data Loading Test
```bash
python3 -c "
from backend.data_loader import load_crimes_from_excel
crimes = load_crimes_from_excel('data/POCSO - SINGA PENNAE.xlsx')
print(f'Loaded {len(crimes)} crimes')
print('Sample crime:', crimes[0])
"
```

Expected output:
```
Loaded 555 crimes
Sample crime: CrimeRecord(sl_no=1, district='Pallikaranai', ...)
```

### Classification Test
```bash
python3 -c "
from backend.data_loader import load_crimes_from_excel
from backend.classifier import classify_crimes_batch
crimes = load_crimes_from_excel('data/POCSO - SINGA PENNAE.xlsx')
crimes = classify_crimes_batch(crimes)
severe = sum(1 for c in crimes if c.severity == 'severe')
moderate = sum(1 for c in crimes if c.severity == 'moderate')
low = sum(1 for c in crimes if c.severity == 'low')
print(f'Severe: {severe}, Moderate: {moderate}, Low: {low}')
"
```

Expected output:
```
Severe: 381, Moderate: 8, Low: 166
```

### Geocoding Test
```bash
python3 -c "
from backend.geocode import geocode_address
result = geocode_address('Pammal, Chennai')
print('Geocoding result:', result)
"
```

Expected output (might take a few seconds):
```
Geocoding result: (13.xxx, 80.xxx)  # lat, lng coordinates
```

### Hotspots Test
```bash
python3 -c "
from backend.data_loader import load_crimes_from_excel
from backend.classifier import classify_crimes_batch
from backend.hotspots import compute_patrol_zones

crimes = load_crimes_from_excel('data/POCSO - SINGA PENNAE.xlsx')
crimes = classify_crimes_batch(crimes)

zones = compute_patrol_zones(crimes, k=4)
for zone in zones:
    print(f'Zone {zone.zone_id}: {zone.crime_count} crimes, centroid at ({zone.centroid_lat:.4f}, {zone.centroid_lng:.4f})')
"
```

Expected output:
```
Zone 0: XXX crimes, centroid at (12.xxxx, 80.xxxx)
Zone 1: XXX crimes, centroid at (12.xxxx, 80.xxxx)
Zone 2: XXX crimes, centroid at (12.xxxx, 80.xxxx)
Zone 3: XXX crimes, centroid at (12.xxxx, 80.xxxx)
```

## UI Testing Checklist

### Map Features
- [ ] Map loads and displays CARTO basemap
- [ ] Heatmap layer shows crime intensity (red/orange/yellow/green)
- [ ] Cluster view shows grouped incidents
- [ ] Patrol zones display as circle markers
- [ ] Police vehicles show as numbered circular markers
- [ ] Venues display with color-coded icons

### Sidebar Features
- [ ] Crime summary cards show correct totals
- [ ] Crime by year filter expandable and shows data
- [ ] Crime by severity shows correct color coding
- [ ] Crime by district displays both areas
- [ ] Crime hotspots list shows top 5 locations

### Right Panel - Vehicles Tab
- [ ] Shows 4 vehicles with their ID, zone, and status
- [ ] Vehicle status is either "🛡️ Patrolling" or "🚨 Responding"
- [ ] Clicking vehicle cards displays additional info
- [ ] Dispatch instructions visible

### Right Panel - Analytics Tab
- [ ] Crime trends chart shows year-wise distribution
- [ ] Severity pie chart shows correct proportions
- [ ] District bar chart displays both areas

### Layer Toggle
- [ ] Can toggle heatmap layer on/off
- [ ] Can toggle clusters layer on/off
- [ ] Can toggle zones layer on/off
- [ ] Can toggle vehicles layer on/off
- [ ] Can toggle venues layer on/off
- [ ] Fullscreen button works

## Performance Benchmarks

- Backend startup: < 5 seconds
- API response time: < 100ms
- Frontend load time: < 2 seconds
- Map render time: < 1 second
- Geocoding per address: 0.1-0.5 seconds (cached)

## Error Handling Tests

### Test with missing Google Maps API key
1. Remove or comment out GMAP_API in credentials/.env
2. Start backend
3. Verify endpoint still works but doesn't geocode

### Test with missing data file
1. Rename data/POCSO*.xlsx temporarily
2. Start backend
3. Should fail gracefully with error message

### Test with invalid coordinates
1. Manually add a crime with invalid lat/lng
2. Verify it doesn't crash the map

## Browser Compatibility
- [x] Chrome/Chromium 90+
- [x] Firefox 88+
- [x] Safari 14+
- [x] Edge 90+

## Mobile Responsiveness
- [x] Map is responsive on tablets
- [x] Sidebar collapses on small screens
- [x] Touch interactions work on mobile
- [x] Buttons are tap-friendly (44px minimum)

## Notes

- Geocoding requires internet connection and valid Google Maps API key
- First load might be slower as addresses are geocoded
- Subsequent loads will use cached coordinates
- Crime data is loaded once at startup (not real-time)
