import { getServerUser } from "@/lib/supabase/server";
import { handleRoute, ok, parseBody, fail } from "@/lib/api";
import { paymentCreateSchema } from "@/lib/contracts";
import { loadOrderForBuyer, ensurePaypalOrder } from "@/lib/payments";
import { isPaypalConfigured } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/create
 * Creates (or reuses) the PayPal order for an internal order using the
 * amount from our own database.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw fail(401, "unauthorized", "Sign in to continue.");
    const body = await parseBody(request, paymentCreateSchema);

    const order = await loadOrderForBuyer(body.order_id, user.id);
    if (!order) throw fail(404, "not_found", "Order not found.");
    if (order.payment_status === "completed") {
      return fail(409, "conflict", "This order is already paid.");
    }
    if (order.payment_status !== "pending") {
      return fail(409, "conflict", `Order is ${order.payment_status}; only pending orders can be paid.`);
    }

    const result = await ensurePaypalOrder(order);
    if ("error" in result) {
      return fail(503, "paypal_unavailable", result.error);
    }

    return ok({
      paypal_order_id: result.paypalOrderId,
      reused: result.reuse,
      amount: order.amount,
      currency: order.currency,
      checkout: {
        client_id: process.env.PAYPAL_CLIENT_ID ?? "",
        currency: order.currency,
        environment: (process.env.PAYPAL_BASE_URL ?? "").includes("sandbox") ? "sandbox" : "live",
      },
      paypal_configured: isPaypalConfigured(),
    });
  });
}
