import { z } from "zod";
import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { forbidden, handleRoute, notFound, ok, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

const idBody = z.object({ id: z.string().uuid() }).partial();

/** GET /api/orders/[id] — owner-only order detail with download info when paid. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const parsed = idBody.safeParse({ id });
    if (!parsed.success) {
      return Response.json(
        { error: { code: "validation_error", message: "id must be a UUID." } },
        { status: 400 }
      );
    }
    const user = await getServerUser();
    if (!user) throw forbidden("Sign in to view your orders.");
    const admin = getAdminClient();
    if (!admin) {
      return Response.json(
        { error: { code: "unavailable", message: "Supabase is not configured." } },
        { status: 503 }
      );
    }

    const { data, error } = await admin
      .from("orders")
      .select(
        "id, buyer_id, dataset_id, custom_request_id, amount, currency, payment_status, paypal_order_id, created_at, dataset:datasets(name, slug, format)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as
      | (Record<string, unknown> & { buyer_id: string; dataset_id: string | null; payment_status: string })
      | null;
    if (!row) throw notFound("Order not found.");
    if (row.buyer_id !== user.id) throw forbidden("This order belongs to a different account.");

    const payload: Record<string, unknown> = {
      id: row.id,
      dataset_id: row.dataset_id,
      custom_request_id: row.custom_request_id,
      amount: row.amount,
      currency: row.currency,
      payment_status: row.payment_status,
      created_at: row.created_at,
      dataset: row.dataset ?? null,
    };
    if (row.payment_status === "completed" && row.dataset_id) {
      payload.download_url = `/api/datasets/${row.dataset_id}/download`;
    }
    return ok({ order: payload });
  });
}

/** Body parser kept for symmetry with other [id] routes (no-op payload). */
export async function POST(request: Request) {
  await parseBody(request, idBody);
  return Response.json(
    { error: { code: "not_supported", message: "Use /api/orders (POST) to create orders." } },
    { status: 405 }
  );
}
