# TWIG architecture

## System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js 16, React 19, Turbopack)                            │
│    pages: /  /marketplace  /datasets/[slug]  /custom  /dashboard       │
│           /assistant  /login                                          │
│    PayPal Buttons (@paypal/react-paypal-js) on /custom + dataset page  │
└───────────────┬──────────────────────────────────────────────────────┘
                │ session-cookie (Supabase auth) + fetch
┌───────────────▼──────────────────────────────────────────────────────┐
│  Next.js server                                                       │
│    proxy.ts            – refreshes the Supabase session cookie only    │
│                          (excludes /api/payments/webhook, static)      │
│    route handlers      – all business logic; Zod-validated bodies;     │
│                          server-side auth + ownership checks;         │
│                          prices from DB only; PayPal server SDK;      │
│                          idempotent capture/entitlements               │
└──────┬───────────────────────────────────────────┬────────────────────┘
       │ service-role (server only)                │ PayPal Sandbox REST/SDK
┌──────▼─────────────┐                    ┌────────▼─────────┐
│ Supabase           │                    │ PayPal            │
│  Postgres + RLS    │  shared data hub   │  Orders/Capture   │
│  auth (email pwd)  │◄──────────────────►│  Webhook verify   │
│  Storage (private) │   signed URLs      └───────────────────┘
└──────▲─────────────┘
       │ service-role: claim_job(), jobs updates, Storage upload
┌──────┴───────────────────────────────────────────────────────────────┐
│  Python worker (Docker, python:3.12-slim)                            │
│  allow-listed public test endpoints → clean → normalize → validate   │
│  → upload CSV+JSON → jobs.completed → buyer downloads via Next.js    │
└──────────────────────────────────────────────────────────────────────┘
```

**Why Route Handlers (no separate API server):** the Next.js process is the
only trusted component; keeping auth, Zod validation, DB access and payments
in one deployment simplifies a hackathon-scale MVP while keeping every trust
boundary enforced server-side.

**Why Supabase as the data hub:** the Next.js server (service-role client) and
the Python worker both speak PostgREST/Storage; there is no direct
Next↔worker channel, no Redis, no queues — the `jobs` table *is* the queue.

## Trust boundaries & invariants

### Prices
- `POST /api/orders` receives **ids only**. `lib/payments.ts#createOrderFor`
  loads the amount from `datasets.price` (published rows only) or
  `custom_requests.estimated_price`.
- `/api/payments/capture` re-verifies the captured currency and amount against
  the DB before granting access.

### Access grants (idempotency)
- `entitlements` unique index `(order_id, dataset_id)` + `(user_id, dataset_id)`
- `orders.paypal_capture_id` unique → each capture settles exactly once
- `payment_events.event_id` unique → webhook replays are no-ops
- Grant flow: mark order `completed` (conditional update) → insert
  `payment_events` → upsert entitlement → (custom orders) create job if none.

### AuthZ
- `proxy.ts` refreshes the browser session; each route independently loads the
  user via `lib/supabase/server.ts` (`auth.getUser()` — never trusts client
  JWT claims) and checks ownership through DB joins.
- Storage RLS matches the object's first path segment
  (`split_part(name, '/', 1)`) to an entitlement or job owner, so the worker's
  file layout is itself an access control.

### LLM guardrails (`frontend/lib/ai/*`)
- `llm.ts` — provider-agnostic chat wrapper (any OpenAI-compatible endpoint);
  strict JSON + Zod schema validation; never a source of truth.
- `intent.ts`/`spec.ts` — extract *language* only; specs are server-validated
  (`validateSpec`: kind allow-list, no URLs, ≤6 systems, metrics required).
- `agent.ts` — dataset ids must come verbatim from the fetched catalog; quote
  always recomputed by `@tw/pricing`; the agent performs no payments.
- Missing AI credentials → deterministic fallbacks, labeled `mode: "fallback"`.

