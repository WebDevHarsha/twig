import { randomUUID } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  isPaypalConfigured,
  paypalCreateOrder,
  describePaypalError,
} from "@/lib/paypal";

/**
 * Order + payment orchestration.
 *
 * Security invariants:
 *  - Amounts ALWAYS come from the database (datasets.price or
 *    custom_requests.estimated_price) — never from a client payload.
 *  - Entitlements are granted ONLY after a successful server-side capture with
 *    a verified order status and matching amount. The frontend success screen
 *    is never trusted on its own.
 *  - Every grant path is idempotent (unique indexes on
 *    entitlements(order_id, dataset_id) and orders(paypal_capture_id), plus
 *    payment_events(event_id)) so webhooks and retried captures can never
 *    grant duplicate access.
 */

export interface OrderRow {
  id: string;
  buyer_id: string;
  dataset_id: string | null;
  custom_request_id: string | null;
  amount: number;
  currency: string;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  payment_status: string;
}

interface DatasetMinimal {
  id: string;
  name: string;
  price: number;
  currency: string;
  slug: string;
}

async function fetchOrder(orderId: string): Promise<OrderRow | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load order: ${error.message}`);
  return (data as unknown as OrderRow) ?? null;
}

/** Create an internal order row. The caller must be authenticated as buyerId. */
export async function createOrderFor(
  buyerId: string,
  target: { datasetId?: string; customRequestId?: string }
): Promise<OrderRow> {
  const admin = getAdminClient();
  if (!admin) throw new Error("Supabase is not configured.");

  if (target.datasetId) {
    const { data, error } = await admin
      .from("datasets")
      .select("id, name, slug, price, currency, status")
      .eq("id", target.datasetId)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(`Failed to load dataset: ${error.message}`);
    const ds = data as unknown as DatasetMinimal | null;
    if (!ds) throw new Error("Dataset not found.");

    // If the buyer already owns it, refuse a duplicate purchase.
    const { count, error: entErr } = await admin
      .from("entitlements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", buyerId)
      .eq("dataset_id", ds.id);
    if (entErr) throw new Error(`Failed to check entitlements: ${entErr.message}`);
    if ((count ?? 0) > 0) {
      throw new Error("You already own this dataset.");
    }

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        buyer_id: buyerId,
        dataset_id: ds.id,
        amount: Number(ds.price),
        currency: ds.currency || "USD",
        pricer_source: "db",
        payment_status: "pending",
      })
      .select()
      .single();
    if (orderErr) throw new Error(`Failed to create order: ${orderErr.message}`);
    return order as unknown as OrderRow;
  }

  if (target.customRequestId) {
    const { data, error } = await admin
      .from("custom_requests")
      .select("id, status, estimated_price, currency")
      .eq("id", target.customRequestId)
      .eq("buyer_id", buyerId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load custom request: ${error.message}`);
    const cr = data as
      | { id: string; status: string; estimated_price: number | null; currency: string }
      | null;
    if (!cr) throw new Error("Custom request not found.");
    if (cr.status !== "quoted" && cr.status !== "approved") {
      throw new Error(`Custom request is not payable from status "${cr.status}".`);
    }
    if (cr.estimated_price === null) {
      throw new Error("Custom request has not been quoted yet.");
    }

    // Idempotency: one order per (custom_request, buyer) unless the previous
    // order failed or was cancelled — otherwise reuse the pending order.
    const { data: existingAll, error: exErr } = await admin
      .from("orders")
      .select("*")
      .eq("custom_request_id", cr.id)
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false });
    if (exErr) throw new Error(`Failed to check existing orders: ${exErr.message}`);
    const existing = ((existingAll ?? []) as unknown as OrderRow[]).find(
      (o) => o.payment_status === "pending"
    );
    if (existing) return existing;

    await admin
      .from("custom_requests")
      .update({ status: "approved" })
      .eq("id", cr.id)
      .eq("status", "quoted");

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        buyer_id: buyerId,
        custom_request_id: cr.id,
        amount: Number(cr.estimated_price),
        currency: cr.currency || "USD",
        pricer_source: "quote",
        payment_status: "pending",
      })
      .select()
      .single();
    if (orderErr) throw new Error(`Failed to create order: ${orderErr.message}`);
    return order as unknown as OrderRow;
  }

  throw new Error("Order target must be a dataset or an approved custom request.");
}

/** Create (or reuse) the PayPal order for an internal order. */
export async function ensurePaypalOrder(
  order: OrderRow
): Promise<{ paypalOrderId: string; reuse: boolean } | { error: string }> {
  if (!isPaypalConfigured()) {
    return {
      error:
        "PayPal Sandbox is not configured on this deployment. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable checkout.",
    };
  }
  if (order.paypal_order_id && order.payment_status === "pending") {
    return { paypalOrderId: order.paypal_order_id, reuse: true };
  }
  const description = order.dataset_id
    ? "TWIG dataset license"
    : "TWIG custom dataset build";
  try {
    const { paypalOrderId } = await paypalCreateOrder({
      amount: Number(order.amount).toFixed(2),
      currency: order.currency,
      customId: order.id,
      description,
    });
    const admin = getAdminClient();
    if (!admin) return { error: "Supabase is not configured." };
    const { error: updErr } = await admin
      .from("orders")
      .update({ paypal_order_id: paypalOrderId })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .is("paypal_order_id", null);
    if (updErr) throw new Error(`Failed to record PayPal order: ${updErr.message}`);
    return { paypalOrderId, reuse: false };
  } catch (error) {
    return { error: describePaypalError(error) };
  }
}

