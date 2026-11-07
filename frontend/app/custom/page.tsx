"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadCurrentUser, supabaseConfiguredClientSide } from "@/lib/supabase/client";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

/**
 * Custom dataset request flow:
 * prompt → AI spec (deterministic fallback) → deterministic quote →
 * buyer approves quote → order + PayPal sandbox checkout → server capture →
 * worker job created.
 */
interface Quote {
  estimated_price: number | null;
  currency: string;
  estimated_delivery_hours: number | null;
  breakdown: { label: string; value: string }[];
  feasible: boolean;
  feasibility_note: string;
}
interface Spec {
  kind: string;
  dataset_name: string;
  description: string;
  target_systems: { name: string; provider_label: string }[];
  metrics: string[];
  geography: string;
  assumptions: string[];
  required_columns: string[];
}
interface CustomRequest {
  id: string;
  status: string;
}
type FlowState =
  | { step: "form" }
  | { step: "submitting" }
  | { step: "quoted"; request: CustomRequest; spec: Spec | null; quote: Quote; mode: string; note: string | null }
  | { step: "creating-order" }
  | { step: "paypal"; orderId: string; paypalOrderId: string; clientId: string }
  | { step: "capture" }
  | { step: "done"; orderId: string; jobId?: string }
  | { step: "error"; message: string };

const EXAMPLE =
  "I need API latency benchmarks for PayPal, Razorpay, and Stripe in India, at least 20 timed requests per provider, recorded with HTTP status and timestamps.";

