/**
 * PayPal Orders API wrapper using the official server SDK
 * (@paypal/paypal-server-sdk). Sandbox by default; controlled by
 * PAYPAL_BASE_URL. Secrets stay server-side.
 */
import {
  Client,
  Environment,
  CheckoutPaymentIntent,
  ApiError,
  OrdersController,
  type Order,
} from "@paypal/paypal-server-sdk";

export function isPaypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function paypalEnvironment(): Environment {
  const base = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  return base.includes("sandbox") ? Environment.Sandbox : Environment.Production;
}

let clientInstance: Client | null = null;

export function paypalClient(): Client {
  if (!isPaypalConfigured()) {
    throw new Error("PayPal is not configured (missing PAYPAL_CLIENT_ID/SECRET).");
  }
  if (!clientInstance) {
    clientInstance = new Client({
      environment: paypalEnvironment(),
      clientCredentialsAuthCredentials: {
        oAuthClientId: process.env.PAYPAL_CLIENT_ID as string,
        oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET as string,
      },
    });
  }
  return clientInstance;
}

let ordersControllerInstance: OrdersController | null = null;

export function paypalOrdersController(): OrdersController {
  if (!ordersControllerInstance) {
    ordersControllerInstance = new OrdersController(paypalClient());
  }
  return ordersControllerInstance;
}

export interface CreatePaypalOrderInput {
  amount: string; // e.g. "49.00"
  currency: string; // e.g. "USD"
  customId: string; // internal order id for reconciliation
  description: string;
}

/** Create a PayPal order for the given amount (server-side price authority:
 *  the amount always comes from our database, never from the client). */
export async function paypalCreateOrder(
  input: CreatePaypalOrderInput
): Promise<{ paypalOrderId: string }> {
  const response = await paypalOrdersController().createOrder({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          amount: {
            currencyCode: input.currency,
            value: input.amount,
          },
          description: input.description.slice(0, 127),
          customId: input.customId,
        },
      ],
    },
    prefer: "return=representation",
  });
  const order = response.result;
  if (!order.id) throw new Error("PayPal did not return an order id.");
  return { paypalOrderId: order.id };
}

export interface CaptureResult {
  order: Order;
  captureId: string | null;
  status: string;
  capturedAmount: string | null;
  capturedCurrency: string | null;
}

/** Capture a previously-approved PayPal order. Returns full details so the
 *  caller can verify status AND amount before granting access. */
export async function paypalCaptureOrder(id: string): Promise<CaptureResult> {
  const response = await paypalOrdersController().captureOrder({
    id,
    prefer: "return=representation",
  });
  const order = response.result;
  const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0];
  return {
    order,
    captureId: capture?.id ?? null,
    status: order.status ?? "UNKNOWN",
    capturedAmount: capture?.amount?.value ?? null,
    capturedCurrency: capture?.amount?.currencyCode ?? null,
  };
}

/** Fetch order details (used to reconcile a webhook without re-capturing). */
export async function paypalGetOrder(id: string): Promise<Order> {
  const response = await paypalOrdersController().getOrder({ id });
  return response.result;
}

/** Human-readable message from an SDK ApiError. */
export function describePaypalError(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    const issues =
      body && typeof body === "object"
        ? (JSON.stringify(body).slice(0, 300))
        : error.message;
    return `PayPal error ${error.statusCode}: ${issues}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------ */
/* Webhook verification (REST verify-webhook-signature endpoint)        */
/* ------------------------------------------------------------------ */

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const base = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token request failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export async function verifyWebhookSignature(args: {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
  webhookEvent: unknown;
}): Promise<{ verified: boolean; error?: string }> {
  const base = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    return { verified: false, error: "PAYPAL_WEBHOOK_ID is not configured." };
  }
  try {
    const token = await accessToken();
    const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: args.authAlgo,
        cert_url: args.certUrl,
        transmission_id: args.transmissionId,
        transmission_sig: args.transmissionSig,
        transmission_time: args.transmissionTime,
        webhook_id: webhookId,
        webhook_event: args.webhookEvent,
      }),
    });
    if (!res.ok) {
      return { verified: false, error: `Verification request failed: ${res.status}` };
    }
    const data = (await res.json()) as { verification_status: string };
    return { verified: data.verification_status === "SUCCESS" };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
