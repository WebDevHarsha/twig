import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { unauthorized, handleRoute, ok, parseBody, jsonClone } from "@/lib/api";
import { createCustomRequestSchema } from "@/lib/contracts";
import type { BenchmarkSpec, Quote } from "@tw/contracts";
import { fallbackIntent } from "@/lib/ai/intent";
import { generateSpec, validateSpec } from "@/lib/ai/spec";
import { quoteCustomBenchmark } from "@tw/pricing";

export const dynamic = "force-dynamic";

/** GET /api/custom-requests — the buyer's custom request list. */
export async function GET() {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw unauthorized();
    const admin = getAdminClient();
    if (!admin) {
      return Response.json(
        { error: { code: "unavailable", message: "Supabase is not configured." } },
        { status: 503 }
      );
    }
    const { data, error } = await admin
      .from("custom_requests")
      .select(
        "id, original_prompt, specification_json, estimated_price, currency, estimated_delivery_hours, status, created_at, job:jobs(id, status, progress, stage, error_message, completed_at)"
      )
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return ok({ custom_requests: data ?? [] });
  });
}

/**
 * POST /api/custom-requests — AI turns the prompt into a structured spec;
 * price + feasibility always come from the deterministic quote engine.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw unauthorized("Sign in to submit a custom request.");
    const body = await parseBody(request, createCustomRequestSchema);

    const admin = getAdminClient();
    if (!admin) {
      return Response.json(
        { error: { code: "unavailable", message: "Supabase is not configured; custom requests cannot be stored." } },
        { status: 503 }
      );
    }

    const intent = fallbackIntent(body.prompt);
    const { spec: rawSpec, mode, note } = await generateSpec(body.prompt, intent);
    const specError = validateSpec(rawSpec);
    if (!rawSpec || specError) {
      return Response.json(
        {
          error: {
            code: "unsupported_request",
            message:
              specError ??
              "This request cannot be turned into an automated collection job. Currently only API benchmark jobs are supported.",
          },
        },
        { status: 422 }
      );
    }

    const spec = rawSpec as BenchmarkSpec;
    const quote = quoteCustomBenchmark({
      systemCount: spec.target_systems.length,
      metricCount: spec.metrics.length,
      geographyCount: 1,
      runsPerSystem: spec.time_scope.runs_per_system,
    });
    if (!quote.feasible) {
      // Still store as draft but do not quote — explains the failure.
      const { data: row, error: insErr } = await admin
        .from("custom_requests")
        .insert({
          buyer_id: user.id,
          original_prompt: body.prompt,
          specification_json: spec,
          status: "draft",
          currency: quote.currency,
        })
        .select()
        .single();
      if (insErr) throw new Error(insErr.message);
      return ok(
        {
          custom_request: row,
          quote: { ...quote, estimated_price: null, estimated_delivery_hours: null },
          spec_mode: mode,
          note: note ?? null,
        },
        201
      );
    }

    const { data: row, error: insErr } = await admin
      .from("custom_requests")
      .insert({
        buyer_id: user.id,
        original_prompt: body.prompt,
        specification_json: spec,
        estimated_price: quote.estimated_price,
        estimated_delivery_hours: quote.estimated_delivery_hours,
        currency: quote.currency,
        status: "quoted",
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    return ok(
      {
        custom_request: row,
        spec: jsonClone(spec),
        quote: quote satisfies Quote,
        spec_mode: mode,
        note: note ?? null,
      },
      201
    );
  });
}
