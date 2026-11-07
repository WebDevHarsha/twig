import { z } from "zod";

/**
 * Structured intent extraction for the agent.
 * The LLM only classifies user language; it never names datasets or prices.
 */

export const intentSchema = z.object({
  topic: z.enum(["payment_api", "api_performance", "uptime", "regional_performance", "other"]),
  geography: z.string().nullable(),
  providers: z.array(z.string()).default([]),
  wants_custom: z.boolean(),
  keywords: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof intentSchema>;

/** Deterministic keyword extractor used when AI is missing/unhealthy. */
export function fallbackIntent(prompt: string): Intent {
  const lower = prompt.toLowerCase();
  const providers = ["paypal", "razorpay", "stripe", "square", "adyen", "braintree", "upi", "paytm"].filter(
    (p) => lower.includes(p)
  );
  const geoList = ["india", "united states", "usa", "europe", "eu", "apac", "global", "singapore", "germany", "brazil", "uk"];
  const geography = geoList.find((g) => lower.includes(g)) ?? null;

  let topic: Intent["topic"] = "other";
  if (lower.includes("uptime") || lower.includes("availab") || lower.includes("outage")) topic = "uptime";
  else if (lower.includes("region") || lower.includes("comparison")) topic = "regional_performance";
  else if (lower.includes("pay") || providers.length > 0) topic = "payment_api";
  else if (lower.includes("latency") || lower.includes("api")) topic = "api_performance";

  const stop = new Set(["the", "for", "and", "with", "need", "want", "have", "data", "dataset", "find", "get", "i", "a", "an", "please", "in"]);
  const keywords = Array.from(
    new Set(
      lower
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stop.has(w))
    )
  ).slice(0, 8);

  return {
    topic,
    geography,
    providers,
    wants_custom: /\b(custom|build|collect|specific|benchmark mine)\b/.test(lower),
    keywords,
  };
}
