"""Centralized configuration for the MDify Pro backend.

All tunables live here and are overridable via environment variables so the
same image behaves correctly in local, preview, and production environments.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app import __version__


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Identity ────────────────────────────────────────────────────────────
    app_name: str = "MDify Pro API"
    version: str = __version__
    api_v1_prefix: str = "/api/v1"

    # ── Upload limits ───────────────────────────────────────────────────────
    # 25 MB per file — matches the free-tier memory envelope on Render.
    max_file_size: int = 25 * 1024 * 1024

    # ── Concurrency ─────────────────────────────────────────────────────────
    # Conversion is CPU/memory heavy. Bound concurrent conversions per process
    # so async requests do not turn into an unbounded worker/memory spike.
    max_concurrent_conversions: int = Field(default=2, ge=1, le=8)

    # ── Rate limiting (per client IP) ───────────────────────────────────────
    rate_limit_convert: str = "30/minute"

    # ── CORS ────────────────────────────────────────────────────────────────
    # Comma-separated extra origins injected in production (the deployed
    # Vercel frontend URL). Localhost dev origins are always allowed.
    frontend_url: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        extras = [u.strip() for u in self.frontend_url.split(",") if u.strip()]
        return [
            "http://localhost:3000",
            "http://localhost:3001",
            *extras,
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
"