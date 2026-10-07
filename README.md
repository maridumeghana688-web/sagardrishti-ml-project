# SAGARDRISHTI

**AI-Driven Maritime Intelligence and Next-Day Port Traffic & Congestion Prediction**

## 1. Project Overview

SAGARDRISHTI is a maritime intelligence platform for Indian ports that combines **machine learning**, historical maritime datasets, **next-day traffic prediction**, **next-day congestion prediction**, **live AIS**, port intelligence, and interactive maritime visualization.

ML prediction is the primary analytical component: two supervised models estimate, for each monitored port, tomorrow's vessel-traffic index and congestion index from leakage-safe temporal, environmental, and vessel-activity features. A three-source live-AIS pipeline (Open Waters, AISStream, VesselAPI) with multi-source aggregation feeds the same dashboard, so observed activity and model forecasts are always shown side by side — never mixed.

## 2. Problem Statement

Indian maritime traffic spans 44 major monitored ports across three coasts, driven by tides, seasons, ocean physics, fishing activity, and commercial schedules. Observation-only systems (port logs, single AIS feeds) describe what already happened; they cannot anticipate tomorrow's load. Port operators need **predictive** intelligence: which ports will be busy, which will congest, and where live traffic currently stands — with honest uncertainty instead of fabricated precision. SAGARDRISHTI estimates next-day traffic and congestion per port and pairs every forecast with live AIS context.

## 3. Key Features

### Machine Learning

- Next-day traffic prediction (`traffic_target_next_day`, Random Forest)
- Next-day congestion prediction (`congestion_target_next_day`, LightGBM)
- Temporal, lag, and rolling historical features
- Environmental features (CMEMS physics, NOAA SST history)
- Vessel/activity features (GFW-derived)
- Leakage-safe prediction pipeline (`X(t) → Y(t+1)`, past-only features)
- Model evaluation with single-use test period plus 2026 backtesting
- Estimated prediction intervals (±1.28σ validation residuals)

### Maritime Intelligence

- 44 monitored Indian ports (WPI metadata)
- Port intelligence panels (live situation, activity, forecasts, data quality)
- Model-output risk indicators (tertile bands)
- GFW vessel-activity history
- Live AIS with freshness states

### AIS

- Open Waters, AISStream, VesselAPI as independent first-class sources
- Multi-source aggregation, MMSI deduplication, freshest-position-wins
- Source provenance preserved end to end (`sources`, `source_last_seen`)
- Vessel freshness (LIVE / RECENT / STALE), heading/COG/SOG from real messages

### Visualization

- MapLibre GL JS with an OpenStreetMap-based OpenFreeMap basemap (no key)
- Live vessel visualization (heading-oriented silhouettes, interpolation between real fixes, wake, fading trails)
- Port risk styling, vessel→port associations, activity density, traffic flow

## 4. Machine Learning Pipeline

```text
Raw Data (GFW, WPI, CMEMS, NOAA)
  → Data Cleaning
  → Data Integration
  → Temporal Alignment
  → Feature Engineering (temporal, lag, rolling, environmental, vessel/activity)
  → Leakage Validation (past-only features, temporal splits)
  → ML Master Dataset (data/ml/daily/sagardrishti_daily_master_training_final.parquet)
  → Traffic Model (daily_traffic_model_v1) + Congestion Model (daily_congestion_model_v1)
  → Prediction API (data/predictions/daily_predictions.parquet)
  → Dashboard (forecast cards with intervals and provenance)
```

## 5. Dataset

Verified production dataset `data/ml/daily/sagardrishti_daily_master_training_final.parquet`:

- **91,036** port-day records (91,000+)
- **44** ports
- **2021-01-01 → 2026-08-31**
- **118** production-oriented columns

Feature categories: temporal, environmental (CMEMS/NOAA-derived), vessel/activity (GFW-derived), lag, rolling, and port/static attributes.

