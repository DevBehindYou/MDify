"""Metadata endpoints: available processing profiles and supported formats."""

from __future__ import annotations

from fastapi import APIRouter

from app.formats import SUPPORTED
from app.pipeline.profiles import PROFILES
from app.schemas.conversion import FormatInfo, ProfileInfo

router = APIRouter()


@router.get("/profiles", response_model=list[ProfileInfo])
async def list_profiles() -> list[ProfileInfo]:
    return [
        ProfileInfo(id=p.id, label=p.label, description=p.description)
        for p in PROFILES.values()
    ]


@router.get("/formats", response_model=list[FormatInfo])
async def list_formats() -> list[FormatInfo]:
    return [
        FormatInfo(ext=ext, label=label, category=cat.value)
        for ext, (label, cat) in SUPPORTED.items()
    ]
