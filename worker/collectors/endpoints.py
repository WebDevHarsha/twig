"""Endpoint allow-list. THE security boundary of the worker.

Job specifications never contain URLs. The worker only ever contacts
endpoints listed here, mapped from the spec's `provider_label`,
`provider_match` or system `name`. Anything that does not resolve falls back
to the neutral public echo panel -- it can never widen the reachable set.

All URLs are well-known public test/echo endpoints:
  - httpbin.org family (request echoes, delays, status codes)

Never add provider production URLs here.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AllowedEndpoint:
    """One allow-listed public test endpoint."""

    name: str
    url: str
    is_down_case: bool = False  # deliberately returns non-2xx sometimes


# ---------------------------------------------------------------------------
# The allow-list itself. Keep entries public, neutral and safe to measure.
# ---------------------------------------------------------------------------
_ALLOWED: dict[str, AllowedEndpoint] = {
    "paypal-like": AllowedEndpoint("PayPal-like test panel", "https://httpbin.org/delay/1"),
    "razorpay-like": AllowedEndpoint("Razorpay-like test panel", "https://httpbin.org/get"),
    "stripe-like": AllowedEndpoint("Stripe-like test panel", "https://httpbin.org/delay/2"),
    "square-like": AllowedEndpoint("Square-like test panel", "https://httpbin.org/get"),
    "adyen-like": AllowedEndpoint("Adyen-like test panel", "https://httpbin.org/delay/1"),
    "braintree-like": AllowedEndpoint("Braintree-like test panel", "https://httpbin.org/get"),
    "paytm-like": AllowedEndpoint("Paytm-like test panel", "https://httpbin.org/get"),
    "upi-like": AllowedEndpoint("UPI-like test panel", "https://httpbin.org/get"),
    "public_test_panel": AllowedEndpoint("Public API panel", "https://httpbin.org/get"),
    "public-api-echo": AllowedEndpoint("Public API echo panel", "https://httpbin.org/get"),
    "public-api-slow": AllowedEndpoint("Public API slow patch", "https://httpbin.org/delay/2"),
    "public-api-flaky": AllowedEndpoint(
        "Public API status-code panel", "https://httpbin.org/status/500", is_down_case=True
    ),
}

DEFAULT_KEY = "public-api-echo"
_REGION_LABEL = "global"  # single configured test region for MVP


def _lookup(candidate: str) -> AllowedEndpoint | None:
    key = (candidate or "").strip().lower().replace(" ", "-").replace("_", "-")
    direct = _ALLOWED.get(key)
    if direct:
        return direct
    for allowed_key, endpoint in _ALLOWED.items():
        if allowed_key in key or key in allowed_key:
            return endpoint
    return None


def resolve_systems(spec_systems: list[dict]) -> list[tuple[dict, AllowedEndpoint]]:
    """Map spec target systems onto allow-listed endpoints.

    The spec's shape is preserved in output row labels; the reachable URL set
    is still exactly the allow-list.
    """
    resolved: list[tuple[dict, AllowedEndpoint]] = []
    for system in spec_systems or []:
        endpoint = next(
            (
                e
                for e in (
                    _lookup(system.get("provider_match", "")),
                    _lookup(system.get("provider_label", "")),
                    _lookup(system.get("name", "")),
                )
                if e
            ),
            None,
        )
        if endpoint is None:
            endpoint = _ALLOWED[DEFAULT_KEY]
        resolved.append((system, endpoint))
    if not resolved:
        resolved.append(
            ({"name": "Public API panel", "provider_label": "public_test_panel"}, _ALLOWED[DEFAULT_KEY])
        )
    return resolved


def region_label() -> str:
    return _REGION_LABEL