Large raw downloads (Kaggle snapshots, derived blobs, redundant CSV exports — gigabytes) are intentionally excluded from the repository for size and reproducibility reasons; the curated training/final parquets and prediction outputs that the application actually serves are included. See [Data and Model Reproducibility](#14-data-and-model-reproducibility).

## 6. Machine Learning Models

### Traffic Prediction

- Model: **Random Forest Regressor**
- Registry: `daily_traffic_model_v1` (`models/daily_model_registry.json`)
- Target: `traffic_target_next_day`
- Historical test performance (single-use 2025 test period — evaluation, not a guarantee): **MAE ≈ 80.5, R² ≈ 0.952**

### Congestion Prediction

- Model: **LightGBM**
- Registry: `daily_congestion_model_v1`
- Target: `congestion_target_next_day`
- Historical test performance (single-use 2025 test period — evaluation, not a guarantee): **MAE ≈ 0.121, R² ≈ 0.964**

## 7. Temporal Leakage Prevention

The pipeline enforces `X(t) → Y(t+1)`:

- No future target values in features
- No future vessel activity in features
- Past-only rolling windows
- Prediction-time-safe feature construction
- Temporal validation splits plus a single-use test period
- Leakage audit artifact (`data/ml/daily/daily_leakage_audit.json`)

## 8. 2026 Backtesting

An additional held-out evaluation on 2026-01 → 2026-08 (`reports/final_daily_system_report.html`):

- Traffic MAE ≈ **106**, congestion MAE ≈ **0.131**
- Estimated prediction intervals with ≈ **71%** measured traffic coverage
- Backtesting is an additional evaluation, not a guarantee of future accuracy.

## 9. System Architecture

```text
Open Waters ──┐
AISStream ────┼──> AIS Aggregator ──> FastAPI ──> React
VesselAPI ────┘

ML Dataset → ML Models → Prediction Service → FastAPI → React Dashboard

Map: React → MapLibre GL JS → OpenStreetMap-based OpenFreeMap
```

## 10. Technology Stack

Frontend: React, Vite, MapLibre GL JS, JavaScript, CSS.
Backend: Python, FastAPI, Uvicorn.
ML: Python, Pandas, NumPy, Scikit-learn, Random Forest, LightGBM.
Data: Parquet, GFW, WPI, CMEMS, NOAA.
AIS: Open Waters, AISStream, VesselAPI.
Testing: Pytest, frontend production build.

## 11. Project Structure

```text
SAGARDRISHTI/
├── backend/        FastAPI app (api/v1, core, db, models, schemas, services) + tests + Dockerfile
├── frontend/       React + Vite dashboard (MapLibre map, views, state) + Dockerfile
├── data/           reference/ (WPI ports), ml/daily/ (master + feature set + audits),
│                   predictions/ (daily_predictions.parquet); raw downloads excluded
├── models/         daily_model_registry.json, model_registry.json (binaries stay local, git-ignored)
├── src/            daily_pipeline/ (run_daily entrypoint), ml/ (inference)
├── scripts/        sagar_pipeline/ (acquisition/stages), smoke/verify harnesses
├── tests/          pipeline/ML readiness tests
├── warehouse/      PostGIS DDL + migrations
├── ml/ notebooks/ docs/ docker/ asset-sources/ metadata/ reports/
├── docker-compose.yml  start-dev.bat  requirements.txt
├── .env.example  .gitignore  README.md
```

## 12. Setup Instructions

```powershell
# 1. Clone the repository
git clone <your-fork-url> SAGARDRISHTI
cd SAGARDRISHTI

# 2. Backend environment + dependencies
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt      # pulls backend/requirements.txt

# 3. Frontend dependencies
cd frontend
npm install
cd ..

# 4. Configure environment (never commit .env)
Copy-Item .env.example .env
# Fill in: SECRET_KEY, POSTGRES_PASSWORD, and (optionally) the AIS keys below.
# AIS keys are backend-only; Open Waters also works anonymously without one.

# 5. Run backend (from repo root)
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir backend
# or: .\start-dev.bat   (starts backend :8000 and frontend :5173 on Windows)

# 6. Run frontend (separate shell)
cd frontend
npm run dev    # http://localhost:5173  (expects API at http://localhost:8000)
```

Database-backed auth needs PostgreSQL/PostGIS (`docker compose up db` or set `DATABASE_URL`); ports, predictions, environment, and live AIS work from the bundled data files plus AIS provider keys.

## 13. Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `AISSTREAM_API_KEY` | AISStream access (server-side only) | Optional (AISStream stays disconnected without it) |
| `OPENWATERS_API_KEY` | Open Waters personal token (server-side only) | Optional (anonymous access otherwise) |
| `VESSELAPI_API_KEY` | VesselAPI access (server-side only) | Optional (VesselAPI stays unconfigured without it) |

Full template with application, database, auth, tuning, and frontend (`VITE_API_BASE_URL`) settings: `.env.example`. Never put real credentials in `.env.example` or `README.md`.

## 14. Data and Model Reproducibility

- Large raw datasets (`data/kaggle_output*/`, `data/derived/`, redundant CSV exports) live only on the operator machine and are git-ignored.
- Curated runtime artifacts ARE in the repo: `data/reference/india_ports.parquet`, `data/ml/daily/*`, `data/predictions/daily_predictions.parquet`.
- Daily acquisition/fetch: `python -m src.daily_pipeline.run_daily [--date YYYY-MM-DD]` (idempotent; see `G_DAILY_FETCHING` in `reports/final_daily_system_report.html`).
- Pipeline stages: `scripts/sagar_pipeline/` (catalogue → acquisition → stages → validation); exploration: `notebooks/`.
- Model binaries (`*.joblib`, including a ~1 GB traffic model) are trained locally and stay git-ignored; the registry manifests (`models/*_registry.json`) record versions, targets, and metrics. The API serves the versioned `daily_predictions.parquet`, so the dashboard works without the binaries.

## 15. API Overview

Base prefix `/api/v1` (all verified in `backend/app/api/v1/`):

- `GET /health`, `GET /health/db` — liveness and database probes
- `GET /ports`, `GET /ports/{port_id}` — 44 WPI ports
- `GET /vessels`, `GET /vessels/{mmsi}`, `GET /ports/{port_id}/vessels` — aggregated live AIS
- `GET /live/ais/stream` — SSE snapshot stream
- `GET /events` — backend event feed
- `GET /predictions?date=`, `GET /predictions/{port_id}`, `GET /predictions/daily` — next-day forecasts
- `GET /environment/{port_id}`, `GET /vessel-activity/{port_id}`, `GET /analytics/{port_id}` — history and context
- `GET /explainability/global` — global feature importance
- `GET /analytics/overview`, `GET /system/status`, `GET /sources/status` — rollups and source health
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` — JWT auth

## 16. Testing

- Backend: **114/114 pytest tests passed** (`py -m pytest backend/tests`), covering normalization, three-source aggregation/dedup/provenance, freshness, provider isolation, auth/rate-limit/error paths, API/SSE contracts, MapLibre migration invariants, and secret-leakage assertions.
- Frontend: production build passes (`npm run build`, Vite).

## 17. Security

- AIS provider keys live only in server environment/`.env`; the browser never sees them (no `VITE_*` provider keys; production-bundle scanned).
- `.env` is git-ignored; `.env.example` holds placeholders only.
- No credentials, tokens, private keys, or secret values in code, history, README, or tracked data (audited across all Git blobs).
- Multi-GB raw datasets are excluded from version control.

## 18. Limitations

- Live AIS coverage depends on provider coverage and receiving-station geometry; sparse regions honestly report no-data states.
- Environmental datasets have different temporal resolutions (GFW daily, CMEMS monthly, NOAA SST historical ending 2023-12-31).
- Predictions are estimates with intervals, not guarantees; model performance varies over time.
- Large raw datasets and model binaries are not stored in GitHub; a fresh clone reproduces inference via the bundled prediction artifacts and documented pipelines.
- VesselAPI polling is quota-limited (round-robin regional boxes, quota-floor hold).

## 19. Future Scope

- Improved temporal forecasting (sequence models per port)
- Explainable AI (per-prediction attributions)
- Advanced time-series models and uncertainty calibration
- More environmental features and additional maritime data sources
- Improved port-specific modelling

## 20. Team Members

- Member 1 — Data Engineering, Preprocessing & Feature Engineering
- Member 2 — Next-Day Traffic Prediction
- Member 3 — Next-Day Congestion Prediction & Model Evaluation
- Member 4 — ML Deployment, AIS Integration & Maritime Dashboard

## 21. Academic Context

Developed as an academic Data Warehousing and Data Mining / Machine Learning project. Not a commercial production deployment.

## 22. License

License: Not yet specified.
