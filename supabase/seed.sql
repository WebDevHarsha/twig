-- ===========================================================================
-- TWIG seed data
--
-- IMPORTANT: All sample records below are SYNTHETIC / DEMO data. Each dataset
-- is explicitly labeled as simulated in its schema_json so it can never be
-- mistaken for real, collected measurements.
--
-- Dataset UUIDs are fixed so storage paths stay deterministic:
--   11111111-1111-4111-9111-111111111111  payment API latency benchmarks
--   22222222-2222-4222-9222-222222222222  API uptime history
--   33333333-3333-4333-9333-333333333333  regional API performance comparison
-- ===========================================================================

delete from public.datasets where id in (
  '11111111-1111-4111-9111-111111111111'::uuid,
  '22222222-2222-4222-9222-222222222222'::uuid,
  '33333333-3333-4333-9333-333333333333'::uuid
);

insert into public.datasets
  (id, name, slug, description, category, price, currency, format,
   schema_json, sample_data, storage_path, source_information, license_information,
   coverage, freshness, methodology, status)
values
(
  '11111111-1111-4111-9111-111111111111'::uuid,
  'Payment API Latency Benchmarks',
  'payment-api-latency-benchmarks',
  'Round-trip latency measurements for public payment provider test endpoints, sampled at fixed intervals. Includes provider, region label, timestamp, HTTP status, and latency statistics per run. Clearly simulated: measurements were produced against TWIG''s configured, allow-listed public test endpoints under controlled conditions, and do not represent universal provider performance.',
  'payments',
  49.00,
  'USD',
  'csv',
  '{
    "label": "payment_api_latency_benchmarks (SIMULATED)",
    "description": "Per-run latency benchmark observations for payment-API-like public test endpoints. SIMULATED: produced by the TWIG benchmark worker against allow-listed public endpoints.",
    "synthetic": true,
    "synthetic_notice": "Simulated / demo data. Latency readings reflect test endpoint behavior at collection time, not universal provider performance.",
    "fields": [
      { "name": "run_id",          "type": "string",    "required": true,  "description": "Stable run identifier." },
      { "name": "timestamp",       "type": "timestamp", "required": true,  "description": "UTC ISO-8601 time of the measurement." },
      { "name": "provider_label",  "type": "string",    "required": true,  "description": "Provider label under test (PayPal-like, Razorpay-like, Stripe-like)." },
      { "name": "region_label",    "type": "string",    "required": true,  "description": "Label of the configured test region." },
      { "name": "http_status",     "type": "number",    "required": true,  "description": "HTTP status returned by the test endpoint." },
      { "name": "latency_ms",      "type": "number",    "required": true,  "description": "End-to-end response latency in milliseconds." },
      { "name": "success",         "type": "boolean",   "required": true,  "description": "True when HTTP status was 200.." },
      { "name": "test_conditions", "type": "string",    "required": true,  "description": "Worker version, timeout, and request spacing used." }
    ],
    "keys": ["run_id"],
    "notes": [
      "All rows are simulated and labeled as such; the synthetic column is part of the schema."
    ]
  }'::jsonb,
  '[
    { "run_id": "run-2026-06-01-001", "timestamp": "2026-06-01T03:00:09.104Z", "provider_label": "PayPal-like",  "region_label": "global", "http_status": 200, "latency_ms": 214.3, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-001", "timestamp": "2026-06-01T03:00:10.225Z", "provider_label": "Razorpay-like", "region_label": "global", "http_status": 200, "latency_ms": 187.9, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-001", "timestamp": "2026-06-01T03:00:11.366Z", "provider_label": "Stripe-like",  "region_label": "global", "http_status": 200, "latency_ms": 172.4, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-002", "timestamp": "2026-06-01T03:05:09.118Z", "provider_label": "PayPal-like",  "region_label": "global", "http_status": 200, "latency_ms": 208.7, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-002", "timestamp": "2026-06-01T03:05:10.207Z", "provider_label": "Razorpay-like", "region_label": "global", "http_status": 200, "latency_ms": 191.2, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-002", "timestamp": "2026-06-01T03:05:11.301Z", "provider_label": "Stripe-like",  "region_label": "global", "http_status": 200, "latency_ms": 176.8, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-003", "timestamp": "2026-06-01T03:10:09.090Z", "provider_label": "PayPal-like",  "region_label": "global", "http_status": 503, "latency_ms": 512.6, "success": false, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-003", "timestamp": "2026-06-01T03:10:10.224Z", "provider_label": "Razorpay-like", "region_label": "global", "http_status": 200, "latency_ms": 196.5, "success": true,  "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-003", "timestamp": "2026-06-01T03:10:11.330Z", "provider_label": "Stripe-like",  "region_label": "global", "http_status": 200, "latency_ms": 174.1, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" },
    { "run_id": "run-2026-06-01-004", "timestamp": "2026-06-01T03:15:09.112Z", "provider_label": "PayPal-like",  "region_label": "global", "http_status": 200, "latency_ms": 221.0, "success": true, "test_conditions": "worker v0.1; timeout 6s; spacing 1s" }
  ]'::jsonb,
  '11111111-1111-4111-9111-111111111111/payment_api_latency_benchmarks.csv',
  'Synthetic collection generated by the TWIG benchmark worker against its configured, allow-listed set of public test endpoints (httpbin.org family). No live payment provider API endpoints were contacted.',
  'Purchase grants a perpetual internal-use license. Redistribution or resale of the data is not permitted.',
  'Global test endpoint sampling, sliding 7-day window per release.',
  'Updated daily at 03:00 UTC; this release is a simulation generated at seed time.',
  'Worker-based HTTP pings at 1 request/second per endpoint, 6s timeout, p50/p95/p99 aggregation per system; failures retained with status and error class. SIMULATED dataset.',
  'published'
),
(
  '22222222-2222-4222-9222-222222222222'::uuid,
  'API Uptime History',
  'api-uptime-history',
  'Hourly reachability snapshots (HTTP status classes, response flags, MTTR indicators) for a fixed panel of public API test endpoints across a 7-day window. SIMULATED: synthetic observations produced at seed time for demo purposes; they are clearly labeled and were not collected from production services.',
  'api-performance',
  39.00,
  'USD',
  'json',
  '{
    "label": "api_uptime_history (SIMULATED)",
    "description": "Hourly uptime/reachability roll-ups for a fixed panel of public test endpoints. SIMULATED: synthetic dataset shipped with the TWIG seed.",
    "synthetic": true,
    "synthetic_notice": "Simulated / demo data. Uptime observations are illustrative only and do not represent any real provider''s availability.",
    "fields": [
      { "name": "endpoint_label", "type": "string",  "required": true,  "description": "Test endpoint panel label." },
      { "name": "window_start",   "type": "timestamp", "required": true, "description": "UTC hour bucket start." },
      { "name": "checks_total",   "type": "number",  "required": true,  "description": "Probes attempted in the hour." },
      { "name": "checks_ok",      "type": "number",  "required": true,  "description": "Probes returning HTTP 2xx/3xx." },
      { "name": "uptime_pct",     "type": "number",  "required": true,  "description": "checks_ok / checks_total as a percentage." },
      { "name": "mttr_minutes",   "type": "number",  "required": true,  "description": "Mean time to recovery within the hour if failures occurred." },
      { "name": "simulated",      "type": "boolean", "required": true,  "description": "Always true for this dataset." }
    ],
    "keys": ["endpoint_label", "window_start"],
    "notes": [
      "uptime_pct is derived in-range; rows are per hour per endpoint."
    ]
  }'::jsonb,
  '[
    { "endpoint_label": "httpbin-get",   "window_start": "2026-06-01T00:00:00Z", "checks_total": 12, "checks_ok": 12, "uptime_pct": 100.0, "mttr_minutes": 0,     "simulated": true },
    { "endpoint_label": "httpbin-delay1","window_start": "2026-06-01T00:00:00Z", "checks_total": 12, "checks_ok": 11, "uptime_pct": 91.7,  "mttr_minutes": 6.5,   "simulated": true },
    { "endpoint_label": "github-zen",    "window_start": "2026-06-01T00:00:00Z", "checks_total": 12, "checks_ok": 12, "uptime_pct": 100.0, "mttr_minutes": 0,     "simulated": true },
    { "endpoint_label": "httpbin-get",   "window_start": "2026-06-01T01:00:00Z", "checks_total": 12, "checks_ok": 12, "uptime_pct": 100.0, "mttr_minutes": 0,     "simulated": true },
    { "endpoint_label": "httpbin-delay1","window_start": "2026-06-01T01:00:00Z", "checks_total": 12, "checks_ok": 12, "uptime_pct": 100.0, "mttr_minutes": 0,     "simulated": true },
    { "endpoint_label": "github-zen",    "window_start": "2026-06-01T01:00:00Z", "checks_total": 12, "checks_ok": 11, "uptime_pct": 91.7,  "mttr_minutes": 4.2,   "simulated": true },
    { "endpoint_label": "httpbin-get",   "window_start": "2026-06-01T02:00:00Z", "checks_total": 12, "checks_ok": 10, "uptime_pct": 83.3,  "mttr_minutes": 9.0,   "simulated": true },
    { "endpoint_label": "httpbin-delay1","window_start": "2026-06-01T02:00:00Z", "checks_total": 12, "checks_ok": 12, "uptime_pct": 100.0, "mttr_minutes": 0,     "simulated": true }
  ]'::jsonb,
  '22222222-2222-4222-9222-222222222222/api_uptime_history.json',
  'Synthetic roll-ups generated at seed time over a fixed panel of public test endpoints.',
  'Purchase grants a perpetual internal-use license. Redistribution or resale of the data is not permitted.',
  'Fixed panel of 3 public test endpoints, 7-day hourly windows.',
  'Updated daily at 00:05 UTC; this release is a simulation generated at seed time.',
  'Synthetic generation seeded from a deterministic model of slow-fast endpoint behavior; no production system was probed. SIMULATED dataset.',
  'published'
),
(
  '33333333-3333-4333-9333-333333333333'::uuid,
  'Regional API Performance Comparison',
  'regional-api-performance-comparison',
  'Per-region latency percentile comparison (p50/p95) across a fixed panel of public test endpoints over a sliding 7-day window. SIMULATED: synthetic rows generated at seed time and explicitly labeled; they must not be read as real global performance measurements.',
  'api-performance',
  59.00,
  'USD',
  'csv',
  '{
    "label": "regional_api_performance_comparison (SIMULATED)",
    "description": "Region-wise latency percentile comparisons for a fixed public endpoint panel. SIMULATED: synthetic dataset shipped with the TWIG seed.",
    "synthetic": true,
    "synthetic_notice": "Simulated / demo data. Percentiles reflect the synthetic model, not real network conditions.",
    "fields": [
      { "name": "endpoint_label", "type": "string",  "required": true,  "description": "Test endpoint panel label." },
      { "name": "region_label",   "type": "string",  "required": true,  "description": "Numeric test region label." },
      { "name": "window_start",   "type": "timestamp", "required": true, "description": "UTC week bucket start." },
      { "name": "p50_latency_ms", "type": "number",  "required": true,  "description": "Median latency in the window." },
      { "name": "p95_latency_ms", "type": "number",  "required": true,  "description": "95th percentile latency in the window." },
      { "name": "sample_count",   "type": "number",  "required": true,  "description": "Observations behind percentiles." },
      { "name": "simulated",      "type": "boolean", "required": true,  "description": "Always true for this dataset." }
    ],
    "keys": ["endpoint_label", "region_label", "window_start"],
    "notes": [
      "Regions are numeric labels for demo purposes; real releases would name them (e.g. in-mum, eu-fra)."
    ]
  }'::jsonb,
  '[
    { "endpoint_label": "httpbin-get",    "region_label": "1", "window_start": "2026-06-01T00:00:00Z", "p50_latency_ms": 211.4, "p95_latency_ms": 398.2, "sample_count": 840, "simulated": true },
    { "endpoint_label": "httpbin-delay1", "region_label": "1", "window_start": "2026-06-01T00:00:00Z", "p50_latency_ms": 1189.1, "p95_latency_ms": 1502.8, "sample_count": 780, "simulated": true },
    { "endpoint_label": "github-zen",     "region_label": "1", "window_start": "2026-06-01T00:00:00Z", "p50_latency_ms": 182.6, "p95_latency_ms": 322.9, "sample_count": 760, "simulated": true },
    { "endpoint_label": "httpbin-get",    "region_label": "2", "window_start": "2026-06-01T00:00:00Z", "p50_latency_ms": 248.9, "p95_latency_ms": 461.3, "sample_count": 810, "simulated": true },
    { "endpoint_label": "httpbin-delay1", "region_label": "2", "window_start": "2026-06-01T00:00:00Z", "p50_latency_ms": 1241.0, "p95_latency_ms": 1588.4, "sample_count": 750, "simulated": true },
    { "endpoint_label": "github-zen",     "region_label": "2", "window_start": "2026-06-01T00:00:00Z", "p50_latency_ms": 205.3, "p95_latency_ms": 351.7, "sample_count": 700, "simulated": true }
  ]'::jsonb,
  '33333333-3333-4333-9333-333333333333/regional_api_performance_comparison.csv',
  'Synthetic per-region percentiles generated at seed time over a fixed public endpoint panel.',
  'Purchase grants a perpetual internal-use license. Redistribution or resale of the data is not permitted.',
  'Two numeric test regions, fixed endpoint panel, 7-day window.',
  'Updated weekly on Mondays at 06:00 UTC; this release is a simulation generated at seed time.',
  'Percentiles recomputed from per-region synthetic samples with a 0.5s/INTL model; no production systems were probed. SIMULATED dataset.',
  'published'
);
