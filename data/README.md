# Data layers (Phase 2+)
- `raw/` — untouched source extracts. **Never commit real datasets** (git-ignored except `.gitkeep`).
- `processed/` — cleaned, validated tables (parquet / PostGIS loads).
- `features/` — model-ready feature tables.

Phase 1 ships only the directory contract + `.gitkeep` placeholders so
ingestion pipelines can be added without restructuring.
