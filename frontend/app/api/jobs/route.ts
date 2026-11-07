import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { unauthorized, handleRoute, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/jobs — collection jobs behind the signed-in buyer's requests. */
export async function GET() {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw unauthorized();
    const admin = getAdminClient();
    if (!admin) {
      return Response.json(
        { error: { code: "unavailable", message: "Supabase is not configured." } },
        { status: 503 }
      );
    }
    const { data, error } = await admin
      .from("jobs")
      .select(
        "id, status, progress, stage, error_message, started_at, completed_at, created_at, result_storage_path, custom_requests!inner(id, buyer_id, original_prompt)"
      )
      .eq("custom_requests.buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        custom_requests?: { original_prompt?: string };
        result_storage_path?: string | null;
      }
    >;
    return ok({
      jobs: rows.map(({ custom_requests, result_storage_path, ...job }) => ({
        ...job,
        request_title: (custom_requests?.original_prompt ?? "").slice(0, 120),
        has_result: Boolean(result_storage_path),
      })),
    });
  });
}
