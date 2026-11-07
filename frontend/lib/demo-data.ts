import type { DatasetDetail, DatasetSummary } from "@tw/contracts";
import type { DatasetSpec } from "@tw/contracts";

/**
 * Demo-mode catalog used ONLY when Supabase is not configured. These mirror
 * the seeded datasets (which are themselves clearly labeled as simulated) so
 * the UI stays browsable with zero credentials.
 */

const DEMO_SAMPLE_LATENCY = [
  { run_id: "run-demo-001", timestamp: "2026-06-01T03:00:09.104Z", provider_label: "PayPal-like", region_label: "global", http_status: 200, latency_ms: 214.3, success: true, test_conditions: "worker v0.1; timeout 6s; spacing 1s" },
  { run_id: "run-demo-001", timestamp: "2026-06-01T03:00:10.225Z", provider_label: "Razorpay-like", region_label: "global", http_status: 200, latency_ms: 187.9, success: true, test_conditions: "worker v0.1; timeout 6s; spacing 1s" },
  { run_id: "run-demo-001", timestamp: "2026-06-01T03:00:11.366Z", provider_label: "Stripe-like", region_label: "global", http_status: 200, latency_ms: 172.4, success: true, test_conditions: "worker v0.1; timeout 6s; spacing 1s" },
  { run_id: "run-demo-002", timestamp: "2026-06-01T03:05:09.118Z", provider_label: "PayPal-like", region_label: "global", http_status: 200, latency_ms: 208.7, success: true, test_conditions: "worker v0.1; timeout 6s; spacing 1s" },
  { run_id: "run-demo-002", timestamp: "2026-06-01T03:05:11.301Z", provider_label: "Stripe-like", region_label: "global", http_status: 200, latency_ms: 176.8, success: true, test_conditions: "worker v0.1; timeout 6s; spacing 1s" },
];

const DEMO_SAMPLE_UPTIME = [
  { endpoint_label: "httpbin-get", window_start: "2026-06-01T00:00:00Z", checks_total: 12, checks_ok: 12, uptime_pct: 100, mttr_minutes: 0, simulated: true },
  { endpoint_label: "httpbin-delay1", window_start: "2026-06-01T00:00:00Z", checks_total: 12, checks_ok: 11, uptime_pct: 91.7, mttr_minutes: 6.5, simulated: true },
  { endpoint_label: "github-zen", window_start: "2026-06-01T00:00:00Z", checks_total: 12, checks_ok: 12, uptime_pct: 100, mttr_minutes: 0, simulated: true },
  { endpoint_label: "httpbin-get", window_start: "2026-06-01T01:00:00Z", checks_total: 12, checks_ok: 12, uptime_pct: 100, mttr_minutes: 0, simulated: true },
  { endpoint_label: "httpbin-delay1", window_start: "2026-06-01T01:00:00Z", checks_total: 12, checks_ok: 12, uptime_pct: 100, mttr_minutes: 0, simulated: true },
];

const DEMO_SAMPLE_REGIONAL = [
  { endpoint_label: "httpbin-get", region_label: "1", window_start: "2026-06-01T00:00:00Z", p50_latency_ms: 211.4, p95_latency_ms: 398.2, sample_count: 840, simulated: true },
  { endpoint_label: "httpbin-delay1", region_label: "1", window_start: "2026-06-01T00:00:00Z", p50_latency_ms: 1189.1, p95_latency_ms: 1502.8, sample_count: 780, simulated: true },
  { endpoint_label: "github-zen", region_label: "1", window_start: "2026-06-01T00:00:00Z", p50_latency_ms: 182.6, p95_latency_ms: 322.9, sample_count: 760, simulated: true },
  { endpoint_label: "httpbin-get", region_label: "2", window_start: "2026-06-01T00:00:00Z", p50_latency_ms: 248.9, p95_latency_ms: 461.3, sample_count: 810, simulated: true },
  { endpoint_label: "httpbin-delay1", region_label: "2", window_start: "2026-06-01T00:00:00Z", p50_latency_ms: 1241, p95_latency_ms: 1588.4, sample_count: 750, simulated: true },
];

export interface DemoDataset extends DatasetDetail {
  id: string;
}

