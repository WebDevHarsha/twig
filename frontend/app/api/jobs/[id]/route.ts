import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { forbidden, handleRoute, notFound, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/jobs/[id] — owner-only job detail with delivery link when done. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) throw forbidden("Sign in to continue.");
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
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? null) as
      | (Record<string, unknown> & {
          custom_requests?: { buyer_id?: string; original_prompt?: string };
        })
      | null;
    if (!row) throw notFound("Job not found.");
    const buyerId = row.custom_requests?.buyer_id;
    if (!buyerId || buyerId !== user.id) {
      throw forbidden("This job belongs to a different account.");
    }

    const {
      custom_requests,
      result_storage_path,
      ...job
    } = row as Record<string, unknown> & {
      custom_requests?: { buyer_id?: string; original_prompt?: string };
      result_storage_path?: string | null;
    };

    return ok({
      job,
      request_title: (custom_requests?.original_prompt ?? "").slice(0, 120),
      download_url:
        job.status === "completed" && result_storage_path
          ? `/api/jobs/${job.id}/download`
          : null,
    });
  });
}
