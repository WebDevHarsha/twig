"""Uptime collector.

Runs an accelerated reachability panel over allow-listed public test endpoints
and aggregates results into synthetic "hour buckets": each bucket covers
`checks_per_bucket` consecutive probes compressed into a short wall-clock run
(clearly noted in test_conditions as compressed relative to real hourly data).

One output row per system per bucket with checks/succeeded/failed counts,
uptime percentage and last observed HTTP status. Nothing about real provider
availability is claimed.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from collectors.endpoints import region_label, resolve_systems
from config import settings

ProgressFn = Callable[[str, int], None]


def _probe(url: str, timeout: int) -> int:
    request = Request(url, headers={"User-Agent": "twig-worker/0.1 (+uptime probe)"}, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            response.read(256)
            return int(response.status)
    except HTTPError as exc:
        return int(exc.code)
    except (URLError, TimeoutError, OSError):
        return 0


def collect_uptime(spec: dict, progress: ProgressFn) -> list[dict[str, Any]]:
    checks_per_bucket = 4  # compressed stand-in for hourly samples
    buckets = 3
    timeout = settings.request_timeout_seconds
    spacing = max(0.0, settings.request_spacing_seconds)
    test_conditions = (
        f"worker v{settings.worker_version}; uptime panel compressed: "
        f"{buckets} buckets x {checks_per_bucket} checks, spacing {spacing:.1f}s; "
        "allow-listed public test endpoints only — illustrative, not real provider availability"
    )

    resolved = resolve_systems(spec.get("target_systems") or [])
    systems_total = len(resolved)
    rows: list[dict[str, Any]] = []

    for index, (system, endpoint) in enumerate(resolved, start=1):
        for bucket_index in range(buckets):
            window_start = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            statuses: list[int] = []
            for _ in range(checks_per_bucket):
                statuses.append(_probe(endpoint.url, timeout))
                time.sleep(spacing)
            succeeded = sum(1 for s in statuses if s == 200)
            rows.append(
                {
                    "window_start": window_start,
                    "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    "provider_label": system.get("provider_label") or system.get("name") or endpoint.name,
                    "region_label": region_label(),
                    "checks": checks_per_bucket,
                    "succeeded": succeeded,
                    "failed": checks_per_bucket - succeeded,
                    "uptime_pct": round(succeeded / checks_per_bucket * 100.0, 1),
                    "http_status": statuses[-1],
                    "test_conditions": test_conditions,
                }
            )
        progress(f"collecting (system {index}/{systems_total})", 5 + int((index / systems_total) * 55))

    return rows
