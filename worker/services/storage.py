"""Private Storage delivery for the TWIG worker.

Results are uploaded to the private `datasets` bucket under a folder prefixed
with the custom request UUID. Storage RLS policies match this prefix against
the buyer's job, so only the entitled buyer can obtain download links.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from services.supabase import get_client

BUCKET = "datasets"
KNOWN_FIELDS = [
    "run_id",
    "window_start",
    "timestamp",
    "provider_label",
    "region_label",
    "checks",
    "succeeded",
    "failed",
    "uptime_pct",
    "http_status",
    "status_class",
    "latency_ms",
    "success",
    "test_conditions",
]


class StorageFailed(RuntimeError):
    pass


def _bytes_payload(rows: list[dict[str, Any]], columns: list[str]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in columns})
    return buffer.getvalue().encode("utf-8")


def upload_job_result(
    custom_request_id: str,
    base_name: str,
    rows: list[dict[str, Any]],
    meta: dict[str, Any],
) -> str:
    """Upload `<custom_request_id>/<base>.csv` and `<base>.json`.

    Returns the canonical result_storage_path that is stored on jobs.
    """
    if not custom_request_id or "/" in custom_request_id:
        raise StorageFailed("Invalid custom request id for storage path.")

    csv_path = f"{custom_request_id}/{base_name}.csv"
    json_path = f"{custom_request_id}/{base_name}.json"

    columns = sorted({k for row in rows for k in row}, key=lambda k: KNOWN_FIELDS.index(k) if k in KNOWN_FIELDS else 999)
    csv_bytes = _bytes_payload(rows, columns)
    json_bytes = (
        json.dumps(
            {
                "format_version": 1,
                "meta": meta,
                "columns": columns,
                "rows": rows,
            },
            ensure_ascii=False,
            indent=1,
        ).encode("utf-8")
    )

    bucket = get_client().storage.from_(BUCKET)
    try:
        bucket.upload(
            csv_path,
            csv_bytes,
            {"content-type": "text/csv; charset=utf-8", "upsert": "true"},
        )
        bucket.upload(
            json_path,
            json_bytes,
            {"content-type": "application/json; charset=utf-8", "upsert": "true"},
        )
    except Exception as exc:  # supabase-py raises StorageException variants
        raise StorageFailed(f"Storage upload failed for {csv_path}: {exc}") from exc

    return csv_path