### Worker isolation (`worker/`)
- Specs **never** contain URLs. `collectors/endpoints.py` maps provider labels
  to a fixed allow-list of public test endpoints (httpbin family); unknown
  labels fall back to the neutral echo panel. No production provider endpoint
  can be reached.
- Pipeline: collect → clean (dedupe/blank drop) → normalize (typed fields) →
  validate (required columns, per-system coverage, sane statuses). A dataset
  that fails validation is marked `failed` with a reason, never delivered.
- Results include `test_conditions` and a "not universal provider performance"
  notice; demo/seed catalog data is labeled SIMULATED in `schema_json`.

## Data model (supabase/migrations/0001_schema.sql)

| table | purpose |
| --- | --- |
| `profiles` | mirror of `auth.users` (trigger `handle_new_user`) |
| `datasets` | catalog; `schema_json` (field defs + synthetic flags), `sample_data`, `storage_path` |
| `custom_requests` | buyer prompt → `specification_json` (BenchmarkSpec) → quote → status (`draft→quoted→approved→paid/in_progress/delivered`) |
| `orders` | payment attempt per dataset or custom request; `paypal_order_id` unique, `paypal_capture_id` unique |
| `entitlements` | grants; unique `(order_id, dataset_id)` & `(user_id, dataset_id)` |
| `jobs` | worker queue (one per custom request, `custom_request_id` unique); `claim_job()` RPC |
| `payment_events` | webhook/capture dedupe by `event_id` |

Indexes exist on status/category/slug/buyer columns and pending-job ordering
(`jobs_pending_idx`). `touch_updated_at()` keeps `datasets.updated_at` fresh.

`claim_job()` is a `security definer` SQL function performing an atomic
`UPDATE … FOR UPDATE SKIP LOCKED`, returning the claimed row — this is what
makes multi-worker deployments safe.

## Payment sequence (happy path)

```
buyer ─ POST /api/orders ──────────────► DB: orders(pending, amount from DB)
buyer ─ POST /api/payments/create ─────► PayPal createOrder (server SDK)
buyer ─ PayPal Buttons (approve popup)
buyer ─ POST /api/payments/capture ────► PayPal captureOrder
        server: status COMPLETED? amount==DB? → orders.completed →
        payment_events → entitlements → (custom) jobs(pending)
PayPal ─ POST /api/payments/webhook ───► signature verify → settle (idempotent)
buyer ─ GET /api/jobs/[id]/download ───► 302 signed Storage URL
```

## Custom-request→delivery pipeline

```
prompt → intent (AI|fallback) → spec (AI|fallback) → validateSpec
       → quoteCustomBenchmark (deterministic) → custom_requests(quoted)
buyer approves → order → PayPal → capture → jobs row (unique per request)
worker: claim_job() → collect (allow-listed) → clean/normalize/validate
       → Storage <request_id>/*.csv + *.json → jobs.completed(100, stage=done)
buyer: dashboard → /api/jobs/[id]/download
```

## Env/secret surface

| var | surface |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL/_PUBLISHABLE_KEY` | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Next server + worker only |
| `PAYPAL_CLIENT_ID/SECRET/BASE_URL/WEBHOOK_ID` | server only (`WEBHOOK_ID` for verification) |
| `WORKER_SHARED_SECRET` | frontend + worker (reserved for future admin endpoints) |
| `AI_API_KEY/BASE_URL/MODEL` | server only; optional |

## Deployment notes

- **Frontend:** any Next.js host; set env vars; register the PayPal webhook at
  `https://<host>/api/payments/webhook`.
- **Worker:** Docker image (`worker/Dockerfile`) — needs only
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional tuning vars
  (`POLL_INTERVAL_SECONDS`, `HTTP_*`). One instance is enough for the MVP;
  the RPC-based claim makes more instances safe. Render/Railway/ECS/fly.io are
  all fine; see `worker/README.md` for a Render walkthrough.
- **Supabase:** apply `supabase/migrations/0001_schema.sql` then optional
  `supabase/seed.sql`. Storage bucket `datasets` is created by the migration
  with folder-prefix RLS.
