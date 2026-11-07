import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { forbidden, handleRoute, notFound, ok } from "@/lib/api";
import { jsonClone } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/custom-requests/[id] — owner-only detail with job state. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) throw forbidden("Sign in to view your requests.");
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
        "id, buyer_id, original_prompt, specification_json, estimated_price, currency, estimated_delivery_hours, status, created_at, job:jobs(id, status, progress, stage, result_storage_path, error_message, completed_at), orders(id, amount, currency, payment_status)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? null) as
      | (Record<string, unknown> & { buyer_id: string; specification_json: object })
      | null;
    if (!row) throw notFound("Custom request not found.");
    if (row.buyer_id !== user.id) {
      throw forbidden("This request belongs to a different account.");
    }

    const { specification_json: specObj, ...rest } = row;
    return ok({
      custom_request: {
        ...rest,
        specification_json: jsonClone(specObj),
      },
    });
  });
}
