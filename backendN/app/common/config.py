"""Environment-driven settings for one backend instance."""

from __future__ import annotations

import os
from dataclasses import dataclass

VALID_ROLES = ("normal", "ocr", "archive")

# Upload byte limits per role; MAX_UPLOAD_BYTES overrides. Keep in sync with
# MAX_FILE_SIZE / MAX_IMAGE_FILE_SIZE in frontend/lib/formats.js.
DEFAULT_MAX_UPLOAD_BYTES = {
    "normal": 15 * 1024 * 1024,
    "ocr": 10 * 1024 * 1024,
    "archive": 15 * 1024 * 1024,
}


@dataclass(frozen=True)
class Settings:
    role: str
    instance: str
    shared_secret: str
    max_upload_bytes: int
    version: str


def load_local_env(path) -> None:
    """Local development: reads KEY=value lines from the backend's .env.

    Variables already set in the process win. Deployments have no .env (it is
    ignored by git and by .vercelignore), so this does nothing there.
    """
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


def load_settings(role: str) -> Settings:
    """Loads settings for a backend whose code implements `role`.

    BACKEND_ROLE may be set for clarity, but it must match the code that is
    deployed — an OCR image started as "normal" is a deployment error, so it
    fails at startup instead of serving the wrong workload.
    """
    if role not in VALID_ROLES:
        raise ValueError(f"Unknown backend role: {role!r}")
    declared = os.environ.get("BACKEND_ROLE", role).strip().lower()
    if declared != role:
        raise RuntimeError(f"BACKEND_ROLE={declared!r} but this service implements {role!r}")

    default_instance = {"normal": "N?", "ocr": "O?", "archive": "Z?"}[role]
    return Settings(
        role=role,
        instance=os.environ.get("BACKEND_INSTANCE", default_instance).strip() or default_instance,
        shared_secret=os.environ.get("INTERNAL_SHARED_SECRET", ""),
        max_upload_bytes=_int_env("MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES[role]),
        version=os.environ.get("APP_VERSION", "dev"),
    )
