"""Type normalization for collected rows.

Only coerces types of values that were actually measured; missing values
become JSON null rather than fabricated numbers.
"""

from __future__ import annotations

from typing import Any

_INT_FIELDS = {"http_status", "checks", "succeeded", "failed"}
_FLOAT_FIELDS = {"latency_ms", "uptime_pct"}
_BOOL_FIELDS = {"success"}


def normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        out: dict[str, Any] = {}
        for key, value in row.items():
            if value is None:
                out[key] = None
            elif key in _INT_FIELDS:
                out[key] = _to_int(value)
            elif key in _FLOAT_FIELDS:
                out[key] = _to_float(value)
            elif key in _BOOL_FIELDS:
                out[key] = _to_bool(value)
            else:
                out[key] = value
        normalized.append(out)
    return normalized


def _to_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _to_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    return True if text in {"true", "1", "yes"} else False if text in {"false", "0", "no"} else None
