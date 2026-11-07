import { NextRequest } from "next/server";
import { handleRoute, ok } from "@/lib/api";
import { listDatasets } from "@/lib/data";

const CATEGORIES = new Set([
  "payments",
  "api-performance",
  "infrastructure",
  "transport",
  "intelligence",
  "other",
]);
const FORMATS = new Set(["csv", "json", "parquet", "tsv"]);

export const dynamic = "force-dynamic";

/** GET /api/datasets?q=&category=&format=&max_price=&limit= */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q") ?? undefined;
    const category = sp.get("category") ?? undefined;
    const format = sp.get("format") ?? undefined;
    const maxPriceRaw = sp.get("max_price");
    let maxPrice: number | undefined;
    if (maxPriceRaw !== null && maxPriceRaw !== "") {
      const n = Number(maxPriceRaw);
      if (!Number.isFinite(n) || n < 0) {
        return Response.json(
          { error: { code: "validation_error", message: "max_price must be a non-negative number." } },
          { status: 400 }
        );
      }
      maxPrice = n;
    }
    const limitRaw = sp.get("limit");
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 60) || 60));

    if (category && !CATEGORIES.has(category)) {
      return Response.json(
        { error: { code: "validation_error", message: "Unknown category." } },
        { status: 400 }
      );
    }
    if (format && !FORMATS.has(format)) {
      return Response.json(
        { error: { code: "validation_error", message: "Unknown format." } },
        { status: 400 }
      );
    }

    const { items, source } = await listDatasets({ q, category, format, maxPrice, limit });
    return ok({ source, count: items.length, datasets: items });
  });
}
