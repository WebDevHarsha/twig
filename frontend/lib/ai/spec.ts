/**
 * Custom request specification generation.
 *
 * The LLM converts the buyer's prompt into a STRUCTURED benchmark spec
 * (lib/ai/intent + fallback template). The spec is then validated, priced with
 * the deterministic engine in @tw/pricing, and stored. The LLM never sets the
 * price, never sets feasibility, and never describes actual measurements.
 */
import { benchmarkSpecSchema, specWrapperSchema } from "@/lib/contracts";
import type { BenchmarkSpec } from "@tw/contracts";
import type { Intent } from "@/lib/ai/intent";

const SYSTEM = `Convert a buyer's data request into a structured API benchmark specification for TWIG.
Return ONLY JSON matching exactly:
{"version":1,
 "b2b":{"kind":"api_benchmark",
   "dataset_name": string (3-8 words),
   "description": string (1-3 sentences describing what will be measured),
   "target_systems": [{"name": string, "provider_label": string, "provider_match": string}] (1-6 items),
   "metrics": ["latency_ms","http_status","success"] subset (include latency_ms and http_status at minimum),
   "geography": string,
   "sample_size_hint": integer 1-200,
   "time_scope": {"runs_per_system": integer 3-20},
   "assumptions": string[] (3-5 short bullets),
   "required_columns": string[]}}
HARD CONSTRAINTS:
- kind must be "api_benchmark" (this is the only supported automated collection type).
- geography must come from the user's prompt; default "Global".
- target_systems only include systems the user named; if none, use {"name":"Public API panel","provider_label":"public_test_panel"}.
- NEVER include any URL anywhere: endpoints are configured, allow-listed public test endpoints chosen by the worker.
- NEVER invent price, availability, latency values, or measurements.`;

/** Deterministic template spec builder (demo/fallback mode). */
export function fallbackSpec(
  prompt: string,
  intent: Intent
): BenchmarkSpec {
  const providers = intent.providers.length
    ? intent.providers
    : ["Public API panel"];
  const geography = intent.geography ?? "Global";
  const systems = providers.map((p) => ({
    name: `${p} public API endpoint`,
    provider_label: p,
    provider_match: p.toLowerCase(),
  }));
  const name =
    providers.length > 1
      ? `${providers.slice(0, 3).join(", ")} API Benchmark`
      : `${providers[0]} API Benchmark`;
  return benchmarkSpecSchema.parse({
    kind: "api_benchmark",
    dataset_name: name.slice(0, 60),
    description:
      `Latency benchmark comparing ${providers.join(", ")} ${geography === "Global" ? "" : `in ${geography} `}against TWIG's configured, allow-listed public test endpoints, under controlled test conditions`,
    target_systems: systems,
    metrics: ["latency_ms", "http_status", "success"],
    geography,
    sample_size_hint: 24,
    time_scope: { runs_per_system: 8 },
    assumptions: [
      "Measurements target TWIG's configured, allow-listed public test endpoints only.",
      "Results reflect test conditions, not universal provider performance.",
      "No provider credentials or production endpoints are used.",
    ],
    required_columns: ["provider_label", "region_label", "timestamp", "http_status", "latency_ms", "success"],
  });
}

/** Try to turn a buyer prompt into a spec with AI; fall back to template. */
export async function generateSpec(
  prompt: string,
  intent: Intent
): Promise<{ spec: BenchmarkSpec; mode: "ai" | "fallback"; note?: string }> {
  const { chatJson } = await import("@/lib/ai/llm");
  const result = await chatJson({
    system: SYSTEM,
    user: `Buyer request:\n"""${prompt.slice(0, 3000)}"""`,
    schema: specWrapperSchema,
  });
  if (result.ok) {
    const spec = result.value.b2b;
    const guard = validateSpec(spec);
    if (guard === null) return { spec, mode: "ai" };
    return {
      spec: fallbackSpec(prompt, intent),
      mode: "fallback",
      note: `AI spec rejected (${guard}); used deterministic template instead.`,
    };
  }
  return {
    spec: fallbackSpec(prompt, intent),
    mode: "fallback",
    note: result.error,
  };
}

/** Server-side guardrails on LLM-produced specs. */
export function validateSpec(spec: BenchmarkSpec): string | null {
  if (spec.kind !== "api_benchmark") return "unsupported spec kind";
  if (spec.metrics.length === 0) return "no metrics";
  const raw = JSON.stringify(spec);
  if (/https?:\/\//i.test(raw)) return "spec contains a URL (endpoints must come from the worker allow-list)";
  if (spec.target_systems.length === 0) return "no target systems";
  if (spec.target_systems.length > 6) return "too many target systems for automated quoting";
  return null;
}
