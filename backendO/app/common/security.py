"""Authentication for internal endpoints (called only by the dispatcher)."""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, Request


def require_internal_secret(
    request: Request,
    x_internal_secret: str | None = Header(default=None),
) -> None:
    """FastAPI dependency: constant-time check of the X-Internal-Secret header.

    Fails closed — an instance without INTERNAL_SHARED_SECRET configured
    rejects every internal call rather than becoming public compute.
    """
    expected = request.app.state.settings.shared_secret
    if not expected:
        raise HTTPException(status_code=503, detail="Internal secret is not configured")
    if not x_internal_secret or not hmac.compare_digest(
        x_internal_secret.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
