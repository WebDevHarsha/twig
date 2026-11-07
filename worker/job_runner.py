"""Job execution pipeline: claim → collect → clean → normalize → validate →
upload → mark completed (or failed with an explicit error).

Security/data-integrity invariants enforced here:
 - only spec kinds the worker truly supports are executed (`api_benchmark`
   and the uptime panel); anything else is failed, not guessed.
 - URLs never come from job specs — only the worker allow-list is used.
 - results always carry the SIMULATED / test-conditions labeling.
"""

from __future__ import annotations

from typing import Any

from collectors.api_benchmarks import collect_api_benchmark
from collectors.uptime import collect_uptime
from config import settings
from processors.cleaning import clean_rows
from processors.normalization import normalize_rows
from processors.validation import validate_result
from services import storage, supabase


def _unwrap_spec(payload: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    """Return (kind, spec) from a stored specification_json."""
    if not isinstance(payload, dict) or not payload:
        return "", {}
    body = payload
    nested = payload.get("b2b")
    if isinstance(nested, dict):
        body = nested
    kind = str(body.get("kind") or body.get("type") or "")
    return kind, body


def _dataset_base_name(spec: dict[str, Any]) -> str:
    name = str(spec.get("dataset_name") or "custom_dataset")
    slug = "".join(c if c.isalnum() else "_" for c in name.strip().lower()).strip("_")
    return slug[:60] or "custom_dataset"


def process_job(job: dict[str, Any]) -> None:
    """Drive one claimed job to completion or explicit failure."""
    custom_request_id = str(job.get("custom_request_id") or "")
    if not custom_request_id:
        return

    try:
        supabase.set_running(custom_request_id, "preparing")

        cr = supabase.fetch_custom_request(custom_request_id)
        spec_payload = (cr or {}).get("specification_json")
        kind, spec = _unwrap_spec(spec_payload)

        if kind not in {"api_benchmark", "api_uptime", "uptime_panel"}:
            raise UnsupportedSpec(kind or "(empty)")

        # ---- 1. collect -----------------------------------------------------
        supabase.set_stage(custom_request_id, "collecting", 10)
        if kind == "api_benchmark":
            rows = collect_api_benchmark(
                spec,
                lambda stage, p: supabase.set_stage(custom_request_id, stage, p),
            )
        else:
            rows = collect_uptime(
                spec,
                lambda stage, p: supabase.set_stage(custom_request_id, stage, p),
            )

        # ---- 2. clean -------------------------------------------------------
        supabase.set_stage(custom_request_id, "cleaning", 70)
        rows, counts = clean_rows(rows)

        # ---- 3. normalize ---------------------------------------------------
        supabase.set_stage(custom_request_id, "normalizing", 75)
        rows = normalize_rows(rows)

        # ---- 4. validate ----------------------------------------------------
        supabase.set_stage(custom_request_id, "validating", 80)
        problem = validate_result(rows, spec)
        if problem:
            raise DataQuality(problem)

        # ---- 5. upload ------------------------------------------------------
        supabase.set_stage(custom_request_id, "uploading", 90)
        meta = {
            "kind": "api_benchmark",
            "synthetic": False,
            "data_notice": (
                "Collected by the TWIG worker against its configured, allow-listed "
                "public test endpoints. Measurements reflect test conditions only — "
                "not universal provider performance."
            ),
            "spec_version": 1,
            "spec": spec,
            "collection_settings": {
                "timeout_seconds": settings.request_timeout_seconds,
                "spacing_seconds": settings.request_spacing_seconds,
                "max_runs_per_system": settings.max_runs_per_system,
                "worker_version": settings.worker_version,
            },
            "cleaning": counts,
            "collected_at": (rows[0].get("timestamp") if rows and "timestamp" in rows[0] else None),
        }
        result_path = storage.upload_job_result(
            custom_request_id, _dataset_base_name(spec), rows, meta
        )

        # ---- 6. complete ----------------------------------------------------
        supabase.mark_completed(custom_request_id, result_path)
        print(f"[job] completed {custom_request_id} → {result_path} ({len(rows)} rows)", flush=True)
    except UnsupportedSpec as exc:
        message = f"Unsupported spec kind {exc.message}; this worker only runs allow-listed benchmark/uptime panels."
        supabase.mark_failed(custom_request_id, message)
        print(f"[job] failed {custom_request_id}: {message}", flush=True)
    except DataQuality as exc:
        supabase.mark_failed(custom_request_id, f"Validation rejected the dataset: {exc.message}")
        print(f"[job] failed {custom_request_id}: {exc.message}", flush=True)
    except Exception as exc:  # noqa: BLE001 - job boundaries must not crash the loop
        supabase.mark_failed(custom_request_id, str(exc))
        print(f"[job] failed {custom_request_id}: {exc}", flush=True)


class UnsupportedSpec(Exception):
    def __init__(self, kind: str) -> None:
        self.message = kind
        super().__init__(f"unsupported spec kind: {kind}")


class DataQuality(Exception):
    def __init__(self, problem: str) -> None:
        self.message = problem
        super().__init__(problem)
