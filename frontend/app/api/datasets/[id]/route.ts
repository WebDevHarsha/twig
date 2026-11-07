import { handleRoute, ok, notFound } from "@/lib/api";
import { getDataset } from "@/lib/data";

export const dynamic = "force-dynamic";

/** GET /api/datasets/[id] — id may be slug or uuid (public catalog only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const dataset = await getDataset(id);
    if (!dataset) throw notFound("Dataset not found.");
    return ok({ dataset });
  });
}
