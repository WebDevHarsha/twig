/**
 * Agent orchestrator: intent → real catalog search → (optional) LLM ranking →
 * reasons → custom-request proposal when nothing fits.
 *
 * Invariants:
 *  - Recommendations can only reference datasets fetched from the catalog.
 *  - The proposal quoted to the user always comes from @tw/pricing.
 *  - The agent can never authorize or capture payments.
 */
import { z } from "zod";
import type { ChatResponse, DatasetSummary } from "@tw/contracts";
import { quoteCustomBenchmark } from "@tw/pricing";
import { fallbackIntent, intentSchema, type Intent } from "@/lib/ai/intent";
import { generateSpec } from "@/lib/ai/spec";
import { listDatasets } from "@/lib/data";
import { aiConfigured, chatJson } from "@/lib/ai/llm";

const selectionSchema = z.object({
  matches: z
    .array(
      z.object({
        dataset_id: z.string(),
        fit_score: z.number().min(0).max(100),
        reason: z.string().max(400),
      })
    )
    .max(3),
  want_custom: z.boolean().default(false),
});

function candidateLine(d: DatasetSummary): string {
  return `- id=${d.id} | ${d.name} | category=${d.category} | coverage=${d.coverage.slice(0, 120)} | ${d.description.slice(0, 220)}`;
}

/** Keyword-overlap scorer for fallback mode. */
function scoreDataset(intent: Intent, dataset: DatasetSummary): { score: number; reasonParts: string[] } {
  const text = `${dataset.name}\n${dataset.description}\n${dataset.coverage}\n${dataset.category}`.toLowerCase();
  const parts: string[] = [];
  let score = 0;

  const kw = intent.keywords.length ? intent.keywords : [];
  let kwHits = 0;
  for (const k of kw) {
    if (text.includes(k)) kwHits++;
  }
  if (kw.length) {
    score += Math.round((kwHits / kw.length) * 60);
    if (kwHits) parts.push(`matched ${kwHits} of your keywords`);
  }

  if (intent.topic === "payment_api" && (dataset.category === "payments" || text.includes("payment"))) {
    score += 20;
    parts.push("covers payment APIs");
  }
  if (
    (intent.topic === "uptime" && text.includes("uptime")) ||
    (intent.topic === "regional_performance" && text.includes("region")) ||
    (intent.topic === "api_performance" && /latency|performance|benchmark/.test(text))
  ) {
    score += 15;
    parts.push("matches the kind of data you asked about");
  }
  if (intent.geography && text.includes(intent.geography.toLowerCase())) {
    score += 20;
    parts.push(`covers ${intent.geography}`);
  }
  return { score: Math.min(100, score), reasonParts: parts };
}

export async function agentReply(userPrompt: string): Promise<ChatResponse> {
  // 1. Intent ------------------------------------------------------------
  let intent: Intent;
  let mode: "ai" | "fallback" = aiConfigured() ? "ai" : "fallback";
  if (aiConfigured()) {
    const res = await chatJson({ system: intentSystemPrompt(), user: userPrompt, schema: intentSchema });
    if (res.ok) {
      intent = res.value;
    } else {
      intent = fallbackIntent(userPrompt);
      mode = "fallback";
    }
    // 3. Select from real catalog ----------------------------------------
    const { items } = await listDatasets({ limit: 60 });
    const sel = await chatJson({
      system: selectionSystemPrompt(),
      user: `Buyer request:\n"""${userPrompt.slice(0, 2000)}"""\n\nAvailable datasets:\n${items.map(candidateLine).join("\n")}`,
      schema: selectionSchema,
    });    if (sel.ok) {
      // Keep only ids that exist in the catalog.
      const byId = new Map(items.map((d) => [d.id, d]));
      const recommendations = sel.value.matches
        .filter((m) => byId.has(m.dataset_id) && m.fit_score >= 25)
        .slice(0, 3)
        .map((m) => {
          const d = byId.get(m.dataset_id) as DatasetSummary;
          return {
            dataset_id: d.id,
            slug: d.slug,
            name: d.name,
            price: d.price,
            currency: d.currency,
            reason: m.reason,
            coverage: d.coverage,
            freshness: d.freshness,
            format: d.format,
            category: d.category,
          };
        });
      return await buildFinal(intent, recommendations, sel.value.want_custom, mode, userPrompt);
    }
    mode = "fallback";
  } else {
    intent = fallbackIntent(userPrompt);
  }

  // 4. Fallback: deterministic search -------------------------------------
  const { items } = await listDatasets({ limit: 60 });
  const scored = items
    .map((d) => ({ d, ...scoreDataset(intent, d) }))
    .filter((s) => s.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ d, reasonParts }) => ({
      dataset_id: d.id,
      slug: d.slug,
      name: d.name,
      price: d.price,
      currency: d.currency,
      reason: reasonParts.length
        ? `Matches because it ${reasonParts.join(", ")} (deterministic keyword match, demo/fallback mode).`
        : "Closest catalog match in demo/fallback mode.",
      coverage: d.coverage,
      freshness: d.freshness,
      format: d.format,
      category: d.category,
    }));
  return await buildFinal(intent, scored, scored.length === 0, mode, userPrompt);
}

