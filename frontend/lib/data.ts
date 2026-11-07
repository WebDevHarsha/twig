import { datasetDetailSchema } from "@/lib/contracts";
import type { DatasetDetail, DatasetSummary } from "@tw/contracts";
import { getAdminClient, getAnonClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { demoListDatasets, demoGetDataset, toSummary } from "@/lib/demo-data";

/**
 * Dataset catalog access. Reads go through Supabase when configured; falls
 * back to the explicit demo catalog when the project has no Supabase
 * credentials so the app stays browsable (and rows are labeled demo).
 */

interface DatasetRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  format: string;
  schema_json: unknown;
  sample_data: unknown;
  storage_path: string | null;
  source_information: string | null;
  license_information: string | null;
  coverage: string | null;
  freshness: string | null;
  methodology: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDetail(row: DatasetRow): DatasetDetail {
  // Validate defensively; published rows are schema-described by the seed.
  const parsed = datasetDetailSchema.safeParse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    currency: row.currency,
    format: row.format,
    coverage: row.coverage ?? "",
    freshness: row.freshness ?? "Unknown",
    released_at: row.created_at,
    sample_count: Array.isArray(row.sample_data) ? row.sample_data.length : 0,
    schema_json: row.schema_json,
    sample_data: Array.isArray(row.sample_data) ? row.sample_data : [],
    storage_path: row.storage_path,
    source_information: row.source_information,
    license_information: row.license_information,
    methodology: row.methodology,
    last_updated: row.updated_at,
  });
  if (!parsed.success) {
    throw new Error(
      `Dataset row "${row.slug}" failed schema validation: ${parsed.error.issues[0]?.message}`
    );
  }
  return parsed.data;
}

export interface ListResult {
  source: "db" | "demo";
  items: DatasetSummary[];
}

export async function listDatasets(params: {
  q?: string;
  category?: string;
  format?: string;
  maxPrice?: number;
  limit?: number;
}): Promise<ListResult> {
  if (!isSupabaseConfigured()) {
    return { source: "demo", items: demoListDatasets(params) };
  }
  const client = getAnonClient();
  if (!client) return { source: "demo", items: demoListDatasets(params) };

  let query = client
    .from("datasets")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(params.limit ?? 60);

  if (params.q && params.q.trim()) {
    const term = params.q.trim();
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (params.category) query = query.eq("category", params.category);
  if (params.format) query = query.eq("format", params.format);
  if (params.maxPrice !== undefined) query = query.lte("price", params.maxPrice);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list datasets: ${error.message}`);
  const rows = (data ?? []) as unknown as DatasetRow[];
  return {
    source: "db",
    items: rows.map((row) =>
      rowToDetail(row)
    ).map((detail) => toSummary(detail)),
  };
}

/** Single dataset by slug or id; null when missing. */
export async function getDataset(key: string): Promise<DatasetDetail | null> {
  const k = key.trim();
  if (!k) return null;

  if (!isSupabaseConfigured()) return demoGetDataset(k.toLowerCase());

  const client = getAnonClient();
  if (!client) return demoGetDataset(k.toLowerCase());

  const isUuid = /^[0-9a-fA-F-]{36}$/.test(k);
  let query = client.from("datasets").select("*").eq("status", "published").limit(1);
  query = isUuid ? query.eq("id", k) : query.eq("slug", k.toLowerCase());

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to get dataset: ${error.message}`);
  if (!data) return null;
  return rowToDetail(data as unknown as DatasetRow);
}

/** Fetch datasets for the agent by id list, keeping catalog order. */
export async function getDatasetsByIds(ids: string[]): Promise<DatasetDetail[]> {
  if (!isSupabaseConfigured()) {
    return ids
      .map((id) => demoGetDataset(id))
      .filter((d): d is DatasetDetail => d !== null);
  }
  const client = getAnonClient();
  if (!client) return [];
  const { data, error } = await client
    .from("datasets")
    .select("*")
    .eq("status", "published")
    .in("id", ids);
  if (error) throw new Error(`Failed to fetch datasets: ${error.message}`);
  const rows = (data ?? []) as unknown as DatasetRow[];
  return rows.map((row) => rowToDetail(row));
}

export async function listFeaturedDatasets(limit = 3): Promise<DatasetSummary[]> {
  const { items } = await listDatasets({ limit });
  return items.slice(0, limit);
}

/** List of distinct categories present in the catalog (for filters). */
export async function listCategories(): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return [...new Set(demoListDatasets({}).map((d) => d.category))];
  }
  const client = getAnonClient();
  if (!client) return [];
  const { data, error } = await client
    .from("datasets")
    .select("category")
    .eq("status", "published")
    .limit(200);
  if (error) return [];
  const cats = new Set((data ?? []).map((r: { category: string }) => r.category));
  return [...cats];
}

/* ------------------------------------------------------------------ */
/* Storage helpers (service role; access control is by entitlement)     */
/* ------------------------------------------------------------------ */

export async function createDatasetDownloadUrl(
  storagePath: string,
  filename: string
): Promise<{ signedUrl: string | null; error: string | null }> {
  const admin = getAdminClient();
  if (!admin) {
    return {
      signedUrl: null,
      error: "Supabase Storage is not configured on this deployment.",
    };
  }
  const { data, error } = await admin.storage
    .from("datasets")
    .createSignedUrl(storagePath, 300, { download: filename });
  if (error) return { signedUrl: null, error: error.message };
  return { signedUrl: data.signedUrl, error: null };
}

/**
 * Build a CSV/JSON body of the dataset sample for deployments where the
 * object has not been uploaded yet (e.g., fresh Supabase project before the
 * seed STORAGE files were uploaded). Always clearly labeled demo content.
 */
export function buildDatasetFileBody(detail: DatasetDetail): string {
  if (detail.format === "json") {
    return JSON.stringify(
      {
        dataset: detail.name,
        warning:
          "DEMO PREVIEW EXPORT built from sample records. Full dataset requires the seeded Storage object.",
        synthetic: detail.schema_json?.synthetic ?? false,
        synthetic_notice: detail.schema_json?.synthetic_notice ?? null,
        schema: detail.schema_json,
        records: detail.sample_data,
      },
      null,
      2
    );
  }
  const rows = detail.sample_data;
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows as Record<string, unknown>[]) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\n");
}
