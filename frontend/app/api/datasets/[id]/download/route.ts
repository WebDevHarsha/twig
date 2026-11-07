import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { fail, handleRoute, notFound, forbidden } from "@/lib/api";
import { getDataset, createDatasetDownloadUrl, buildDatasetFileBody } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/datasets/[id]/download — entitlement-gated.
 * Proxies through a short-lived signed Storage URL; verifies ownership
 * server-side before ever touching Storage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) throw forbidden("Sign in to download datasets.");

    const dataset = await getDataset(id);
    if (!dataset) throw notFound("Dataset not found.");

    const admin = getAdminClient();
    if (!admin) {
      return fail(
        503,
        "unavailable",
        "Supabase Storage is not configured on this deployment, so downloads are unavailable."
      );
    }

    const { data: ent, error } = await admin
      .from("entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("dataset_id", dataset.id)
      .maybeSingle();
    if (error || !ent) throw forbidden("Purchase this dataset to download it.");

    const filename = `${dataset.slug}.${dataset.format === "json" ? "json" : "csv"}`;

    // Preferred path: signed URL to the stored object.
    if (dataset.storage_path) {
      const { signedUrl, error: signErr } = await createDatasetDownloadUrl(
        dataset.storage_path,
        filename
      );
      if (signedUrl) {
        return NextResponse.redirect(signedUrl, {
          headers: { "Cache-Control": "no-store" },
        });
      }
      console.warn(
        `[download] signed URL unavailable for ${dataset.slug}: ${signErr ?? "unknown"}`
      );
    }

    // Fallback: stream the sample records (clearly labeled) so the deliverable
    // flow still works when the seeded Storage object has not been uploaded.
    const body = buildDatasetFileBody(dataset);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          dataset.format === "json" ? "application/json" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Twig-Content": "fallback-sample-export",
      },
    });
  });
}
