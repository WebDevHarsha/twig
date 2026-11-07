"""Supabase database access for the TWIG worker.

The worker is the ONLY component allowed to use the service-role key. It talks
directly to Supabase PostgREST via supabase-py: jobs are claimed atomically
through the `claim_job()` Postgres function (FOR UPDATE SKIP LOCKED), so two
workers can never process the same job.
"""

from __future__ import annotations

from typing import Any

from config import settings

_client = None  # lazy singleton


class SupabaseUnavailable(RuntimeError):
    """Raised when the worker is started without Supabase credentials."""


def get_client():
    """Return a shared service-role Supabase client."""
    global _client
    if _client is None:
        try:
            from supabase import create_client  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover - dependency problem
            raise SupabaseUnavailable(
                "supabase package is not installed (see worker/REQUIREMENTS.txt)."
            ) from exc
        if not settings.configured:
            raise SupabaseUnavailable(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
            )
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def claim_job() -> dict[str, Any] | None:
    """Atomically claim the next pending job, or return None when none exist.

    The SQL function updates exactly one row using FOR UPDATE SKIP LOCKED so
    concurrent workers cannot grab the same job.
    """
    res = get_client().rpc("claim_job").execute()
    rows = (getattr(res, "data", None) or []) if hasattr(res, "data") else (res or [])
    for row in rows:
        return row
    return None


def fetch_custom_request(custom_request_id: str) -> dict[str, Any] | None:
    res = (
        get_client()
        .table("custom_requests")
        .select(
            "id, buyer_id, original_prompt, specification_json, status"
        )
        .eq("id", custom_request_id)
        .maybeSingle()
        .execute()
    )
    data = getattr(res, "data", None)
    return data[0] if isinstance(data, list) and data else data


def update_job(custom_request_id: str, **fields: Any) -> None:
    """Update the job row bound to this custom request."""
    if fields.get("error_message"):
        fields["error_message"] = str(fields["error_message"])[:500]
    get_client().table("jobs").update(fields).eq("custom_request_id", custom_request_id).execute()


def set_stage(custom_request_id: str, stage: str, progress: int) -> None:
    """Persist a progress checkpoint so the dashboard can render live status."""
    update_job(
        custom_request_id,
        stage=stage,
        progress=max(5, min(100, int(progress))),
        error_message=None,
    )


def set_running(custom_request_id: str, stage: str, progress: int = 5) -> None:
    update_job(
        custom_request_id,
        status="running",
        stage=stage,
        progress=progress,
        error_message=None,
    )


def mark_completed(custom_request_id: str, result_storage_path: str) -> None:
    from datetime import datetime, timezone

    update_job(
        custom_request_id,
        status="completed",
        stage="done",
        progress=100,
        result_storage_path=result_storage_path,
        error_message=None,
        completed_at=datetime.now(timezone.utc).isoformat(),
    )


def mark_failed(custom_request_id: str, message: str) -> None:
    from datetime import datetime, timezone

    update_job(
        custom_request_id,
        status="failed",
        stage="failed",
        error_message=message,
        completed_at=datetime.now(timezone.utc).isoformat(),
    )
