# Backend service — production-ready slim image with geospatial system libs.
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System deps for GeoPandas/Shapely/PostGIS client builds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gdal-bin libgdal-dev \
    libgeos-dev libproj-dev libspatialindex-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app ./app

EXPOSE 8000

# Single worker by default; override CMD/replicas for production scaling.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
