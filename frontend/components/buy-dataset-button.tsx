"use client";

import { useState } from "react";
import { loadCurrentUser, supabaseConfiguredClientSide } from "@/lib/supabase/client";
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";

type Stage =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "paypal"; paypalOrderId: string; clientId: string; internalOrderId: string }
  | { step: "capture" }
  | { step: "done" }
  | { step: "error"; message: string };

/**
 * End-to-end purchase widget for a published dataset.
 * 1. POST /api/orders          → internal order (server checks price & ownership)
 * 2. POST /api/payments/create → PayPal sandbox order
 * 3. PayPal Buttons            → buyer approves in the sandbox popup
 * 4. POST /api/payments/capture → server-side capture, amount verification,
 *    and idempotent access grant. A frontend success flag alone never grants
 *    access; the dashboard reflects what the server recorded.
 */
export function BuyDatasetButton({
  datasetId,
  price,
  currency,
}: {
  datasetId: string;
  price: number;
  currency: string;
}) {
  const [stage, setStage] = useState<Stage>({ step: "idle" });

  async function beginCheckout() {
    if (!supabaseConfiguredClientSide()) {
      setStage({
        step: "error",
        message:
          "Supabase is not configured on this deployment. Sign-in is required before checkout — see the README for setup.",
      });
      return;
    }
    setStage({ step: "loading" });
    const user = await loadCurrentUser();
    if (!user) {
      setStage({
        step: "error",
        message:
          "Sign in to purchase this dataset. Create an account in seconds from the Sign in page, then come back here.",
      });
      return;
    }
    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: datasetId }),
      });
      const orderJson = (await orderRes.json()) as {
        order?: { id: string };
        error?: { code: string; message: string };
      };
      if (!orderRes.ok) {
        throw new Error(orderJson.error?.message ?? "Could not create the order.");
      }
      const internalOrderId = orderJson.order?.id as string;

      const payRes = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: internalOrderId }),
      });
      const payJson = (await payRes.json()) as {
        paypal_order_id?: string;
        checkout?: { client_id: string };
        error?: { code: string; message: string };
      };
      if (!payRes.ok || !payJson.paypal_order_id || !payJson.checkout?.client_id) {
        throw new Error(payJson.error?.message ?? "PayPal checkout is unavailable right now.");
      }
      setStage({
        step: "paypal",
        paypalOrderId: payJson.paypal_order_id,
        clientId: payJson.checkout.client_id,
        internalOrderId,
      });
    } catch (e) {
      setStage({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (stage.step === "done") {
    return (
      <div className="rounded-lg border border-pine-200 bg-pine-50 p-4 text-sm text-pine-700">
        <p className="font-semibold">Payment captured — access granted on the server.</p>
        <p className="mt-1">
          Download the dataset any time from{" "}
          <a className="underline" href="/dashboard">
            your dashboard
          </a>
          .
        </p>
      </div>
    );
  }

  if (stage.step === "paypal") {
    return (
      <div className="rounded-lg border hairline bg-white p-4">
        <p className="mb-3 text-sm text-sand-500">
          Approve the sandbox payment. TWIG captures it server-side afterwards.
        </p>
        <PayPalScriptProvider
          options={{
            clientId: stage.clientId,
            currency,
            intent: "capture",
            components: "buttons",
          }}
        >
          <Buttons
            paypalOrderId={stage.paypalOrderId}
            internalOrderId={stage.internalOrderId}
            setStage={setStage}
          />
        </PayPalScriptProvider>
      </div>
    );
  }

  if (stage.step === "capture") {
    return (
      <div className="rounded-lg border hairline bg-white p-4 text-sm text-sand-500">
        <span className="inline-flex items-center gap-2">
          <Dots /> Capturing payment and verifying the transaction…
        </span>
      </div>
    );
  }

  if (stage.step === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Checkout needs attention</p>
        <p className="mt-1">{stage.message}</p>
        <button
          onClick={() => setStage({ step: "idle" })}
          className="mt-3 rounded-md border hairline bg-white px-3 py-1.5 text-xs text-sand-500 hover:text-pine-700"
        >
          Close
        </button>
      </div>
    );
  }

  const pending = stage.step === "loading";
  return (
    <button
      disabled={pending}
      onClick={beginCheckout}
      className="w-full rounded-lg bg-pine-600 px-4 py-3 text-center font-semibold text-white transition hover:bg-pine-500 disabled:opacity-60"
    >
      {pending ? "Preparing checkout…" : `Buy dataset — $${price.toFixed(2)} ${currency}`}
    </button>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
      <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
      <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
    </span>
  );
}

function Buttons({
  paypalOrderId,
  internalOrderId,
  setStage,
}: {
  paypalOrderId: string;
  internalOrderId: string;
  setStage: (s: Stage) => void;
}) {
  const [{ isPending }] = usePayPalScriptReducer();

  if (isPending) {
    return (
      <div className="py-2 text-sm text-sand-400">
        Loading PayPal…
      </div>
    );
  }
  return (
    <PayPalButtons
      style={{ layout: "vertical", shape: "rect", color: "gold" }}
      createOrder={async () => paypalOrderId}
      onApprove={async () => {
        setStage({ step: "capture" });
        try {
          const res = await fetch("/api/payments/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: internalOrderId }),
          });
          const json = (await res.json()) as { state?: string; error?: { message: string } };
          if (!res.ok || json.state !== "completed") {
            setStage({
              step: "error",
              message:
                (json.error?.message ?? "Payment capture failed.") +
                " No access was granted. Nothing was charged twice — retry is safe.",
            });
            return;
          }
          setStage({ step: "done" });
        } catch (e) {
          setStage({ step: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }}
      onCancel={() =>
        setStage({ step: "error", message: "Payment approval was cancelled. You can try again." })
      }
      onError={() =>
        setStage({
          step: "error",
          message: "PayPal reported an error. No payment went through this button.",
        })
      }
    />
  );
}
