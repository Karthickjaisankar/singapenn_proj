#!/bin/bash

echo "=================================="
echo "Singapene Scheme - Startup Script"
echo "=================================="
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "Installing Python dependencies..."
pip install -q -r requirements.txt

# Check if .env exists
if [ ! -f "credentials/.env" ]; then
    echo ""
    echo "WARNING: credentials/.env not found!"
    echo "Please copy it from mtc_app/credentials/.env"
    echo "Or set GMAP_API environment variable"
    echo ""
fi

# Start backend
echo ""
echo "Starting backend server (FastAPI)..."
echo "Backend will be available at http://localhost:8000"
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend
echo ""
echo "Starting frontend server (Vite)..."
echo "Frontend will be available at http://localhost:5173"
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "=================================="
echo "Both servers are running!"
echo "Backend  (API): http://localhost:8000"
echo "Frontend (UI):  http://localhost:5173"
echo "=================================="
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
