import { NextRequest, NextResponse } from "next/server";
import { chatRequestSchema } from "@/lib/contracts";
import { handleRoute, unauthorized, parseBody } from "@/lib/api";
import { agentReply } from "@/lib/ai/agent";
import { getServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agent/chat
 *
 * One agent turn. The server pipeline is:
 *   intent extraction -> real catalog search -> selection/ranking ->
 *   replies built ONLY from catalog data; prices/feasibility only from
 *   @tw/pricing. The agent cannot authorize or capture payments.
 */
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) {
      throw unauthorized("Sign in to chat with the assistant.");
    }
    const body = await parseBody(request, chatRequestSchema);
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Send at least one user message." } },
        { status: 400 }
      );
    }

    const response = await agentReply(lastUser.content);
    return NextResponse.json(response);
  });
}
