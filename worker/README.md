# TWIG worker (Python)

Background collector for TWIG custom dataset requests. It polls Supabase for
pending jobs, runs **allow-listed** HTTP probes against public test endpoints,
and uploads the result (CSV + JSON) to the private `datasets` bucket so the
buyer can download it from the TWIG dashboard.

The worker owns **no web surface**: it consumes the `jobs` table and publishes
files. The Next.js app does everything user-facing (including quoting, payment
and access control).

## Layout

| file | role |
| --- | --- |
| `main.py` | poll loop: claim → process, graceful shutdown |
| `config.py` | env-only settings + explicit missing-config warnings |
| `job_runner.py` | per-job pipeline + failure handling |
| `services/supabase.py` | service-role client, atomic `claim_job()` RPC, job updates |
| `services/storage.py` | CSV/JSON upload to `<custom_request_id>/…` in `datasets` |
| `collectors/endpoints.py` | **the allow-list** (security boundary; no spec URLs) |
| `collectors/api_benchmarks.py` | timed probes → latency/HTTP status rows |
| `collectors/uptime.py` | compressed reachability panel → uptime buckets |
| `processors/*` | clean (dedupe, drop blanks) → normalize (types) → validate |

## Behavior & guarantees

- **Atomic claiming.** Jobs are claimed via the Postgres function
  `public.claim_job()` which locks one `pending` row with
  `FOR UPDATE SKIP LOCKED`; two workers can never grab the same job.
- **Allow-listed endpoints only.** `specification_json` contains provider
  labels but no URLs. `collectors/endpoints.py` is the single place URLs live;
  unknown labels resolve to the neutral public echo panel. Production provider
  endpoints are never contacted.
- **No invented data.** A failed request records the failure (e.g. `http_status`
  0, `success` false). Nothing is fabricated to fill gaps.
- **Validation gate.** Rows must pass required-column, per-system coverage and
  sanity checks; a failing dataset results in `jobs.status="failed"` with an
  explicit `error_message`, never an empty/low-quality deliverable.
- **Progress visibility.** `jobs.stage/progress` update through the pipeline
  (`preparing → collecting (system i/n) → cleaning → normalizing → validating
  → uploading → done`), reflected live in the TWIG dashboard.
- **Idempotent upload.** Storage objects are upserted at
  `<custom_request_id>/<dataset_slug>.csv` (+ `.json` with metadata), matching
  the RLS folder-prefix policy so only the buyer's job can be resolved.

## Configuration

Copy `.env.example` → `.env`:

| var | required | default | notes |
| --- | --- | --- | --- |
| `SUPABASE_URL` | ✅ | – | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | – | bypasses RLS — keep server-side |
| `WORKER_SHARED_SECRET` | optional | – | same value as frontend `.env.local` (reserved) |
| `POLL_INTERVAL_SECONDS` | optional | `5` | idle poll interval |
| `HTTP_TIMEOUT_SECONDS` | optional | `6` | per-request timeout |
| `HTTP_SPACING_SECONDS` | optional | `1` | delay between probes (be polite) |
| `MAX_RUNS_PER_SYSTEM` | optional | `20` | hard cap per system per job |

## Local run

```bash
cd worker
python -m venv .venv
.venv\Scripts\activate           # Windows  (mac/linux: source .venv/bin/activate)
pip install -r REQUIREMENTS.txt
copy .env.example .env           # fill in Supabase values
python main.py
```

Docker:

```bash
docker build -t twig-worker .
docker run --rm --env-file .env twig-worker
```

## Deploy on Render (free tier)

1. Commit the repo. In [Render](https://render.com): **New → Background
   Worker**, connect the repository.
2. Set **Root directory** = `worker` so Render finds `REQUIREMENTS.txt`.
3. Use the build command from the Dockerfile by choosing **Docker** as the
   environment (Render detects `worker/Dockerfile` automatically when the
   root directory points at `worker/`).
4. Add environment variables:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, (optionally
   `POLL_INTERVAL_SECONDS=10` on the free tier).
5. Create the worker. Done — it stays running and claims jobs as they appear
   in Supabase. Scaling to multiple instances is safe; the `claim_job()` RPC
   guarantees exclusive claiming.

(Railway / Fly.io / ECS: run the same image with the same env vars.)

## Testing against a real claim

1. Apply `supabase/migrations/0001_schema.sql` to your project.
2. In the TWIG app: create a custom request → approve the quote → pay with
   PayPal Sandbox (or in Supabase Studio, `insert into public.jobs
   (custom_request_id) values ('<a custom_request uuid>');` to simulate).
3. Watch the worker log claim/preprocess/collect; check Supabase
   Storage → `datasets` bucket for the output folder, and the dashboard for
   the download link.
