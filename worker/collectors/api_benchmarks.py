"""API benchmark collector.

Runs timed HTTP GET requests against allow-listed public test endpoints and
records honest observations: HTTP status, end-to-end latency, and a
float-free `success` flag. It never fabricates values: when a request fails,
the row records the failure (status 0 / success false) instead of inventing
a latency number.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from collectors.endpoints import region_label, resolve_systems
from config import settings

ProgressFn = Callable[[str, int], None]


def _fetch_once(url: str, timeout: int) -> tuple[int, float]:
    """Return (http_status, latency_ms) for one request; 0 status on failure."""
    started = time.perf_counter()
    request = Request(url, headers={"User-Agent": "twig-worker/0.1 (+benchmark probe)"}, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            response.read(1024)  # drain a small body so latency is representative
            return int(response.status), (time.perf_counter() - started) * 1000.0
    except HTTPError as exc:
        return int(exc.code), (time.perf_counter() - started) * 1000.0
    except (URLError, TimeoutError, OSError):
        return 0, (time.perf_counter() - started) * 1000.0


def collect_api_benchmark(spec: dict, progress: ProgressFn) -> list[dict[str, Any]]:
    """Run the benchmark panel described by a `api_benchmark` spec.

    Rows follow the published schema (see supabase/seed.sql):
    run_id, timestamp, provider_label, region_label, http_status,
    latency_ms, success, test_conditions.
    """
    runs_per_system = int((spec.get("time_scope") or {}).get("runs_per_system") or 8)
    runs_per_system = max(1, min(runs_per_system, settings.max_runs_per_system))
    timeout = settings.request_timeout_seconds
    spacing = max(0.0, settings.request_spacing_seconds)
    test_conditions = (
        f"worker v{settings.worker_version}; timeout {timeout}s; spacing {spacing:.1f}s; "
        "allow-listed public test endpoints only"
    )

    resolved = resolve_systems(spec.get("target_systems") or [])
    systems_total = len(resolved)
    rows: list[dict[str, Any]] = []
    run_id = f"run-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"

    for index, (system, endpoint) in enumerate(resolved, start=1):
        for attempt in range(runs_per_system):
            status, latency_ms = _fetch_once(endpoint.url, timeout)
            rows.append(
                {
                    "run_id": run_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    "provider_label": system.get("provider_label") or system.get("name") or endpoint.name,
                    "region_label": region_label(),
                    "http_status": status,
                    "latency_ms": round(latency_ms, 1),
                    "success": status == 200,
                    "test_conditions": test_conditions,
                }
            )
            if attempt < runs_per_system - 1:
                time.sleep(spacing)
        progress(f"collecting (system {index}/{systems_total})", 5 + int((index / systems_total) * 55))

    return rows
