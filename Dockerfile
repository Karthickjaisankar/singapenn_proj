FROM python:3.12-slim

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend — install deps then build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Backend + data + geocode cache (crimes + venues pre-geocoded, no Google API needed)
COPY backend/ ./backend/
COPY data/ ./data/
COPY cache/ ./cache/

EXPOSE 8080
CMD uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8080}