async function buildFinal(
  intent: Intent,
  recommendations: ChatResponse["recommendations"],
  wantCustom: boolean,
  mode: "ai" | "fallback",
  userPrompt: string
): Promise<ChatResponse> {
  let customProposal: ChatResponse["custom_request_proposal"] = null;

  if (wantCustom || recommendations.length === 0) {
    const { spec } = await generateSpec(userPrompt, intent);
    // Guard: metrics/systems from the generated spec drive the quote engine.
    const quote = quoteCustomBenchmark({
      systemCount: spec.target_systems.length,
      metricCount: spec.metrics.length,
      geographyCount: 1,
      runsPerSystem: spec.time_scope.runs_per_system,
    });
    customProposal = {
      suggested_prompt: `Collect ${spec.geography === "Global" ? "global" : spec.geography} API latency benchmarks for ${spec.target_systems
        .map((t) => t.provider_label)
        .join(", ")} — I approve a custom dataset quotation for this.`,
      estimated_price: quote.estimated_price,
      estimated_delivery_hours: quote.estimated_delivery_hours,
      note: quote.feasibility_note,
    };
  }

  const reply = composeReply(intent, recommendations, customProposal, mode);
  return { reply, intent: {
      topic: intent.topic,
      geography: intent.geography,
      providers: intent.providers,
      wants_custom: intent.wants_custom || (recommendations.length === 0),
    }, recommendations, custom_request_proposal: customProposal, mode };
}

function composeReply(
  intent: Intent,
  recommendations: ChatResponse["recommendations"],
  customProposal: ChatResponse["custom_request_proposal"],
  mode: "ai" | "fallback"
): string {
  const parts: string[] = [];
  const geo = intent.geography ? ` for ${intent.geography}` : "";
  if (recommendations.length) {
    parts.push(
      `I searched the TWIG catalog${geo} for data about "${intent.topic.replace(/_/g, " ")}" and found ${recommendations.length} match${recommendations.length > 1 ? "es" : ""}:`
    );
    recommendations.forEach((r, i) => {
      parts.push(
        `${i + 1}. **${r.name}** — ${r.price} ${r.currency}. ${r.reason} Coverage: ${r.coverage} Freshness: ${r.freshness}.`
      );
    });
  }
  if (customProposal) {
    if (recommendations.length) {
      parts.push("None of the existing datasets fully cover your ask, though.");
    }
    parts.push(
      customProposal.note ?? "",
      `I can turn this into a custom dataset request priced at **${customProposal.estimated_price} USD**, delivered in about ${customProposal.estimated_delivery_hours} hours. Use the suggested prompt below, then approve the quote on the custom request page.`
    );
    parts.push(`Suggested prompt: “${customProposal.suggested_prompt}”`);
  }
  if (parts.length === 0) {
    parts.push(
      "I couldn't confidently match a catalog dataset, and automated quoting needs at least one provider or metric. Try mentioning providers (e.g. PayPal, Razorpay, Stripe) and a region such as India."
    );
  }
  if (mode === "fallback") {
    parts.push("_(AI assistant is in deterministic demo mode — reply text is rule-generated, dataset data and prices always come from the real catalog.)_");
  }
  return parts.join("\n\n");
}

function intentSystemPrompt() {
  return `You classify a buyer's data request for a data marketplace.
Return ONLY JSON matching exactly:
{"topic": "payment_api"|"api_performance"|"uptime"|"regional_performance"|"other",
 "geography": string|null, "providers": string[], "wants_custom": boolean, "keywords": string[]}
geography: country/region mentioned by the user, else null.
providers: product names the user mentions.
wants_custom: true when the user asks TWIG to collect/build data for them.
keywords: 3-8 lowercase catalog search keywords.
Never invent dataset names, ids, prices or measurements.`;
}

function selectionSystemPrompt() {
  return `You are a strict search assistant for a data marketplace.
Given a buyer request and the REAL catalog, select the datasets that genuinely match.
Return ONLY JSON: {"matches": [{"dataset_id": "...", "fit_score": 0-100, "reason": "..."}], "want_custom": boolean}
HARD RULES:
- dataset_id MUST be copied verbatim from the provided list; inventing ids is forbidden.
- At most 3 matches, best-first, only with fit_score >= 50.
- want_custom is true when no listed dataset fully satisfies the request.
- Reasons must explain the fit; never invent dataset contents or prices.`;
}
