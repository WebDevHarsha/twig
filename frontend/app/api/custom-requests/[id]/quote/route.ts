import { handleRoute, ok, forbidden, notFound } from "@/lib/api";
import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { quoteCustomBenchmark } from "@tw/pricing";
import type { BenchmarkSpec, Quote } from "@tw/contracts";
import { fallbackIntent } from "@/lib/ai/intent";
import { generateSpec } from "@/lib/ai/spec";

export const dynamic = "force-dynamic";

/**
 * POST /api/custom-requests/[id]/quote
 *
 * Deterministically re-quotes a custom request from its stored specification.
 * Optional body {"reprocess": true} regenerates the specification from the
 * original prompt through the AI layer; price and feasibility always come
 * from the quote engine, never the LLM. Blocked once the request is paid.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) throw forbidden("Sign in to continue.");
    const admin = getAdminClient();
    if (!admin) {
      return Response.json(
        { error: { code: "unavailable", message: "Supabase is not configured." } },
        { status: 503 }
      );
    }

    let reprocess = false;
    try {
      const body = (await request.json()) as { reprocess?: boolean };
      reprocess = Boolean(body?.reprocess);
    } catch {
      reprocess = false;
    }

    const { data, error } = await admin
      .from("custom_requests")
      .select(
        "id, buyer_id, original_prompt, specification_json, estimated_price, estimated_delivery_hours, currency, status"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? null) as
      | {
          id: string;
          buyer_id: string;
          original_prompt: string;
          specification_json: BenchmarkSpec | null;
          estimated_price: number | null;
          estimated_delivery_hours: number | null;
          currency: string;
          status: string;
        }
      | null;
    if (!row) throw notFound("Custom request not found.");
    if (row.buyer_id !== user.id) {
      throw forbidden("This request belongs to a different account.");
    }
    if (["paid", "in_progress", "delivered"].includes(row.status)) {
      return Response.json(
        { error: { code: "conflict", message: "This request is already paid and cannot be re-quoted." } },
        { status: 409 }
      );
    }

    let spec: BenchmarkSpec | null = row.specification_json;
    let mode: "ai" | "fallback" = "fallback";
    let note: string | null = null;

    if (reprocess || !spec) {
      const result = await generateSpec(row.original_prompt, fallbackIntent(row.original_prompt));
      spec = result.spec;
      mode = result.mode;
      note = result.note ?? null;
      await admin.from("custom_requests").update({ specification_json: spec }).eq("id", row.id);
    }

    const quote: Quote = quoteCustomBenchmark({
      systemCount: spec?.target_systems?.length ?? 0,
      metricCount: spec?.metrics?.length ?? 0,
      geographyCount: 1,
      runsPerSystem: spec?.time_scope?.runs_per_system ?? 8,
    });

    if (quote.feasible) {
      // Only pending (not-yet-paid) requests may receive a fresh quote.
      await admin
        .from("custom_requests")
        .update({
          estimated_price: quote.estimated_price,
          estimated_delivery_hours: quote.estimated_delivery_hours,
          currency: quote.currency,
          status: "quoted",
        })
        .eq("id", row.id)
        .in("status", ["draft", "quoted"]);
    }

    return ok({ quote, spec, spec_mode: mode, note });
  });
}
