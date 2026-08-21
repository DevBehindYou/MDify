"""Shared rate limiter (per client IP) built on slowapi.

Cheap insurance for an unauthenticated upload endpoint: a burst of large
files from one source can't monopolize the free-tier worker. The limit is
config-driven so it can be tuned per environment.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
