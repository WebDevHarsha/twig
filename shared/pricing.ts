/**
 * Deterministic pricing engine for custom datasets.
 *
 * IMPORTANT: quotes are derived ONLY from these rules and the structured
 * specification. The LLM never invents prices or feasibility; it only produces
 * the structured specification that feeds this engine.
 */

/** USD price for a custom dataset. Currency constant for now. */
export const CUSTOM_CURRENCY = "USD";

const BASE_PRICE_USD = 29;
const PER_SYSTEM_PRICE_USD = 18;
const PER_REGION_PRICE_USD = 24;
const PER_METRIC_PRICE_USD = 12;
const BASE_DELIVERY_HOURS = 4;
const HOURS_PER_SYSTEM = 1;
const HOURS_PER_RUN = 0.5;

/** Max supported providers/systems in one custom job (worker feasibility). */
export const MAX_SYSTEMS = 20;

export function quoteCustomBenchmark(input: {
  systemCount: number;
  metricCount: number;
  geographyCount: number;
  runsPerSystem: number;
}): {
  estimated_price: number;
  currency: string;
  estimated_delivery_hours: number;
  breakdown: { label: string; value: string }[];
  feasible: boolean;
  feasibility_note: string;
} {
  const breakdown: { label: string; value: string }[] = [];

  breakdown.push({ label: "Base dataset build", value: `$${BASE_PRICE_USD.toFixed(2)}` });

  const systemCost = input.systemCount * PER_SYSTEM_PRICE_USD;
  breakdown.push({
    label: `Target systems (${input.systemCount} × $${PER_SYSTEM_PRICE_USD})`,
    value: `$${systemCost.toFixed(2)}`,
  });

  const regionCost = input.geographyCount * PER_REGION_PRICE_USD;
  breakdown.push({
    label: `Coverage regions (${input.geographyCount} × $${PER_REGION_PRICE_USD})`,
    value: `$${regionCost.toFixed(2)}`,
  });

  const metricCost = input.metricCount * PER_METRIC_PRICE_USD;
  breakdown.push({
    label: `Metrics (${input.metricCount} × $${PER_METRIC_PRICE_USD})`,
    value: `$${metricCost.toFixed(2)}`,
  });

  const total = BASE_PRICE_USD + systemCost + regionCost + metricCost;

  const deliveryHours = Math.ceil(
    BASE_DELIVERY_HOURS +
      input.systemCount * HOURS_PER_SYSTEM +
      (input.runsPerSystem / 2) * HOURS_PER_RUN
  );

  const feasible =
    input.systemCount <= MAX_SYSTEMS && input.metricCount >= 1 && input.systemCount >= 1;

  return {
    estimated_price: Math.round(total * 100) / 100,
    currency: CUSTOM_CURRENCY,
    estimated_delivery_hours: deliveryHours,
    breakdown,
    feasible,
    feasibility_note: feasible
      ? `Benchmark-only feasibility: measurements are taken against TWIG's configured, allow-listed public test endpoints (${input.runsPerSystem} runs per system). Results reflect test conditions, not universal provider performance.`
      : `Not feasible within automated limits (${input.systemCount} systems > ${MAX_SYSTEMS}). Reduce the number of target systems.`,
  };
}
