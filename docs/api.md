# TWIG API reference

Base URL: the Next.js app origin (e.g. `http://localhost:3000`). All endpoints
are JSON. Success bodies are plain JSON objects; errors are always:

```json
{ "error": { "code": "<machine code>", "message": "<human message>" } }
```

Common codes: `bad_request`, `validation_error` (400), `unauthorized` (401),
`forbidden` (403), `not_found` (404), `conflict`/`not_ready` (409),
`payment_not_completed` (402), `unavailable` (503, an integration like
Supabase/PayPal isn't configured on the deployment).

Unless marked otherwise, endpoints require a signed-in buyer (Supabase
session cookie via `@supabase/ssr`; stateless trade of ids only — every route
re-checks the session server-side).

---

## Health

### `GET /api/health`

No auth.

```json
{ "ok": true,
  "configured": { "supabase": false, "paypal": false, "paypal_webhook_id": false, "ai": false } }
```

---

## Catalog

### `GET /api/datasets?category=&limit=&mark=`

Public (buyer not required). Returns published datasets with synthetic flags.

```json
{ "source": "demo|db", "count": 3, "datasets": [ DatasetSummary... ] }
```

`source` is `"demo"` when Supabase is not configured (built-in demo catalog).

### `GET /api/datasets/[id]`
`id` may be a UUID or slug. Public, catalog-only. → `{ "dataset": DatasetDetail }`

### `POST /api/datasets/[id]/preview`
Also available as GET. Body `{ "limit": 1..50, default 10 }`. Returns the
schema description and bounded sample records (metadata only — no entitlement).

```json
{ "dataset_id": "...", "slug": "...", "name": "...",
  "synthetic": true, "synthetic_notice": "...",
  "schema": { ...fields... }, "sample_records": [ ... ], "total_sample_records": 4 }
```

### `GET /api/datasets/[id]/download`
Owner-only (entitlement checked server-side). 302-redirects to a short-lived
(15 min) signed Storage URL for the dataset file. Errors: 403 not entitled,
409 `not_ready` (no file attached), 503 Storage not configured.

---

## Orders & payments (PayPal Sandbox)

All amounts come from the database (dataset price or custom-request quote).
The client never sends an amount, and capture is verified server-side.

### `GET /api/orders`
Buyer's order history → `{ "orders": [ ... ] }`.

### `POST /api/orders`

```json
{ "dataset_id": "uuid" }            // or
{ "custom_request_id": "uuid" }     // exactly one
```

→ 201 `{ "order": { id, dataset_id, custom_request_id, amount, currency, payment_status } }`.
Rejected 400 if both/neither ids; custom request must be `quoted` with a price.
Sets custom request → `approved` when applicable.

### `POST /api/payments/create`

```json
{ "order_id": "uuid" }
```

Creates (or reuses) the PayPal order, idempotent per internal order:

```json
{ "paypal_order_id": "PAYPAL-...", "reused": false,
  "amount": "49.00", "currency": "USD",
  "checkout": { "client_id": "<publishable PayPal client id>",
                "currency": "USD", "environment": "sandbox" },
  "paypal_configured": true }
```

Use `checkout.client_id` with `@paypal/react-paypal-js`. 503 when PayPal is
unconfigured; 409 for non-pending orders.

### `POST /api/payments/capture`

```json
{ "order_id": "uuid" }
```

**Server-side capture.** With `@paypal/react-paypal-js` you call this from
`onApprove` — but success state must come from this response, not the client.
Idempotent: if the webhook settled first, returns the recorded result.

- `completed` → `{ state: "completed", orderId, captureId, datasetId?, jobId? }`
  (`jobId` present when the order delivered a custom collection job).
- `402 payment_not_completed` on a capture that PayPal returned without a
  verified `COMPLETED` status for the correct amount.

### `POST /api/payments/webhook` (called by PayPal)

Signature-verified via PayPal's `verify-webhook-signature` REST endpoint using
`PAYPAL_WEBHOOK_ID`. Relevant events (`CHECKOUT.ORDER.APPROVED`,
`PAYMENT.CAPTURE.COMPLETED`) settle the matching order once (idempotent by
`event_id`). This endpoint is excluded from session-cookie refresh in
`proxy.ts` and must be reachable without auth.

---

## Custom requests

### `GET /api/custom-requests`

Buyer's list, newest first, each with its embedded job (if one exists):

```json
{ "custom_requests": [ { "id": "...", "status": "quoted",
    "specification_json": { ... }, "estimated_price": 64.00, "currency": "USD",
    "estimated_delivery_hours": 13, "created_at": "...",
    "job": { "id": "...", "status": "running", "progress": 45,
             "stage": "collecting (system 2/3)", "error_message": null,
             "completed_at": null } } ] }
```

### `POST /api/custom-requests`

```json
{ "prompt": "20+ chars describing the data" }
```

AI (or the deterministic fallback) converts the prompt into a structured
benchmark spec; **the price always comes from `@tw/pricing`** given the spec's
system/metric/run counts. → 201

```json
{ "custom_request": { "id": "...", "status": "quoted", ... },
  "spec": { "kind": "api_benchmark", ... },
  "quote": { "estimated_price": 64, "currency": "USD",
             "estimated_delivery_hours": 13, "breakdown": [ ... ],
             "feasible": true, "feasibility_note": "..." },
  "spec_mode": "ai|fallback", "note": null }
```

422 `unsupported_request` when the prompt cannot be turned into a supported
(automated, allow-listed) collection job.

### `POST /api/custom-requests/[id]/quote`
Body (optional) `{ "reprocess": true }`. Regenerates/re-quotes the spec.
Returns the same shape as POST above. 409 once paid/in progress/delivered.

### `POST /api/custom-requests/[id]/approve`
Buyer approves the quoted price → creates the pending order + PayPal order.

```json
{ "order": { ... },
  "paypal": { "configured": true, "order_id": "PAYPAL-...",
              "error": null, "environment": "sandbox" } }
```

409 when there is no payable quote or the request was already approved.
After this, complete the payment through `/api/payments/create` + Buttons +
`/api/payments/capture`.

---

## Jobs (custom dataset delivery)

### `GET /api/jobs`
Buyer's jobs (joined through `custom_requests`) → `{ "jobs": [ ... ] }`.
States: `pending → running (stage/progress) → completed | failed`.

### `GET /api/jobs/[id]`
Owner-only detail:

```json
{ "job": { "id": "...", "status": "completed", "progress": 100, "stage": "done",
           "error_message": null, "started_at": "...", "completed_at": "..." },
  "request_title": "...",
  "download_url": "/api/jobs/<id>/download" }   // null until completed
```

### `GET /api/jobs/[id]/download`
Owner-only; 302-redirects to a short-lived signed URL for
`<custom_request_id>/<name>.csv` in the private `datasets` bucket (a sibling
`.json` with the same rows + metadata lives next to it).
409 `not_ready` until `status === "completed"`.

---

## Agent

### `POST /api/agent/chat`

```json
{ "messages": [ { "role": "user", "content": "..." }, ... ] }
```

One agent turn. The agent searches the **real** catalog (ids copied verbatim),
optionally ranks matches with the LLM, and proposes a custom-request quote
from `@tw/pricing` when nothing fits. It cannot authorize or capture payments
and never invents datasets or prices.

```json
{ "reply": "markdown text",
  "intent": { "topic": "payment_api", "geography": "India", "providers": ["PayPal"],
              "wants_custom": false, "keywords": ["latency"] },
  "recommendations": [ { "dataset_id": "...", "slug": "...", "name": "...",
                         "price": 49, "currency": "USD", "reason": "...",
                         "coverage": "...", "freshness": "...", "format": "csv",
                         "category": "payments" } ],
  "custom_request_proposal": null,
  "mode": "ai|fallback" }
```

`mode: "fallback"` means deterministic (no AI configured).

---

## Auth

`/auth/callback` (GET) exchanges the Supabase PKCE code after email
confirmation/sign-in and redirects to `next` (quoted and restricted to a
relative path). Email/password sign-up/sign-in happen through the Supabase
client on `/login` — there is no custom password endpoint.
