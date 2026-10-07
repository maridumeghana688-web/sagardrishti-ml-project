# SAGARDRISHTI 🌊

Ocean-intelligence platform — **Phase 1: Foundation**.

A clean, production-ready monorepo scaffold: FastAPI backend, PostGIS database,
and React + Vite + Tailwind frontend. No datasets, no ML models, no fake
analytics — just the modular shells later phases build on.

## Repository layout

```
SAGARDRISHTI/
├── backend/        FastAPI app + tests + Dockerfile
├── frontend/       React + Vite + Tailwind starter dashboard + Dockerfile
├── data/           raw/ processed/ features/   (Phase 2 contract, empty)
├── warehouse/      PostGIS DDL + migrations     (Phase 3)
├── ml/             training + registry          (Phase 4)
├── notebooks/      exploratory analysis         (Phase 2+)
├── scripts/        ops / ingestion entrypoints  (Phase 2+)
├── models/         artifacts, git-ignored       (Phase 4)
├── docker/         postgres/init.sql (PostGIS bootstrap)
├── docs/           architecture.md + runbooks
├── docker-compose.yml
├── .env.example
└── requirements.txt
```

See [`docs/architecture.md`](docs/architecture.md) for the system overview.

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.11+ | `python --version` |
| Node.js | 20+ | `node --version` |
| Docker + Compose | v2+ | `docker compose version` |
| (optional) `psql` | 15+ | `psql --version` |

## Quick start (Docker — recommended)

```powershell
# 1. Configure environment (never commit .env)
Copy-Item .env.example .env
# Edit POSTGRES_PASSWORD at minimum.

# 2. Build + start db, API and web UI
docker compose up --build

# 3. Verify
#   API root   → http://localhost:8000/
#   API health → http://localhost:8000/api/v1/health
#   API docs   → http://localhost:8000/docs
#   Web UI     → http://localhost:3000/
```

Stop: `docker compose down` · wipe DB volume: `docker compose down -v`.

## Local development (without Docker)

**Database** (still via Docker):
```powershell
docker compose up db
```

**Backend** (new terminal):
```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Point at the dockerised DB on localhost:
# $env:DATABASE_URL="postgresql+psycopg2://sagardrishti:<password>@localhost:5432/sagardrishti"
uvicorn app.main:app --reload --port 8000
# run from the backend/ directory
```

**Frontend** (new terminal):
```powershell
cd frontend
npm install
npm run dev   # → http://localhost:5173
```

**Tests / builds:**
```powershell
cd backend; pytest                      # backend smoke tests
cd ../frontend; npm run build           # production bundle check
docker compose config                   # validate compose file
```

## Configuration

All secrets and environment-specific values come from the environment.
`.env.example` lists every variable with safe placeholders:

- `POSTGRES_*` / `DATABASE_URL` — database connection
- `CORS_ORIGINS` — allowed browser origins
- `VITE_API_BASE_URL` — API URL baked into the frontend
- `BACKEND_PORT` / `FRONTEND_PORT` / `POSTGRES_PORT` — published ports

## API (Phase 1)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Service info + links |
| GET | `/api/v1/health` | Liveness probe (no DB required) |
| GET | `/api/v1/health/db` | Database connectivity probe |
| GET | `/docs` | Interactive OpenAPI docs |

## Frontend routes

| Path | Purpose |
|------|---------|
| `/` | Cinematic landing — vessel-journey story (default route) |
| `/login` | Command-center entry placeholder (auth arrives later) |
| `/dashboard` | Phase-1 starter dashboard shell |
| `/status` | API connectivity probe |

### Landing page

One continuous voyage (`frontend/src/voyage/LandingPage.jsx`): a single
sticky stage (`#voyage`, 1400vh) plays the whole film. Real photography
(`public/assets/maritime/` — sources in `docs/ASSET_SOURCES.md`) with
ONE vessel cutout that never gets replaced, masked environment wipes,
a canvas data engine (`VoyageCanvas.jsx`), and growing editorial type
— all on one GSAP ScrollTrigger master timeline with Lenis. No
slideshow, no card walls, decision-support language only.

Verify it headlessly (requires Chrome):

```powershell
cd frontend
npm run build
npm run preview -- --port 4173   # then, in another terminal:
node scripts/smoke.mjs http://localhost:4173
```

The smoke script screenshots every story beat (desktop + mobile),
checks all routes and reports console/WebGL errors.

## Roadmap — what is NOT in Phase 1

- 🔜 **Phase 2 — Dataset ingestion**: the 8 selected datasets + `scripts/`
  pipelines writing to `data/raw/` → `data/processed/`. *Nothing downloaded yet.*
- 🔜 **Phase 3 — Data warehouse**: PostGIS schema, marts and Alembic
  migrations under `warehouse/`.
- 🔜 **Phase 4 — ML & analytics**: training code in `ml/`, artifacts in
  `models/`, dashboards in `frontend/`. *No models or results are faked.*
- 🔜 **Production deployment**: auth, CI/CD, observability, TLS, scaling.
