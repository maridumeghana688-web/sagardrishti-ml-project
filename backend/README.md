# Backend — SAGARDRISHTI API (FastAPI)

Phase 1: app shell + `/health` endpoints + PostGIS-ready DB session.
No dataset or ML logic lives here yet.

## Layout
```
backend/
├── app/
│   ├── main.py            FastAPI entrypoint (CORS, v1 router, root)
│   ├── core/config.py     env-first settings (pydantic-settings)
│   ├── api/v1/            versioned routers (health.py, router.py)
│   ├── db/                engine/session/Base + get_db + check_database
│   ├── models/            ORM models (Phase 2+)
│   └── schemas/           Pydantic schemas
├── tests/                 pytest smoke tests
├── requirements.txt
└── Dockerfile
```

## Run locally
```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000/docs, /api/v1/health
```

## Test
```powershell
cd backend
pytest -v
```
