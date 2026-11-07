import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { handleRoute, notFound, forbidden, fail } from "@/lib/api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface JobRow {
  id: string;
  status: string;
  result_storage_path: string | null;
  custom_requests?: { buyer_id?: string } | null;
}

/** GET /api/jobs/[id]/download — owner-gated custom dataset delivery. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) throw forbidden("Sign in to download your results.");
    const admin = getAdminClient();
    if (!admin) {
      return fail(
        503,
        "unavailable",
        "Supabase Storage is not configured on this deployment."
      );
    }

    const { data, error } = await admin
      .from("jobs")
      .select(
        "id, status, result_storage_path, custom_requests!inner(id, buyer_id)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const job = (data ?? null) as unknown as JobRow | null;
    if (!job) throw notFound("Job not found.");
    const buyerId = job.custom_requests?.buyer_id;
    if (!buyerId || buyerId !== user.id) {
      throw forbidden("This result belongs to a different account.");
    }
    if (job.status !== "completed" || !job.result_storage_path) {
      return fail(409, "not_ready", "This job has no completed result yet.");
    }

    const path = job.result_storage_path;
    const filename = path.split("/").pop() ?? "result";
    const { data: signed, error: signErr } = await admin.storage
      .from("datasets")
      .createSignedUrl(path, 300, { download: filename });
    if (signErr || !signed) {
      return fail(502, "storage_error", `Could not create download link: ${signErr?.message ?? "unknown error"}`);
    }
    return NextResponse.redirect(signed.signedUrl, {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
