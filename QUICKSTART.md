# Singapene Scheme - Quick Start Guide

## What's Been Built

A **professional-grade crime prevention dashboard** for Tambaram and Pallikaranai that:
- ✅ Visualizes 555 POCSO crime cases on an interactive Leaflet heatmap
- ✅ Classifies crimes as Low/Moderate/Severe (381 severe, 8 moderate, 166 low)
- ✅ Uses K-means clustering to define 4 optimal police patrol zones
- ✅ Shows real-time position of 4 police vehicles with patrol routes
- ✅ Overlays schools, colleges, malls, restaurants on the map
- ✅ Provides reactive dispatch (click map → dispatch nearest vehicle)
- ✅ Shows crime analytics: trends by year, severity distribution, hotspot rankings

## Architecture at a Glance

```
Data Pipeline:
Excel → Normalize → Classify → Geocode → K-means Zones → FastAPI State
  ↓
Frontend:
React/Leaflet → TanStack Query → Interactive Dashboard
```

## 5-Minute Setup

### Step 1: Install Dependencies
```bash
# Python backend
source venv/bin/activate
pip install -r requirements.txt

# Node.js frontend  
cd frontend && npm install --legacy-peer-deps
cd ..
```

### Step 2: Start Backend
```bash
# Terminal 1
source venv/bin/activate
uvicorn backend.app:app --reload --port 8000
```

Wait for: `INFO: Uvicorn running on http://127.0.0.1:8000`

### Step 3: Start Frontend
```bash
# Terminal 2
cd frontend && npm run dev
```

Visit: **http://localhost:5173**

## What You'll See

### Map (Center)
- **Red/Orange/Yellow/Green heatmap** showing crime intensity
- **Blue circles** marking 4 patrol zone centroids
- **Numbered vehicle markers** (1-4) showing police vehicle positions
- **Colored venue icons** (schools, colleges, malls)
- **Layer toggle buttons** to show/hide different visualizations

### Left Sidebar
- Crime summary (555 total, 381 severe)
- Crime by year (2022-2026)
- Crime by severity (color-coded)
- Crime by district (Tambaram vs Pallikaranai)
- Top 5 crime hotspots with counts

### Right Panel
**Vehicles Tab:**
- 4 vehicle cards showing ID, zone, status (Patrolling/Responding)
- Current coordinates and route information
- Instructions: "Click map to dispatch nearest vehicle"

**Analytics Tab:**
- Crime trends chart (year-wise)
- Severity distribution pie chart
- District-wise crime bar chart
- All charts interactive (hover for details)

## API Endpoints (for integration)

```bash
# Get metadata
curl http://localhost:8000/api/meta

# Get all crimes with coordinates and severity
curl http://localhost:8000/api/crimes | jq '.crimes[0]'

# Get 4 patrol zones
curl http://localhost:8000/api/zones | jq '.zones'

# Get vehicle positions
curl http://localhost:8000/api/vehicles | jq '.vehicles'

# Get statistics
curl http://localhost:8000/api/stats | jq

# Dispatch vehicle to incident
curl -X POST http://localhost:8000/api/vehicles/1/dispatch \
  -H "Content-Type: application/json" \
  -d '{"incident_lat": 12.92, "incident_lng": 80.10}'
```

## Key Features Explained

### Crime Heatmap
- **Green zones** = Low crime (molestation, harassment)
- **Orange zones** = Moderate crime (non-penetrative rape, child marriage)
- **Red zones** = Severe crime (penetrative rape, SC/ST crimes)
- Intensity based on crime count and severity in each area

### Patrol Zones
- Map divided into 4 zones using K-means clustering on crime locations
- Each vehicle assigned to 1 zone for proactive patrolling
- Vehicle can be dispatched to incidents in other zones (reactive)

### Venue Layer
- **Blue icons**: Schools (places where children congregate)
- **Purple icons**: Colleges (where young women study)
- **Teal icons**: Shopping malls (public gathering spaces)
- **Orange icons**: Restaurants/Bars (social venues)
- Helps identify where preventive presence is needed

### Vehicle Dispatch
- Click any spot on map
- System finds nearest available vehicle
- Vehicle route updated in real-time
- Status changes to "🚨 Responding"
- After incident, vehicle returns to patrol mode

## File Structure

```
singapen_app/
├── backend/                    # FastAPI application
│   ├── app.py                 # Main app (7 API endpoints)
│   ├── data_loader.py         # Excel parsing (555 crimes)
│   ├── classifier.py          # Crime severity (Low/Mod/Severe)
│   ├── geocode.py             # Google Geocoding API
│   ├── hotspots.py            # K-means patrol zones
│   ├── places.py              # Venue discovery
│   └── router.py              # Vehicle routing
│
├── frontend/                   # React + Tailwind app
│   ├── src/
│   │   ├── App.tsx            # Main layout
│   │   ├── components/
│   │   │   ├── Map.tsx        # Leaflet map
│   │   │   ├── Sidebar.tsx    # Crime filters
│   │   │   ├── VehiclePanel.tsx
│   │   │   └── StatsPanel.tsx
│   │   └── api.ts             # API client
│   └── package.json
│
├── data/                       # Crime data
│   └── POCSO - SINGA PENNAE.xlsx (555 rows)
│
├── credentials/
│   └── .env                   # Google Maps API key
│
├── requirements.txt           # Python packages
├── README.md                  # Full documentation
└── TESTING.md                # Test procedures
```

## Troubleshooting

### "Backend not responding"
- Check if uvicorn running on port 8000
- Look for errors: `source venv/bin/activate && uvicorn backend.app:app`

### "Map not loading"
- Check browser console (F12) for errors
- Ensure CARTO tiles can load (need internet)
- Try fullscreen mode button

### "Geocoding slow"
- First load: addresses being geocoded (Google API calls)
- Subsequent loads: cached in SQLite (instant)
- If stuck: restart backend

### "Frontend can't reach backend"
- Ensure backend running on http://127.0.0.1:8000
- Check Vite proxy in `frontend/vite.config.ts`
- Try: `curl http://127.0.0.1:8000/api/meta`

## Next Steps

1. **Customize for your deployment**
   - Update coordinates if deploying to different areas
   - Modify color scheme in Tailwind config
   - Add your organization branding

2. **Add more features**
   - Real-time incident reporting (WebSocket)
   - SMS/WhatsApp alerts for residents
   - ML-based crime prediction
   - Mobile app (React Native)

3. **Deploy to production**
   - Railway.app (recommended - 1-click deploy)
   - AWS/Azure/GCP (see DEPLOYMENT.md)
   - Self-hosted on Ubuntu VM

4. **Integrate with existing systems**
   - FIR management system
   - Police radio dispatch
   - 911 emergency response system

## Documentation

- **README.md** - Full API documentation and feature details
- **TESTING.md** - Test procedures and verification checklist
- **DEPLOYMENT.md** - Production deployment guides
- **QUICKSTART.md** - This file

## Support

For issues or questions:
1. Check TESTING.md for diagnostic steps
2. Review error messages in browser console (F12)
3. Check backend logs in terminal
4. Refer to README.md for architecture details

---

**Built with**: FastAPI + React + Leaflet + Tailwind
**Data**: 555 POCSO Act crimes (2022-2026)
**Coverage**: Tambaram & Pallikaranai, Chennai
**Purpose**: Crime prevention through data-driven patrol optimization
