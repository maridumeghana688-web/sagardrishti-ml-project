# SAGARDRISHTI — Architecture (Phase 1: Foundation)

## Goal
Ocean-intelligence platform scaffold: API + spatial database + web shell,
structured so dataset ingestion, warehouse modelling, ML and production
deployment can be added without restructuring.

## Layout
```
SAGARDRISHTI/
├── backend/        FastAPI app (app/main.py, app/core/config.py,
│                   app/api/v1/*, app/db/*, app/models/*, tests/)
├── frontend/       React + Vite + Tailwind (src/pages, src/layouts,
│                   src/components, src/api)
├── data/           raw/ processed/ features/  (Phase 2 contract)
├── warehouse/      PostGIS DDL + migrations (Phase 3)
├── ml/             training + registry (Phase 4)
├── notebooks/      exploratory analysis (Phase 2+)
├── scripts/        ops / ingestion entrypoints (Phase 2+)
├── models/         artifacts (git-ignored, Phase 4)
├── docker/         postgres/init.sql (PostGIS bootstrap)
├── docker-compose.yml   db + backend + frontend
└── .env.example    all required secrets/URLs (placeholders only)
```

## Data flow (target state, not yet implemented)
```
sources (Phase 2: 8 datasets) → scripts/ingest_* → data/raw
  → validated loads → PostgreSQL/PostGIS (warehouse marts)
  → data/processed + features → ml/ training → models/
  → backend serves results → frontend dashboards
```
Phase 1 wires only: `frontend → backend /health` and `backend → db` session.

## Key decisions
- **Env-first config**: `backend/app/core/config.py` (pydantic-settings);
  compose reads the same `.env`. No passwords/keys in code or images.
- **PostGIS from day one**: `postgis/postgis:15-3.4` + `init.sql` enabling
  `postgis`/`postgis_topology`; GeoAlchemy2 + GeoPandas pre-declared.
- **Versioned API**: everything under `/api/v1`; Phase 2 adds routers to
  `app/api/v1/router.py` without breaking `/health`.
- **Thin frontend**: layout + routing shell only; `VITE_API_BASE_URL`
  points at the API; `/status` page proves connectivity.

## Explicitly out of scope (future phases)
- ❌ Dataset downloads / ingestion pipelines → Phase 2
- ❌ Warehouse schema, marts, migrations → Phase 3
- ❌ ML models, metrics, analytical results → Phase 4
- ❌ Production hardening (auth, CI/CD, observability, TLS) → later
