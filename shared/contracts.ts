/**
 * TWIG shared contracts — pure TypeScript types only (no runtime deps).
 *
 * These types are the cross-cutting contract between the Next.js API layer,
 * the Python worker (documented in docs/api.md), and Supabase JSON columns:
 *   - custom_requests.specification_json
 *   - jobs.result payload / dataset rows (schema_json / sample_data)
 *
 * Runtime Zod schemas mirroring these shapes live in frontend/lib/contracts.ts
 * (the frontend owns validation; zod is a frontend dependency).
 */

/* ------------------------------------------------------------------ */
/* Datasets                                                            */
/* ------------------------------------------------------------------ */

export type DatasetCategory =
  | "payments"
  | "api-performance"
  | "infrastructure"
  | "transport"
  | "intelligence"
  | "other";

export type DataFormat = "csv" | "json" | "parquet" | "tsv";

export type DatasetStatus = "draft" | "published" | "archived" | "removed";

export interface DatasetSchemaField {
  name: string;
  type: "string" | "number" | "boolean" | "timestamp" | "array" | "object";
  required: boolean;
  description: string;
}

export interface DatasetSpec {
  label: string;
  description: string;
  synthetic: boolean;
  synthetic_notice?: string;
  fields: DatasetSchemaField[];
  keys?: string[];
  notes?: string[];
}

export interface DatasetSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  format: string;
  coverage: string;
  freshness: string;
  released_at: string;
  sample_count?: number;
}

export interface DatasetDetail extends DatasetSummary {
  schema_json: DatasetSpec;
  sample_data: Record<string, unknown>[];
  storage_path?: string | null;
  source_information?: string | null;
  license_information?: string | null;
  methodology?: string | null;
  /** updated_at timestamp of the dataset row */
  last_updated: string;
}

/* ------------------------------------------------------------------ */
/* Custom dataset request specification                                */
/* ------------------------------------------------------------------ */

export type BenchmarkMetric = "latency_ms" | "http_status" | "success";

export interface BenchmarkTargetSystem {
  name: string;
  /** Human-facing provider label only. Actual endpoints are always the
   *  worker's configured, allow-listed public test endpoints. */
  provider_label: string;
  provider_match?: string;
}

export interface BenchmarkSpec {
  kind: "api_benchmark";
  dataset_name: string;
  description: string;
  target_systems: BenchmarkTargetSystem[];
  metrics: BenchmarkMetric[];
  geography: string;
  sample_size_hint: number;
  time_scope: { runs_per_system: number };
  assumptions: string[];
  required_columns: string[];
}

export interface SpecWrapper {
  version: 1;
  b2b: BenchmarkSpec;
}

/* ------------------------------------------------------------------ */
/* Quoting (deterministic, backend rules only — never invented by LLM)  */
/* ------------------------------------------------------------------ */

export interface Quote {
  estimated_price: number;
  currency: string;
  estimated_delivery_hours: number;
  breakdown: { label: string; value: string }[];
  feasible: boolean;
  feasibility_note: string;
}

/* ------------------------------------------------------------------ */
/* Agent chat                                                          */
/* ------------------------------------------------------------------ */

export interface ChatRequest {
  messages: { role: "user"; content: string }[];
}

export interface DatasetRecommendation {
  dataset_id: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  reason: string;
  coverage?: string;
  freshness?: string;
  format?: string;
  category?: string;
}

export interface ChatResponse {
  reply: string;
  intent: {
    topic: string;
    geography: string | null;
    providers: string[];
    wants_custom: boolean;
  };
  recommendations: DatasetRecommendation[];
  custom_request_proposal: {
    suggested_prompt: string;
    estimated_price: number;
    estimated_delivery_hours: number;
    note: string;
  } | null;
  mode: "ai" | "fallback";
}

/* ------------------------------------------------------------------ */
/* Worker-side job payload shapes (consumed by the Python worker)        */
/* ------------------------------------------------------------------ */

/** What the worker uploads into Storage and sets as jobs.result markers. */
export interface JobResultFile {
  path: string;
  format: DataFormat;
}
