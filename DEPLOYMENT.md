# Deployment Guide - Singapene Scheme

## Local Development

### Quick Start
```bash
# Setup backend
source venv/bin/activate
pip install -r requirements.txt

# Terminal 1: Start backend
uvicorn backend.app:app --reload --port 8000

# Terminal 2: Start frontend
cd frontend && npm run dev
```

Then visit: http://localhost:5173

## Production Build

### Frontend
```bash
cd frontend
npm run build
# Outputs to frontend/dist/
```

### Backend
```bash
# No build needed - FastAPI serves directly
# Ensure all dependencies are in requirements.txt
```

## Railway.app Deployment (Recommended)

### 1. Repository Setup
```bash
git init
git add .
git commit -m "Initial Singapene Scheme app"
git push -u origin main
```

### 2. Railway Configuration
```bash
# Create railway.toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn backend.app:app --host 0.0.0.0 --port $PORT"
```

### 3. Environment Variables
Set in Railway dashboard:
- `GMAP_API`: Your Google Maps API key
- `VITE_API_URL`: Backend URL (e.g., https://app.railway.app)

### 4. Dockerfile (Optional)
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install -q -r requirements.txt

# Copy application
COPY . .

# Install frontend dependencies and build
RUN apt-get update && apt-get install -y nodejs npm
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps && npm run build
WORKDIR /app

# Expose port
EXPOSE 8000

# Run backend server
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Docker Local Testing

### Build Image
```bash
docker build -t singapene:latest .
```

### Run Container
```bash
docker run -p 8000:8000 \
  -e GMAP_API=your_api_key \
  singapene:latest
```

## AWS Deployment

### Using Lambda + RDS
1. Package backend for Lambda
2. Use RDS for SQLite cache
3. Use CloudFront for frontend (S3 + CDN)

### Using EC2
1. Launch Ubuntu 22.04 instance
2. Install Python 3.11, Node.js
3. Clone repository
4. Setup systemd services for backend and frontend

### Using ECS + Fargate
1. Push Docker image to ECR
2. Create ECS task definition
3. Create ECS service with load balancer
4. Configure auto-scaling

## Google Cloud Deployment

### Cloud Run (Recommended)
```bash
# Configure gcloud
gcloud config set project YOUR_PROJECT

# Build and deploy
gcloud run deploy singapene-scheme \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GMAP_API=your_api_key
```

### App Engine
1. Create app.yaml configuration
2. Deploy with `gcloud app deploy`

## Azure Deployment

### App Service
1. Create App Service plan
2. Create Web App
3. Connect to repository
4. Set environment variables
5. Deploy

## Performance Optimization

### Backend
- Use production ASGI server (Gunicorn + Uvicorn workers)
- Cache crime data in Redis for multi-instance setup
- Use CDN for static assets
- Implement rate limiting

### Frontend
- Enable gzip compression
- Minify CSS/JavaScript
- Use lazy loading for images
- Cache static assets (1 year TTL)

### Database
- SQLite is suitable for up to 100MB data
- For larger datasets, migrate to PostgreSQL
- Add indexes on frequently queried columns

## Monitoring & Logging

### Backend Monitoring
- Use Sentry for error tracking
- Monitor API response times with New Relic
- Set up alerts for high error rates

### Frontend Monitoring
- Use Sentry for JS errors
- Monitor Core Web Vitals with Web Vitals
- Track user sessions with Mixpanel/Amplitude

### Logging
```bash
# Backend logs
tail -f /var/log/singapene/backend.log

# Frontend logs
# Browser DevTools Console
```

## Database Migration

### From SQLite to PostgreSQL
```python
import sqlite3
import psycopg2

# Read from SQLite
sqlite_conn = sqlite3.connect('cache/geocode.sqlite')
sqlite_cursor = sqlite_conn.cursor()
sqlite_cursor.execute("SELECT * FROM crime_geo")
data = sqlite_cursor.fetchall()

# Write to PostgreSQL
pg_conn = psycopg2.connect("dbname=singapene user=postgres")
pg_cursor = pg_conn.cursor()
pg_cursor.executemany(
    "INSERT INTO crime_geo (address, lat, lng) VALUES (%s, %s, %s)",
    data
)
pg_conn.commit()
```

## Security Checklist

- [ ] API keys stored in environment variables only
- [ ] HTTPS enabled for all connections
- [ ] CORS properly configured (no allow all)
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (use parameterized queries)
- [ ] XSS prevention with Content Security Policy
- [ ] CSRF tokens for state-changing operations
- [ ] Regular security updates for dependencies
- [ ] Database backups automated

## Scaling Strategy

### Single Server (< 1000 concurrent users)
- Ubuntu VM with Python/Node.js
- SQLite database
- Local file storage

### Multi-Server (1000-10000 users)
- Load balancer (nginx, HAProxy)
- Multiple backend instances
- Shared database (PostgreSQL)
- Redis for caching
- S3/GCS for static assets

### Enterprise (10000+ users)
- Kubernetes cluster
- Multiple availability zones
- Database replication
- CDN for static content
- API gateway with rate limiting
- Message queue for async tasks

## Maintenance

### Weekly
- Monitor error logs
- Check API response times
- Review resource utilization

### Monthly
- Update dependencies
- Run security audit (`pip audit`)
- Backup database
- Review and optimize slow queries

### Quarterly
- Major version updates
- Security penetration testing
- Capacity planning

## Rollback Plan

1. Keep previous deployment tagged in git
2. Maintain database snapshots before updates
3. Use blue-green deployment for zero downtime
4. Document rollback procedures

## Incident Response

1. **Detection**: Monitor alerts from Sentry/New Relic
2. **Response**: Check backend logs and frontend errors
3. **Mitigation**: 
   - Restart affected services
   - Scale up capacity if needed
   - Route traffic to healthy servers
4. **Resolution**: Fix root cause
5. **Post-Mortem**: Document and prevent recurrence

## Backup Strategy

### Database
- Daily snapshots to cloud storage
- Monthly encrypted backups to separate region
- Test restore procedures monthly

### Code
- Weekly pushes to multiple git remotes
- Encrypted secret keys stored separately

### Static Assets
- Versioned in git
- Replicated to CDN regions
