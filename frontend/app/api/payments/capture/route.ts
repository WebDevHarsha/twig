import { NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { handleRoute, ok, parseBody, fail } from "@/lib/api";
import { paymentCaptureSchema } from "@/lib/contracts";
import {
  loadOrderForBuyer,
  finalizeCapturedOrder,
  markOrderFailed,
  type FinalizeResult,
} from "@/lib/payments";
import { paypalCaptureOrder, describePaypalError } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/capture
 * Server-side capture of a buyer-approved PayPal order. Access is granted
 * here — NOT from any client-side success flag. Idempotent: repeated calls
 * with the same order settle once.
 */
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw fail(401, "unauthorized", "Sign in to continue.");
    const body = await parseBody(request, paymentCaptureSchema);

    const order = await loadOrderForBuyer(body.order_id, user.id);
    if (!order) throw fail(404, "not_found", "Order not found.");

    if (!order.paypal_order_id) {
      return fail(409, "conflict", "This order has no PayPal payment attached yet.");
    }
    if (order.payment_status === "failed" || order.payment_status === "cancelled") {
      return fail(409, "conflict", `Order is ${order.payment_status}.`);
    }

    if (order.payment_status === "completed") {
      // Already settled (e.g. webhook arrived first).
      const res: FinalizeResult = {
        state: "completed",
        orderId: order.id,
        captureId: order.paypal_capture_id,
        datasetId: order.dataset_id ?? undefined,
      };
      return ok(res);
    }

    try {
      const capture = await paypalCaptureOrder(order.paypal_order_id);
      const result = await finalizeCapturedOrder(order, {
        status: capture.status,
        captureId: capture.captureId,
        capturedAmount: capture.capturedAmount,
        capturedCurrency: capture.capturedCurrency,
      });
      if (result.state !== "completed") {
        await markOrderFailed(order.id, result.reason);
        return fail(402, "payment_not_completed", result.reason);
      }
      return ok(result);
    } catch (error) {
      return fail(502, "paypal_capture_failed", describePaypalError(error));
    }
  });
}
