"""Final validation gate before a job result is delivered.

A dataset that fails validation is never uploaded as "completed"; the job is
marked failed with an explicit reason instead.
"""

from __future__ import annotations

from typing import Any

REQUIRED_COLUMNS = {"provider_label", "region_label"}

MIN_CHECKS_MEANINGFUL = 1  # at least one observation per system


def validate_result(rows: list[dict[str, Any]], spec: dict) -> str | None:
    """Return an error string for a deliverable data quality problem, else None."""
    if not rows:
        return "no usable rows were collected — refusing to deliver an empty dataset"

    columns = {key for row in rows for key in row}
    required = REQUIRED_COLUMNS | {
        name
        for name in (spec.get("required_columns") or [])
        if name  # spec-provided columns, filtered to truthy strings
    }
    mandatory = required & {"timestamp", "provider_label", "region_label", "http_status", "latency_ms"}
    missing = mandatory - columns
    if missing:
        return f"required columns missing from results: {', '.join(sorted(missing))}"

    systems = {row.get("provider_label") for row in rows}
    for system in systems:
        if not system:
            return "a row is missing provider_label"
        observations = [
            r
            for r in rows
            if r.get("provider_label") == system
            and (r.get("http_status") is not None or r.get("latency_ms") is not None)
        ]
        if len(observations) < MIN_CHECKS_MEANINGFUL:
            return f"system '{system}' has no usable observations"

    for row in rows:
        status = row.get("http_status")
        if status is not None and not 0 <= int(status) <= 599:
            return f"http_status out of range: {status}"

    return None
