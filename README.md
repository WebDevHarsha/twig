# TWIG — AI-agent-native data marketplace

An MVP marketplace where buyers browse and purchase datasets, ask an AI
assistant for data (which searches the **real** catalog and proposes custom
collections), and receive custom-built datasets from a background worker.
Payments run on **PayPal Sandbox** and the backend is **Next.js Route
Handlers** — no separate API server process.

```
├── frontend/   Next.js 16 app: UI, API route handlers, Zod validation,
│               PayPal Sandbox checkout, Supabase auth/DB
├── shared/     @tw/* package: contracts (types) + deterministic pricing engine
├── supabase/   SQL migrations + seed (profiles, datasets, orders,
│               entitlements, custom_requests, jobs, storage, RLS)
├── worker/     Python background collector (benchmarks/uptime over an
│               allow-list of public test endpoints), Dockerized
└── docs/       api.md (HTTP contracts) · architecture.md (system design)
```

## Feature map

| Flow | Where |
| --- | --- |
| Browse marketplace / dataset detail / preview | `/marketplace`, `/datasets/[slug]`, `POST /api/datasets/[id]/preview` |
| Purchase (PayPal Sandbox) | server-created order → PayPal Buttons → **server-side capture** → entitlement |
| Custom request (AI spec + deterministic quote) | `/custom`, `POST /api/custom-requests` |
| Approve quote → pay → job | `POST /api/custom-requests/[id]/approve` → payment → `jobs` row |
| Background collection + delivery | `worker/` (Python) → Storage → `/api/jobs/[id]/download` |
| Agent assistant | `/assistant`, `POST /api/agent/chat` |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In **SQL Editor**, run the contents of **`supabase/migrations/0001_schema.sql`**
   in its entirety, then **`supabase/seed.sql`** (3 clearly-labeled SIMULATED
   demo datasets).
3. Project Settings → API: copy the **Project URL**, **Publishable (anon) key**
   and **Service-role key**.
   The service-role key is used only server-side and by the worker.

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local   # then fill in the values (see file comments)
npm run dev                    # http://localhost:3000
```

`.env.local` keys: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
PayPal Sandbox credentials (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_BASE_URL`, `PAYPAL_WEBHOOK_ID`), optional AI provider
(`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`), shared
`WORKER_SHARED_SECRET`.

**Demo mode:** if Supabase/PayPal are unconfigured the app says so explicitly —
the landing/marketplace pages show a demo catalog and purchase/custom flows
show a clear configuration error. This is intentional; nothing fails silently.

### 3. PayPal Sandbox

1. [developer.paypal.com](https://developer.paypal.com) → Apps & Credentials →
   **SANDBOX** tab → create an app → copy Client ID/Secret.
2. In the same app, add a webhook pointing to
   `https://<your-host>/api/payments/webhook` subscribed to
   `PAYMENT.CAPTURE.COMPLETED` and `CHECKOUT.ORDER.APPROVED`; copy the
   **webhook id** into `PAYPAL_WEBHOOK_ID`.
   (Locally the webhook is optional; `/api/payments/capture` is the primary
   settlement path and is idempotent.)

### 4. Worker (Python)

Local run requires Python 3.12 and values for `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`:

```bash
cd worker
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r REQUIREMENTS.txt
copy .env.example .env                              # fill in
python main.py
```

Or with Docker:

```bash
cd worker
docker build -t twig-worker .
docker run --rm --env-file .env twig-worker
```

Details and one-click Render deployment: **`worker/README.md`**.

### 5. AI provider (optional)

Set `AI_API_KEY` + `AI_MODEL` (+ `AI_BASE_URL` for any OpenAI-compatible
endpoint) to enable AI intent/spec generation. Without these, deterministic
rule-based fallbacks are used automatically. **The LLM never sets prices,
feasibility, or which datasets exist** — those always come from
`shared/pricing.ts` and the database. Generated measurement data is always for
allow-listed public test endpoints and clearly labeled SIMULATED / test
conditions.

## Security & correctness invariants

- **Server-side prices.** `POST /api/orders` takes only ids; the amount comes
  from the database. The client can never set a price.
- **Server-side capture.** Buy access is granted only in
  `/api/payments/capture` and the verified webhook — never from a
  client-side success message. Amount/currency are re-verified against the
  PayPal capture payload before granting.
- **Idempotency.** Unique keys on `paypal_capture_id`, `payment_events.event_id`,
  and `entitlements(order_id, dataset_id)` make replays harmless.
- **Ownership.** Downloads and job details check the buyer via server session
  (and RLS on the database + storage paths do the same defense-in-depth).
- **Worker allow-list.** Job specs contain no URLs. The worker only contacts
  endpoints in **`worker/collectors/endpoints.py`**; unknown systems map to the
  neutral public echo panel. No production provider endpoints are ever hit.
- **Job claiming.** `claim_job()` SQL RPC uses `FOR UPDATE SKIP LOCKED`, so
  multiple workers can run concurrently without double-processing.
- **Validation.** Every API body is Zod-validated (`frontend/lib/contracts.ts`);
  worker results pass cleaning → normalization → validation before upload, and
  a dataset failing validation is marked `failed` rather than delivered.

## Development

```bash
cd frontend
npm run build    # type-safe production build (Turbopack)
npm run lint     # eslint (currently clean)
```

`GET /api/health` reports which integrations are configured, e.g.
`{"ok":true,"configured":{"supabase":false,"paypal":false,"paypal_webhook_id":false,"ai":false}}`.

Docs: [`docs/api.md`](docs/api.md) · [`docs/architecture.md`](docs/architecture.md)