export default function CustomRequestPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<FlowState>({ step: "form" });
  // Full-union alias for busy checks inside JSX blocks already narrowed to a
  // specific step (e.g. while `step === "form"`); keeps the comparisons valid.
  const s = state as FlowState;

  async function submit() {
    if (!supabaseConfiguredClientSide()) {
      setState({ step: "error", message: "Supabase is not configured on this deployment; custom requests cannot be stored. See README setup." });
      return;
    }
    const user = await loadCurrentUser();
    if (!user) {
      router.push("/login?next=/custom");
      return;
    }
    if (prompt.trim().length < 20) {
      setState({ step: "error", message: "Describe the data you need in at least 20 characters." });
      return;
    }
    setState({ step: "submitting" });
    try {
      const res = await fetch("/api/custom-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const json = (await res.json()) as {
        custom_request?: CustomRequest;
        spec?: Spec;
        quote?: Quote;
        spec_mode?: string;
        note?: string | null;
        error?: { message: string };
      };
      if (!res.ok || !json.custom_request || !json.quote) {
        throw new Error(json.error?.message ?? "Could not generate a specification.");
      }
      setState({
        step: "quoted",
        request: json.custom_request,
        spec: json.spec ?? null,
        quote: json.quote,
        mode: (json.spec_mode as string) ?? "fallback",
        note: json.note ?? null,
      });
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function approveQuote() {
    if (state.step !== "quoted") return;
    setState({ step: "creating-order" });
    try {
      const res = await fetch(`/api/custom-requests/${state.request.id}/approve`, { method: "POST" });
      const json = (await res.json()) as {
        order?: { id: string };
        paypal?: { order_id: string | null; error: string | null; configured: boolean };
        error?: { message: string };
      };
      if (!res.ok || !json.order) throw new Error(json.error?.message ?? "Approval failed.");
      if (!json.paypal?.configured) {
        throw new Error(
          json.paypal?.error ??
            "PayPal Sandbox is not configured on this deployment, so the quote is approved but payment cannot proceed."
        );
      }
      if (!json.paypal.order_id) {
        throw new Error("PayPal did not return an order id.");
      }
      // Client id is a public value retrieved from /api/payments/create.
      const payRes = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: json.order.id }),
      });
      const payJson = (await payRes.json()) as {
        paypal_order_id?: string;
        checkout?: { client_id: string };
        error?: { message: string };
      };
      if (!payRes.ok || !payJson.paypal_order_id || !payJson.checkout?.client_id) {
        throw new Error(payJson.error?.message ?? "PayPal is not ready.");
      }
      setState({
        step: "paypal",
        orderId: json.order.id,
        paypalOrderId: payJson.paypal_order_id,
        clientId: payJson.checkout.client_id,
      });
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function capturePayment(orderId: string) {
    setState({ step: "capture" });
    try {
      const res = await fetch("/api/payments/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const json = (await res.json()) as { state?: string; jobId?: string; error?: { message: string } };
      if (!res.ok || json.state !== "completed") {
        throw new Error(json.error?.message ?? "Capture failed — no job was created.");
      }
      setState({ step: "done", orderId, jobId: json.jobId });
      router.refresh();
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="container-x max-w-3xl py-10">
      <h1 className="text-2xl font-semibold text-sand-600">Request a custom dataset</h1>
      <p className="mt-2 text-sm text-sand-400">
        Describe the data you need. AI converts it into a structured specification; the price and
        delivery estimate are computed from TWIG&apos;s published pricing rules — never invented by the
        model.
      </p>

      {state.step === "form" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-8 fade-up"
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder={EXAMPLE}
            className="w-full rounded-lg border hairline bg-white p-4 text-sm leading-relaxed outline-none focus:border-pine-400"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPrompt(EXAMPLE)}
              className="rounded-md border hairline bg-white px-3 py-1.5 text-xs text-sand-500 hover:text-pine-700"
            >
              Use example prompt
            </button>
            <button
              type="submit"
              disabled={s.step === "submitting"}
              className="rounded-lg bg-pine-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-500 disabled:opacity-60"
            >
              {s.step === "submitting" ? "Generating specification…" : "Generate specification & quote"}
            </button>
          </div>
        </form>
      )}

      {state.step === "submitting" && (
        <div className="mt-8 rounded-lg border hairline bg-white p-6 text-sm text-sand-500">
          <span className="inline-flex items-center gap-2">
            <Dots /> Turning your prompt into a structured specification…
          </span>
        </div>
      )}

      {state.step === "quoted" && (
        <div className="mt-8 space-y-6 fade-up">
          <div className="rounded-xl border hairline bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sand-600">Structured specification</h2>
              <span className="rounded-full border hairline px-2 py-0.5 text-[11px] text-sand-400">
                spec mode: {state.mode}
              </span>
            </div>
            {state.note && <p className="mt-2 text-xs text-amber-700">{state.note}</p>}
            {state.spec ? (
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-sand-400">Dataset</p>
                  <p className="text-sand-600">{state.spec.dataset_name}</p>
                  <p className="mt-1 text-sand-500">{state.spec.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <SpecCell label="Target systems" value={state.spec.target_systems.map((t) => t.provider_label).join(", ")} />
                  <SpecCell label="Geography" value={state.spec.geography} />
                  <SpecCell label="Metrics" value={state.spec.metrics.join(", ")} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-sand-400">Assumptions</p>
                  <ul className="mt-1 list-disc pl-5 text-sand-500">
                    {state.spec.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
                {state.spec.kind !== "api_benchmark" && (
                  <p className="text-xs text-amber-700">
                    Spec kind “{state.spec.kind}” is not supported by the automated worker.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-sand-400">
                Specification was not returned — the request was stored as a draft.
              </p>
            )}
          </div>

          {state.quote.feasible && state.quote.estimated_price ? (
            <div className="rounded-xl border border-pine-200 bg-white p-6">
              <h2 className="font-semibold text-sand-600">Quote</h2>
              <p className="mt-2 text-3xl font-semibold text-pine-700">
                ${state.quote.estimated_price.toFixed(2)}
                <span className="ml-1 text-sm font-normal text-sand-400">{state.quote.currency}</span>
              </p>
              <p className="mt-1 text-sm text-sand-500">
                Estimated delivery: ~{state.quote.estimated_delivery_hours} hours after payment.
              </p>
              <table className="mt-4 w-full text-left text-xs">
                <tbody className="divide-y hairline">
                  {state.quote.breakdown.map((b, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-sand-500">{b.label}</td>
                      <td className="py-1.5 text-right font-mono text-sand-600">{b.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-relaxed text-sand-400">{state.quote.feasibility_note}</p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={approveQuote}
                  disabled={s.step === "creating-order"}
                  className="rounded-lg bg-pine-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-500 disabled:opacity-60"
                >
                  {s.step === "creating-order" ? "Creating order…" : "Approve quote & pay"}
                </button>
                <button
                  onClick={() => setState({ step: "form" })}
                  className="rounded-lg border hairline bg-white px-4 py-2.5 text-sm text-sand-500 hover:text-pine-700"
                >
                  Edit prompt
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              <p className="font-semibold">Not feasible as an automated job</p>
              <p className="mt-1">{state.quote.feasibility_note}</p>
            </div>
          )}
        </div>
      )}

      {state.step === "creating-order" && (
        <div className="mt-8 rounded-lg border hairline bg-white p-6 text-sm text-sand-500">
          <span className="inline-flex items-center gap-2">
            <Dots /> Creating the order and PayPal checkout…
          </span>
        </div>
      )}

      {state.step === "paypal" && (
        <div className="mt-8 rounded-xl border hairline bg-white p-6 fade-up">
          <p className="mb-3 text-sm text-sand-500">
            Order created on the server — approve the sandbox payment below.
          </p>
          <PayPalScriptProvider
            options={{ clientId: state.clientId, currency: "USD", intent: "capture", components: "buttons" }}
          >
            <PayPalButtons
              style={{ layout: "vertical", shape: "rect" }}
              createOrder={async () => state.paypalOrderId}
              onApprove={async () => capturePayment(state.orderId)}
              onCancel={() => setState({ step: "error", message: "Approval cancelled — your quote is saved; approve again from the dashboard." })}
              onError={() => setState({ step: "error", message: "PayPal reported an error; nothing was captured." })}
            />
          </PayPalScriptProvider>
        </div>
      )}

      {state.step === "capture" && (
        <div className="mt-8 rounded-lg border hairline bg-white p-6 text-sm text-sand-500">
          <span className="inline-flex items-center gap-2">
            <Dots /> Capturing payment and creating the collection job…
          </span>
        </div>
      )}

      {state.step === "done" && (
        <div className="mt-8 rounded-xl border border-pine-200 bg-pine-50 p-6 text-sm text-pine-800 fade-up">
          <p className="font-semibold">Payment captured — collection job created!</p>
          <p className="mt-1">
            The Python worker will claim the job, run the benchmark, and upload results. Track
            progress on <a className="underline" href="/dashboard">the dashboard</a>.{" "}
            {state.jobId && <span className="font-mono text-xs">job {state.jobId}</span>}
          </p>
        </div>
      )}

      {state.step === "error" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 fade-up">
          <p className="font-medium">Something needs attention</p>
          <p className="mt-1">{state.message}</p>
          <button
            onClick={() => setState({ step: "form" })}
            className="mt-3 rounded-md border hairline bg-white px-3 py-1.5 text-xs text-sand-500 hover:text-pine-700"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-sand-400">{label}</p>
      <p className="mt-0.5 text-sand-600">{value}</p>
    </div>
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
