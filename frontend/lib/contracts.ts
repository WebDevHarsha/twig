/**
 * Runtime Zod schemas mirroring shared/contracts.ts types.
 * Kept inside the frontend so the shared directory stays dependency-free.
 */
import { z } from "zod";
import type { DatasetDetail, DatasetSpec, SpecWrapper } from "@tw/contracts";

export const datasetSchemaFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "timestamp", "array", "object"]),
  required: z.boolean().default(true),
  description: z.string(),
});

export const datasetSpecSchema = z.object({
  label: z.string(),
  description: z.string(),
  synthetic: z.boolean().default(false),
  synthetic_notice: z.string().optional(),
  fields: z.array(datasetSchemaFieldSchema).min(1),
  keys: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
}) satisfies z.ZodType<DatasetSpec>;

export const datasetDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.number(),
  currency: z.string(),
  format: z.string(),
  coverage: z.string(),
  freshness: z.string(),
  released_at: z.string(),
  sample_count: z.number().optional(),
  schema_json: datasetSpecSchema,
  sample_data: z.array(z.record(z.string(), z.unknown())),
  storage_path: z.string().nullable().optional(),
  source_information: z.string().nullable().optional(),
  license_information: z.string().nullable().optional(),
  methodology: z.string().nullable().optional(),
  last_updated: z.string(),
}) satisfies z.ZodType<DatasetDetail>;

/* ------------------------------------------------------------------ */
/* Custom request specification                                        */
/* ------------------------------------------------------------------ */

export const benchmarkSpecSchema = z.object({
  kind: z.literal("api_benchmark"),
  dataset_name: z.string().min(3),
  description: z.string(),
  target_systems: z
    .array(
      z.object({
        name: z.string(),
        provider_label: z.string(),
        provider_match: z.string().optional(),
      })
    )
    .min(1),
  metrics: z.array(z.enum(["latency_ms", "http_status", "success"])).min(1),
  geography: z.string(),
  sample_size_hint: z.number().int().min(1).max(10_000).default(24),
  time_scope: z
    .object({
      runs_per_system: z.number().int().min(3).max(50),
    })
    .default({ runs_per_system: 8 }),
  assumptions: z.array(z.string()).default([]),
  required_columns: z.array(z.string()).default([]),
});

export const specWrapperSchema = z.object({
  version: z.literal(1),
  b2b: benchmarkSpecSchema,
}) satisfies z.ZodType<SpecWrapper>;

/* ------------------------------------------------------------------ */
/* API request bodies                                                  */
/* ------------------------------------------------------------------ */

export const createCustomRequestSchema = z.object({
  prompt: z.string().min(20, "Describe your data need in at least 20 characters").max(4000),
});

export const createOrderSchema = z
  .object({
    dataset_id: z.string().uuid().optional(),
    custom_request_id: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.dataset_id || v.custom_request_id), {
    message: "Provide either dataset_id or custom_request_id",
  });

export const paymentCreateSchema = z.object({
  order_id: z.string().uuid(),
});

export const paymentCaptureSchema = z.object({
  order_id: z.string().uuid(),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.literal("user"),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(12),
});
