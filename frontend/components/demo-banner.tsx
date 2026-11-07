"use client";

import Link from "next/link";

/**
 * Transparent configuration banner. Never hides from failed integrations —
 * shows exactly which credentials are missing on this deployment.
 */
export function DemoBanner({ supabase, paypal, ai }: { supabase: boolean; paypal: boolean; ai: boolean }) {
  if (supabase && paypal && ai) return null;
  return (
    <div className="border-b hairline bg-sand-100">
      <div className="container-x flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-sand-500">
        <span className="font-medium text-sand-600">Configuration status:</span>
        <Status ok={supabase} label="Supabase (required for browsing + purchases)" />
        <Status ok={paypal} label="PayPal Sandbox (checkout)" />
        <Status ok={ai} label="LLM (assistant; falls back to deterministic mode)" />
        <Link href="/api/health" className="ml-auto text-pine-600 hover:underline">
          /api/health
        </Link>
      </div>
    </div>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "text-pine-600" : "text-amber-700"}>
      {ok ? "✓" : "○"} {label}
    </span>
  );
}
