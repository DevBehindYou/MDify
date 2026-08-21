"""MDify Pro backend — application factory and wiring.

Composition root: builds the FastAPI app, installs CORS, rate limiting, the
typed-error exception handlers, and mounts the versioned API (plus root-level
legacy aliases so `/health` and `/convert` keep working during migration).
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api.v1 import convert as convert_routes
from app.api.v1 import health as health_routes
from app.api.v1 import router as api_v1_router
from app.config import settings
from app.core.errors import AppError, ErrorCode
from app.core.logging import configure_logging, get_logger
from app.core.ratelimit import limiter

configure_logging()
logger = get_logger("mdify")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description="Document → clean Markdown conversion API for MDify Pro.",
    )

    # ── Rate limiting ────────────────────────────────────────────────────────
    app.state.limiter = limiter

    # ── CORS ─────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Typed error handlers (consistent { "error": { code, message } }) ─────
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_body())

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit(_: Request, _exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": ErrorCode.RATE_LIMITED.value,
                    "message": "Too many requests. Please wait a moment and retry.",
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, _exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": ErrorCode.INVALID_FILE.value,
                    "message": "The request was malformed or missing the file field.",
                }
            },
        )

    @app.exception_handler(Exception)
    async def handle_unknown(_: Request, exc: Exception) -> JSONResponse:
        # Never leak internals; log the type only, not contents.
        logger.error("unhandled error: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": ErrorCode.UNKNOWN_ERROR.value,
                    "message": "An unexpected error occurred. Please try again.",
                }
            },
        )

    # ── Routes ───────────────────────────────────────────────────────────────
    app.include_router(api_v1_router)
    # Legacy root aliases (kept thin; same handlers) so nothing 404s.
    app.include_router(health_routes.router)
    app.include_router(convert_routes.router)

    return app


app = create_app()
