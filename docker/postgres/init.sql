-- SAGARDRISHTI PostGIS bootstrap (runs once on first `db` init).
-- Enables spatial types for Phase 2+ ingestion tables.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
