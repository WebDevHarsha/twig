import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { isPaypalConfigured } from "@/lib/paypal";
import { aiConfigured } from "@/lib/ai/llm";

export const dynamic = "force-dynamic";

/** GET /api/health — deployment configuration status (no secrets). */
export function GET() {
  return NextResponse.json({
    ok: true,
    configured: {
      supabase: isSupabaseConfigured(),
      paypal: isPaypalConfigured(),
      paypal_webhook_id: Boolean(process.env.PAYPAL_WEBHOOK_ID),
      ai: aiConfigured(),
    },
  });
}