export type FinalizeResult =
  | {
      state: "completed";
      orderId: string;
      captureId: string | null;
      jobId?: string;
      datasetId?: string;
    }
  | { state: "failed" | "ineligible"; reason: string };

/** Verify a captured PayPal order and grant access idempotently. */
export async function finalizeCapturedOrder(
  order: OrderRow,
  capture: {
    status: string;
    captureId: string | null;
    capturedAmount: string | null;
    capturedCurrency: string | null;
  }
): Promise<FinalizeResult> {
  const admin = getAdminClient();
  if (!admin) return { state: "failed", reason: "Supabase is not configured." };

  if (order.payment_status === "completed") {
    // Already recorded (webhook beat the capture call, or duplicate retry).
    return {
      state: "completed",
      orderId: order.id,
      captureId: order.paypal_capture_id,
    };
  }

  if (capture.status !== "COMPLETED") {
    return { state: "ineligible", reason: `PayPal capture status is ${capture.status}.` };
  }

  // Verify the actual captured money matches the database amount.
  if (capture.capturedAmount == null || capture.capturedCurrency == null) {
    return { state: "failed", reason: "Capture response missing amount." };
  }
  const expected = Number(order.amount).toFixed(2);
  if (
    capture.capturedAmount !== expected ||
    capture.capturedCurrency.toUpperCase() !== order.currency.toUpperCase()
  ) {
    return {
      state: "ineligible",
      reason: `Amount mismatch: PayPal captured ${capture.capturedAmount} ${capture.capturedCurrency}, order expected ${expected} ${order.currency}.`,
    };
  }

  // Record the transaction. paypal_capture_id is UNIQUE — a conflicting
  // insert marks this capture as already processed (idempotent).
  const { error: updErr } = await admin
    .from("orders")
    .update({
      payment_status: "completed",
      paypal_capture_id: capture.captureId ?? null,
    })
    .eq("id", order.id)
    .eq("payment_status", "pending");
  if (updErr) {
    return { state: "failed", reason: `Failed to record payment: ${updErr.message}` };
  }

  if (order.dataset_id) {
    // Idempotent grant thanks to entitlements(order_id, dataset_id) unique.
    const { error: grantErr } = await admin
      .from("entitlements")
      .upsert(
        {
          user_id: order.buyer_id,
          dataset_id: order.dataset_id,
          order_id: order.id,
        },
        { onConflict: "order_id,dataset_id", ignoreDuplicates: true }
      );
    if (grantErr) {
      return { state: "failed", reason: `Failed to grant access: ${grantErr.message}` };
    }
    return {
      state: "completed",
      orderId: order.id,
      captureId: capture.captureId,
      datasetId: order.dataset_id,
    };
  }

  if (order.custom_request_id) {
    // Paying for a custom request creates the worker job exactly once
    // (jobs.custom_request_id is UNIQUE).
    const { data: existingJob, error: jobSelErr } = await admin
      .from("jobs")
      .select("id")
      .eq("custom_request_id", order.custom_request_id)
      .maybeSingle();
    if (jobSelErr) {
      return { state: "failed", reason: `Failed to check jobs: ${jobSelErr.message}` };
    }
    let jobId = (existingJob as { id: string } | null)?.id;
    if (!jobId) {
      const { data: job, error: jobErr } = await admin
        .from("jobs")
        .insert({ custom_request_id: order.custom_request_id, status: "pending" })
        .select("id")
        .single();
      if (jobErr) {
        return { state: "failed", reason: `Failed to create job: ${jobErr.message}` };
      }
      jobId = (job as { id: string }).id;
    }
    await admin
      .from("custom_requests")
      .update({ status: "paid" })
      .eq("id", order.custom_request_id)
      .neq("status", "delivered");
    return {
      state: "completed",
      orderId: order.id,
      captureId: capture.captureId,
      jobId,
    };
  }

  return { state: "failed", reason: "Order has neither dataset nor custom request." };
}

export async function markOrderFailed(orderId: string, reason: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  await admin
    .from("orders")
    .update({ payment_status: "failed" })
    .eq("id", orderId)
    .eq("payment_status", "pending");
  console.warn(`[payments] order ${orderId} failed: ${sanitizeErrorMessage(reason)}`);
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 500);
}

/** Record a webhook event idempotently; returns false if already seen. */
export async function recordPaymentEvent(args: {
  eventId: string;
  eventType: string | null;
  orderId: string | null;
  payload: unknown;
}): Promise<boolean> {
  const admin = getAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("payment_events").insert({
    event_id: args.eventId,
    event_type: args.eventType,
    order_id: args.orderId,
    payload: args.payload as object,
  });
  // 23505 = unique_violation → duplicate event; treat as processed.
  if (error && (error as { code?: string }).code === "23505") {
    return false;
  }
  if (error) {
    console.warn("[payments] failed to record payment event", error.message);
    return true;
  }
  return true;
}

export function newInternalId(): string {
  return randomUUID();
}

export async function loadOrderForBuyer(
  orderId: string,
  buyerId: string
): Promise<OrderRow | null> {
  const order = await fetchOrder(orderId);
  if (!order || order.buyer_id !== buyerId) return null;
  return order;
}
