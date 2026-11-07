import { NextRequest } from "next/server";
import {
  verifyWebhookSignature,
  paypalGetOrder,
  describePaypalError,
  isPaypalConfigured,
} from "@/lib/paypal";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  recordPaymentEvent,
  finalizeCapturedOrder,
  type OrderRow,
} from "@/lib/payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/payments/webhook
 *
 * PayPal webhook receiver. Every event is signature-verified using
 * PAYPAL_WEBHOOK_ID; only then is it reconciled. Webhooks alone can grant
 * entitlements because the reconcile step re-verifies the order status and
 * amount with the Orders API, and all DB writes are idempotent (unique event
 * id + unique capture id + unique entitlement pair).
 */
export async function POST(request: NextRequest) {
  if (!isPaypalConfigured()) {
    return Response.json(
      { error: { code: "unavailable", message: "PayPal is not configured." } },
      { status: 503 }
    );
  }
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return Response.json(
      { error: { code: "unavailable", message: "PAYPAL_WEBHOOK_ID is not configured; webhook verification is impossible." } },
      { status: 503 }
    );
  }

  let rawEvent: unknown;
  try {
    rawEvent = await request.json();
  } catch {
    return Response.json(
      { error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 }
    );
  }

  const event = rawEvent as {
    id?: string;
    event_type?: string;
    resource?: {
      id?: string;
      custom_id?: string;
      status?: string;
      amount?: { value?: string; currency_code?: string };
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  };

  const verified = await verifyWebhookSignature({
    authAlgo: request.headers.get("paypal-auth-algo"),
    certUrl: request.headers.get("paypal-cert-url"),
    transmissionId: request.headers.get("paypal-transmission-id"),
    transmissionSig: request.headers.get("paypal-transmission-sig"),
    transmissionTime: request.headers.get("paypal-transmission-time"),
    webhookEvent: rawEvent,
  });
  if (!verified.verified) {
    console.warn("[webhook] signature verification failed:", verified.error ?? "unknown");
    return Response.json(
      { error: { code: "verification_failed", message: "Webhook signature could not be verified." } },
      { status: 400 }
    );
  }

  // Idempotency gate: duplicate event ids are ignored.
  const isFirstSeen = await recordPaymentEvent({
    eventId: event.id ?? `generated-${Date.now()}`,
    eventType: event.event_type ?? null,
    orderId: null,
    payload: rawEvent,
  });
  if (!isFirstSeen) {
    return Response.json({ received: true, duplicate: true });
  }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED" && event.event_type !== "CHECKOUT.ORDER.APPROVED") {
    return Response.json({ received: true, handled: false });
  }

  const admin = getAdminClient();
  if (!admin) {
    return Response.json({ received: true, handled: false, reason: "supabase-not-configured" });
  }

  // Locate the internal order via the capture's custom_id (set at creation).
  let orderId = event.resource?.custom_id ?? null;
  if (!orderId && event.resource?.supplementary_data?.related_ids?.order_id) {
    const { data } = await admin
      .from("orders")
      .select("id")
      .eq("paypal_order_id", event.resource.supplementary_data.related_ids.order_id)
      .maybeSingle();
    orderId = (data as { id: string } | null)?.id ?? null;
  }
  if (!orderId) {
    return Response.json({ received: true, handled: false, reason: "no-order-link" });
  }

  try {
    let order: OrderRow | null = null;
    const { data } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    order = (data as unknown as OrderRow) ?? null;
    if (!order) return Response.json({ received: true, handled: false });

    if (order.payment_status === "completed") {
      return Response.json({ received: true, handled: true, already_settled: true });
    }

    // Re-verify against the Orders API rather than trusting the event body.
    if (!order.paypal_order_id) {
      return Response.json({ received: true, handled: false });
    }
    const paypalOrder = await paypalGetOrder(order.paypal_order_id);
    const capture = paypalOrder.purchaseUnits?.[0]?.payments?.captures?.[0];
    if (paypalOrder.status !== "COMPLETED" || !capture) {
      return Response.json({ received: true, handled: false, paypal_status: paypalOrder.status });
    }

    const result = await finalizeCapturedOrder(order, {
      status: "COMPLETED",
      captureId: capture.id ?? null,
      capturedAmount: capture.amount?.value ?? null,
      capturedCurrency: capture.amount?.currencyCode ?? null,
    });
    return Response.json({ received: true, handled: result.state === "completed" });
  } catch (error) {
    console.error("[webhook] reconcile failed:", describePaypalError(error));
    // 500 makes PayPal retry later.
    return Response.json(
      { error: { code: "internal", message: "Failed to reconcile webhook." } },
      { status: 500 }
    );
  }
}
