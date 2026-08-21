"""API v1 router aggregation."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import convert, health, meta

router = APIRouter(prefix="/api/v1")
router.include_router(health.router, tags=["health"])
router.include_router(convert.router, tags=["conversion"])
router.include_router(meta.router, tags=["meta"])
