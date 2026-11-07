"""Row cleaning: remove unusable rows and duplicates, trim noise.

Rules are dataset-level heuristics only; values are never invented here.
"""

from __future__ import annotations

from typing import Any


def clean_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Filter/annotate rows; returns (rows, counts)."""
    before = len(rows)
    seen_keys: set[tuple[Any, ...]] = set()
    kept: list[dict[str, Any]] = []
    dropped_missing = 0
    dropped_duplicates = 0

    for row in rows:
        if not isinstance(row, dict):
            dropped_missing += 1
            continue
        if _is_blank(row):
            dropped_missing += 1
            continue
        key = _dedupe_key(row)
        if key in seen_keys:
            dropped_duplicates += 1
            continue
        seen_keys.add(key)
        kept.append({k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()})

    return kept, {
        "rows_in": before,
        "rows_out": len(kept),
        "dropped_missing": dropped_missing,
        "dropped_duplicates": dropped_duplicates,
    }


def _is_blank(row: dict[str, Any]) -> bool:
    required = [k for k in ("timestamp", "provider_label", "region_label") if k in row]
    return any(row.get(k) in (None, "") for k in required) if required else all(
        v in (None, "") for v in row.values()
    )


def _dedupe_key(row: dict[str, Any]) -> tuple[Any, ...]:
    if "run_id" in row and "timestamp" in row:
        return ("bench", row.get("run_id"), row.get("timestamp"), row.get("provider_label"))
    if "window_start" in row:
        return ("uptime", row.get("window_start"), row.get("provider_label"))
    return ("row", tuple(sorted(str(row.get(k)) for k in row)))