export const DEMO_DATASETS: DemoDataset[] = [
  {
    id: "11111111-1111-4111-9111-111111111111",
    name: "Payment API Latency Benchmarks",
    slug: "payment-api-latency-benchmarks",
    description:
      "Round-trip latency measurements for public payment provider test endpoints, sampled at fixed intervals. Clearly simulated: measurements were produced against TWIG's configured, allow-listed public test endpoints under controlled conditions, and do not represent universal provider performance.",
    category: "payments",
    price: 49,
    currency: "USD",
    format: "csv",
    coverage: "Global test endpoint sampling, sliding 7-day window per release.",
    freshness: "Updated daily at 03:00 UTC; this release is a simulation generated at seed time.",
    released_at: "2026-06-01T03:00:00.000Z",
    sample_count: DEMO_SAMPLE_LATENCY.length,
    schema_json: {
      label: "payment_api_latency_benchmarks (SIMULATED)",
      description:
        "Per-run latency benchmark observations for payment-API-like public test endpoints. SIMULATED: produced by the TWIG benchmark worker against allow-listed public endpoints.",
      synthetic: true,
      synthetic_notice:
        "Simulated / demo data. Latency readings reflect test endpoint behavior at collection time, not universal provider performance.",
      fields: [
        { name: "run_id", type: "string", required: true, description: "Stable run identifier." },
        { name: "timestamp", type: "timestamp", required: true, description: "UTC ISO-8601 time of the measurement." },
        { name: "provider_label", type: "string", required: true, description: "Provider label under test." },
        { name: "region_label", type: "string", required: true, description: "Label of the configured test region." },
        { name: "http_status", type: "number", required: true, description: "HTTP status returned by the test endpoint." },
        { name: "latency_ms", type: "number", required: true, description: "End-to-end response latency in milliseconds." },
        { name: "success", type: "boolean", required: true, description: "True when HTTP status was 2xx." },
        { name: "test_conditions", type: "string", required: true, description: "Worker version, timeout, and request spacing used." },
      ],
      keys: ["run_id"],
      notes: ["All rows are simulated and labeled as such."],
    } as DatasetSpec,
    sample_data: DEMO_SAMPLE_LATENCY,
    storage_path: "11111111-1111-4111-9111-111111111111/payment_api_latency_benchmarks.csv",
    source_information:
      "Synthetic collection generated by the TWIG benchmark worker against its configured, allow-listed set of public test endpoints. No live payment provider API endpoints were contacted.",
    license_information:
      "Purchase grants a perpetual internal-use license. Redistribution or resale of the data is not permitted.",
    methodology:
      "Worker-based HTTP pings at 1 request/second per endpoint, 6s timeout, p50/p95/p99 aggregation per system. SIMULATED dataset.",
    last_updated: "2026-06-01T03:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-9222-222222222222",
    name: "API Uptime History",
    slug: "api-uptime-history",
    description:
      "Hourly reachability snapshots (HTTP status classes, response flags, MTTR indicators) for a fixed panel of public API test endpoints across a 7-day window. SIMULATED: synthetic observations produced at seed time.",
    category: "api-performance",
    price: 39,
    currency: "USD",
    format: "json",
    coverage: "Fixed panel of 3 public test endpoints, 7-day hourly windows.",
    freshness: "Updated daily at 00:05 UTC; this release is a simulation generated at seed time.",
    released_at: "2026-06-01T00:05:00.000Z",
    sample_count: DEMO_SAMPLE_UPTIME.length,
    schema_json: {
      label: "api_uptime_history (SIMULATED)",
      description:
        "Hourly uptime/reachability roll-ups for a fixed panel of public test endpoints. SIMULATED: synthetic dataset.",
      synthetic: true,
      synthetic_notice:
        "Simulated / demo data. Uptime observations are illustrative only.",
      fields: [
        { name: "endpoint_label", type: "string", required: true, description: "Test endpoint panel label." },
        { name: "window_start", type: "timestamp", required: true, description: "UTC hour bucket start." },
        { name: "checks_total", type: "number", required: true, description: "Probes attempted in the hour." },
        { name: "checks_ok", type: "number", required: true, description: "Probes returning HTTP 2xx/3xx." },
        { name: "uptime_pct", type: "number", required: true, description: "checks_ok / checks_total as a percentage." },
        { name: "mttr_minutes", type: "number", required: true, description: "Mean time to recovery within the hour." },
        { name: "simulated", type: "boolean", required: true, description: "Always true for this dataset." },
      ],
      keys: ["endpoint_label", "window_start"],
      notes: [],
    } as DatasetSpec,
    sample_data: DEMO_SAMPLE_UPTIME,
    storage_path: "22222222-2222-4222-9222-222222222222/api_uptime_history.json",
    source_information:
      "Synthetic roll-ups generated at seed time over a fixed panel of public test endpoints.",
    license_information:
      "Purchase grants a perpetual internal-use license. Redistribution or resale of the data is not permitted.",
    methodology:
      "Synthetic generation from a deterministic model; no production system was probed. SIMULATED dataset.",
    last_updated: "2026-06-01T00:05:00.000Z",
  },
  {
    id: "33333333-3333-4333-9333-333333333333",
    name: "Regional API Performance Comparison",
    slug: "regional-api-performance-comparison",
    description:
      "Per-region latency percentile comparison (p50/p95) across a fixed panel of public test endpoints over a sliding 7-day window. SIMULATED: synthetic rows, explicitly labeled.",
    category: "api-performance",
    price: 59,
    currency: "USD",
    format: "csv",
    coverage: "Two numeric test regions, fixed endpoint panel, 7-day window.",
    freshness: "Updated weekly on Mondays at 06:00 UTC; simulation generated at seed time.",
    released_at: "2026-06-01T06:00:00.000Z",
    sample_count: DEMO_SAMPLE_REGIONAL.length,
    schema_json: {
      label: "regional_api_performance_comparison (SIMULATED)",
      description:
        "Region-wise latency percentile comparisons for a fixed public endpoint panel. SIMULATED: synthetic dataset.",
      synthetic: true,
      synthetic_notice:
        "Simulated / demo data. Percentiles reflect the synthetic model, not real network conditions.",
      fields: [
        { name: "endpoint_label", type: "string", required: true, description: "Test endpoint panel label." },
        { name: "region_label", type: "string", required: true, description: "Numeric test region label." },
        { name: "window_start", type: "timestamp", required: true, description: "UTC week bucket start." },
        { name: "p50_latency_ms", type: "number", required: true, description: "Median latency in the window." },
        { name: "p95_latency_ms", type: "number", required: true, description: "95th percentile latency in the window." },
        { name: "sample_count", type: "number", required: true, description: "Observations behind percentiles." },
        { name: "simulated", type: "boolean", required: true, description: "Always true for this dataset." },
      ],
      keys: ["endpoint_label", "region_label", "window_start"],
      notes: [],
    } as DatasetSpec,
    sample_data: DEMO_SAMPLE_REGIONAL,
    storage_path: "33333333-3333-4333-9333-333333333333/regional_api_performance_comparison.csv",
    source_information:
      "Synthetic per-region percentiles generated at seed time over a fixed public endpoint panel.",
    license_information:
      "Purchase grants a perpetual internal-use license. Redistribution or resale of the data is not permitted.",
    methodology:
      "Percentiles recomputed from synthetic samples; no production systems were probed. SIMULATED dataset.",
    last_updated: "2026-06-01T06:00:00.000Z",
  },
];

export function demoListDatasets(params: {
  q?: string;
  category?: string;
  format?: string;
  maxPrice?: number;
}): DatasetSummary[] {
  const q = params.q?.trim().toLowerCase();
  return DEMO_DATASETS.filter((d) => {
    if (q && !(`${d.name}\n${d.description}`.toLowerCase().includes(q))) return false;
    if (params.category && d.category !== params.category) return false;
    if (params.format && d.format !== params.format) return false;
    if (params.maxPrice !== undefined && d.price > params.maxPrice) return false;
    return true;
  }).map(toSummary);
}

export function demoGetDataset(key: string): DatasetDetail | null {
  const k = key.toLowerCase();
  return (
    DEMO_DATASETS.find((d) => d.slug === k || d.id === k) ?? null
  );
}

export function toSummary(detail: DatasetDetail): DatasetSummary {
  return {
    id: detail.id,
    name: detail.name,
    slug: detail.slug,
    description: detail.description,
    category: detail.category,
    price: detail.price,
    currency: detail.currency,
    format: detail.format,
    coverage: detail.coverage,
    freshness: detail.freshness,
    released_at: detail.released_at,
    sample_count: detail.sample_count,
  };
}
