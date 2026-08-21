"""Health and readiness endpoints.

``/health`` reports engine availability (used by the frontend to detect a
cold start and drive the wake-up UX). ``/ready`` is an ultra-light liveness
ping that does no import work, ideal for uptime keep-alive pings.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.converters.markitdown_adapter import MARKITDOWN_AVAILABLE
from app.schemas.conversion import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        markitdown=MARKITDOWN_AVAILABLE,
        version=settings.version,
    )


@router.get("/ready")
async def ready() -> dict[str, bool]:
    return {"ready": True}
