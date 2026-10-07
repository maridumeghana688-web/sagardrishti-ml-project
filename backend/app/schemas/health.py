"""Health response schemas."""
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


class DbHealthResponse(BaseModel):
    database: str
    detail: str
