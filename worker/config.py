"""Worker configuration, read exclusively from the environment.

The worker MUST run with a Supabase service-role key. It bypasses RLS and is
therefore never bundled with the frontend or exposed to the browser.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "")
    try:
        return int(raw) if raw.strip() else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str  # service role secret
    shared_secret: str  # reserved credential; see README (admin endpoint auth)
    poll_interval_seconds: int
    request_timeout_seconds: int
    request_spacing_seconds: float
    max_runs_per_system: int
    worker_version: str = "0.1"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            supabase_url=os.environ.get("SUPABASE_URL", "").strip(),
            supabase_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
            shared_secret=os.environ.get("WORKER_SHARED_SECRET", "").strip(),
            poll_interval_seconds=_int_env("POLL_INTERVAL_SECONDS", 5),
            request_timeout_seconds=_int_env("HTTP_TIMEOUT_SECONDS", 6),
            request_spacing_seconds=float(os.environ.get("HTTP_SPACING_SECONDS", "1") or 1),
            max_runs_per_system=_int_env("MAX_RUNS_PER_SYSTEM", 20),
        )

    @property
    def configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


settings = Settings.from_env()
