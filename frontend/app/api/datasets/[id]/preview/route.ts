import { z } from "zod";
import { jsonClone, handleRoute, ok, notFound, parseBody } from "@/lib/api";
import { getDataset } from "@/lib/data";

export const dynamic = "force-dynamic";

const previewBody = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

/**
 * POST /api/datasets/[id]/preview
 * Returns the schema description and a bounded set of sample records.
 * Sample data is metadata from the published catalog — no entitlement needed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const body = await parseBody(request, previewBody);
    const dataset = await getDataset(id);
    if (!dataset) throw notFound("Dataset not found.");
    return ok({
      dataset_id: dataset.id,
      slug: dataset.slug,
      name: dataset.name,
      synthetic: dataset.schema_json?.synthetic ?? false,
      synthetic_notice: dataset.schema_json?.synthetic_notice ?? null,
      schema: jsonClone(dataset.schema_json),
      sample_records: dataset.sample_data.slice(0, body.limit),
      total_sample_records: dataset.sample_data.length,
    });
  });
}

/** GET /api/datasets/[id]/preview — same payload with default limit. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(async () => {
    const { id } = await params;
    const dataset = await getDataset(id);
    if (!dataset) throw notFound("Dataset not found.");
    return ok({
      dataset_id: dataset.id,
      slug: dataset.slug,
      name: dataset.name,
      synthetic: dataset.schema_json?.synthetic ?? false,
      synthetic_notice: dataset.schema_json?.synthetic_notice ?? null,
      schema: jsonClone(dataset.schema_json),
      sample_records: dataset.sample_data.slice(0, 10),
      total_sample_records: dataset.sample_data.length,
    });
  });
}
