"""TWIG worker entrypoint.

Polls Supabase for pending custom-dataset jobs and processes them serially.
Runs forever until interrupted; every state change is written back to the
jobs table so the dashboard reflects real progress.

    python main.py        (env from .env, see .env.example)
"""

from __future__ import annotations

import signal
import sys
import time

from config import settings
from job_runner import process_job
from services import supabase

_running = True


def _stop(signum, _frame) -> None:  # pragma: no cover - signal handler
    global _running
    _running = False
    print(f"[main] received signal {signum}; finishing current work…", flush=True)


def main() -> int:
    if not settings.configured:
        print(
            "FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n"
            "Copy worker/.env.example to worker/.env and fill in the values.",
            flush=True,
        )
        return 2

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    print(
        f"[main] TWIG worker v{settings.worker_version} starting: "
        f"poll {settings.poll_interval_seconds}s, timeout {settings.request_timeout_seconds}s",
        flush=True,
    )

    while _running:
        job = None
        try:
            job = supabase.claim_job()
        except Exception as exc:  # connection/schema problems must not kill the loop
            print(f"[main] claim_job error: {exc}", flush=True)

        if not job:
            time.sleep(max(1, settings.poll_interval_seconds))
            continue

        job_id = str(job.get("id") or "?")
        print(f"[main] claimed job {job_id}", flush=True)
        process_job(job)

    print("[main] worker stopped cleanly.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
