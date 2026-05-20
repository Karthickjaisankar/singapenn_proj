# Singapene Scheme - Crime Prevention Dashboard

A real-time crime prevention system for Tambaram and Pallikaranai, Chennai that identifies crime hotspots and optimizes police patrol vehicle routing.

## Features

- **Crime Hotspot Analysis**: Visualize crime distribution across Tambaram and Pallikaranai using an interactive heatmap
- **Crime Classification**: Crimes classified as Low, Moderate, or Severe based on type and penetration
- **Patrol Zone Optimization**: K-means clustering divides the area into 4 patrol zones for optimal vehicle deployment
- **Police Vehicle Tracking**: Real-time tracking of 4 patrol vehicles with route visualization
- **Venue Awareness**: Overlay of schools, colleges, malls, and restaurants where women/children congregate
- **Analytics Dashboard**: Crime trends, severity distribution, and district-wise statistics
- **Responsive Design**: Light-themed professional UI optimized for desktop and mobile

## Tech Stack

- **Backend**: FastAPI (Python) with in-memory data caching
- **Frontend**: React + TypeScript + Tailwind CSS + Leaflet.js
- **Maps**: Leaflet.js with heatmap.js and marker clustering
- **APIs**: Google Geocoding API, Google Places API
- **Database**: SQLite (caching only)

## Project Structure

```
singapen_app/
├── backend/
│   ├── app.py              # FastAPI application entry point
│   ├── data_loader.py      # Excel parsing and normalization
│   ├── classifier.py       # Crime severity classification
│   ├── geocode.py          # Google Geocoding API + SQLite cache
│   ├── hotspots.py         # K-means clustering for patrol zones
│   ├── places.py           # Google Places API for venues
│   └── router.py           # Police vehicle routing logic
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main application component
│   │   ├── api.ts          # API client
│   │   ├── types.ts        # TypeScript types
│   │   ├── main.tsx        # React entry point
│   │   └── components/
│   │       ├── Map.tsx              # Leaflet map component
│   │       ├── Sidebar.tsx          # Crime filters and summary
│   │       ├── VehiclePanel.tsx     # Police vehicle status
│   │       └── StatsPanel.tsx       # Analytics charts
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── data/
│   └── POCSO - SINGA PENNAE.xlsx  # Crime incident data
├── credentials/
│   └── .env                        # Google Maps API key
├── cache/
│   └── geocode.sqlite             # Geocoding cache
├── requirements.txt               # Python dependencies
├── Procfile                       # Deployment configuration
└── runtime.txt                    # Python version
```

## Setup Instructions

### Prerequisites
- Python 3.9+
- Node.js 16+
- Google Maps API key (from mtc_app or create new)

### Backend Setup

1. **Create and activate virtual environment**:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Set up environment variables**:
```bash
cp credentials/.env .env
# Edit .env and ensure GMAP_API key is set
```

4. **Start backend server**:
```bash
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory**:
```bash
cd frontend
```

2. **Install dependencies**:
```bash
npm install
```

3. **Start development server**:
```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

## API Endpoints

### Metadata
- `GET /api/meta` - App statistics (crime count, zones, vehicles, venues)

### Crime Data
- `GET /api/crimes` - All geocoded and classified crimes
- `GET /api/hotspots` - Crime hotspot clusters
- `GET /api/stats` - Crime analytics (by year, severity, district)

### Patrol Operations
- `GET /api/zones` - Patrol zone definitions with centroids
- `GET /api/vehicles` - Police vehicle positions and routes
- `POST /api/vehicles/{vehicle_id}/dispatch` - Dispatch vehicle to incident

### Venues
- `GET /api/venues` - Schools, colleges, malls, restaurants

### Management
- `POST /api/refresh` - Manually refresh all data

## Crime Severity Classification

- **SEVERE** (Red): Penetrative rape cases, SC/ST rape, child marriage with rape
- **MODERATE** (Orange): Non-penetrative rape, child marriage, SC/ST non-penetrative
- **LOW** (Green): POCSO Other (molestation, harassment, grooming)

## How to Use

### Dashboard Navigation
1. **Left Sidebar**: View crime summary and detailed filters
   - Crimes by year
   - Crimes by severity level
   - Crimes by district
   - Crime hotspots
2. **Center Map**: Interactive Leaflet map with multiple layers
   - Toggle between Heatmap/Clusters/Both views
   - Toggle individual layers (venues, vehicles, zones)
   - Click on incidents for details
   - Fullscreen mode for expanded view
3. **Right Panel**: Vehicle status and analytics
   - Switch between Vehicle status and Analytics tabs
   - Real-time vehicle positions and routes
   - Crime trend charts
   - Severity distribution pie chart

### Dispatching Vehicles
- Click any location on the map to dispatch the nearest available vehicle
- Vehicle status changes to "Responding" and route is updated
- After incident resolution, vehicle returns to patrol mode

## Performance Notes

- Crime data is loaded once at startup (555 crimes from Excel)
- Geocoding is cached in SQLite for quick subsequent loads
- Venue data from Google Places API is cached weekly
- K-means clustering with k=4 creates optimal patrol zones
- Real-time updates use TanStack React Query with 0-second staleTime

## Deployment

### Railway.app (Recommended)
1. Create Railway project
2. Connect GitHub repo
3. Set environment variable: `GMAP_API=your_key`
4. Deploy

### Local Deployment
```bash
# Terminal 1: Backend
source venv/bin/activate
uvicorn backend.app:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend && npm run build
npm run preview
```

## Troubleshooting

### Backend won't start
- Check Python version (3.9+ required)
- Verify all dependencies installed: `pip list`
- Check if port 8000 is in use

### Frontend won't connect to backend
- Ensure backend is running on port 8000
- Check Vite proxy config in `vite.config.ts`
- Verify API endpoint in `src/api.ts`

### Geocoding not working
- Check Google Maps API key in `.env`
- Verify API key has Geocoding API enabled
- Check cache/geocode.sqlite permissions

### Map not loading
- Check browser console for errors
- Verify Leaflet CSS is imported in `src/index.css`
- Check internet connection (Leaflet tiles need CARTO)

## Future Enhancements

- [ ] Real-time crime reporting integration
- [ ] SMS/WhatsApp alerts for residents
- [ ] Machine learning-based crime prediction
- [ ] Multi-language support (Tamil, Telugu, Kannada)
- [ ] Mobile app for field officers
- [ ] Integration with FIR management system
- [ ] Heat prediction by time of day
- [ ] School/college coordination features

## License

Government of Tamil Nadu - Police Department

## Contact

For support or inquiries: Tambaram Police Commissioner's Office
