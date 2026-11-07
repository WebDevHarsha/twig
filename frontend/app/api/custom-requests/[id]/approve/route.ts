import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { forbidden, handleRoute, notFound, ok, fail } from "@/lib/api";
import { createOrderFor, ensurePaypalOrder } from "@/lib/payments";
import { isPaypalConfigured } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * POST /api/custom-requests/[id]/approve
 *
 * Buyer approves the quote: marks the request approved and creates the order
 * (price taken from custom_requests.estimated_price in the DB). Then creates
 * (or reuses) the PayPal order. Payment completion is handled by
 * /api/payments/capture, never from client-side messages.
 */
export async function POST(
  _request: Request,
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

    const { data, error } = await admin
      .from("custom_requests")
      .select("id, buyer_id, status, estimated_price")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? null) as
      | { id: string; buyer_id: string; status: string; estimated_price: number | null }
      | null;
    if (!row) throw notFound("Custom request not found.");
    if (row.buyer_id !== user.id) {
      throw forbidden("This request belongs to a different account.");
    }
    if (row.estimated_price === null) {
      return fail(409, "conflict", "This request has no payable quote. Re-quote it first.");
    }
    if (["paid", "in_progress", "delivered"].includes(row.status)) {
      return fail(409, "conflict", "This request has already been approved.");
    }

    const order = await createOrderFor(user.id, { customRequestId: row.id });
    const paypal = await ensurePaypalOrder(order);

    return ok({
      order: {
        id: order.id,
        custom_request_id: order.custom_request_id,
        amount: order.amount,
        currency: order.currency,
        payment_status: order.payment_status,
      },
      paypal: {
        configured: isPaypalConfigured(),
        order_id: "paypalOrderId" in paypal ? paypal.paypalOrderId : null,
        error: "error" in paypal ? paypal.error : null,
        environment: (process.env.PAYPAL_BASE_URL ?? "").includes("sandbox")
          ? "sandbox"
          : "live",
      },
    });
  });
}
