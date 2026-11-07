import Link from "next/link";
import { listDatasets, listCategories } from "@/lib/data";
import { DatasetCard, CategoryBadge } from "@/components/dataset-card";

export const dynamic = "force-dynamic";

interface MarketplaceProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type SingleOrArray = string | string[] | undefined;

function first(v: SingleOrArray): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MarketplacePage(props: MarketplaceProps) {
  const sp = await props.searchParams;
  const q = first(sp.q) ?? "";
  const category = first(sp.category) && first(sp.category) !== "all" ? (first(sp.category) as string) : undefined;
  const format = first(sp.format) && first(sp.format) !== "all" ? (first(sp.format) as string) : undefined;
  const maxPriceRaw = first(sp.max_price);
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

  const [{ items, source }, categories] = await Promise.all([
    listDatasets({ q, category, format, maxPrice }),
    listCategories(),
  ]);

  const filters = (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <form action="/marketplace" method="get" className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-sand-400">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or description…"
            className="w-56 rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-sand-400">Category</span>
          <select
            name="category"
            defaultValue={category ?? "all"}
            className="rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-sand-400">Format</span>
          <select
            name="format"
            defaultValue={format ?? "all"}
            className="rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
          >
            <option value="all">All</option>
            <option value="csv">csv</option>
            <option value="json">json</option>
            <option value="parquet">parquet</option>
            <option value="tsv">tsv</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-sand-400">Max price</span>
          <input
            name="max_price"
            type="number"
            min={0}
            step={1}
            defaultValue={maxPrice ?? ""}
            placeholder="Any"
            className="w-24 rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-pine-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pine-500"
        >
          Apply filters
        </button>
        <Link href="/marketplace" className="rounded-md border hairline bg-white px-3 py-2 text-sm text-sand-500 hover:text-pine-700">
          Reset
        </Link>
      </form>
    </div>
  );

  return (
    <div className="container-x py-10">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-sand-600">Marketplace</h1>
        {source === "demo" && (
          <CategoryBadge category="demo catalog (no Supabase configured)" />
        )}
      </div>
      <p className="mb-8 text-sm text-sand-400">
        {items.length} dataset{items.length === 1 ? "" : "s"} · every dataset documents its schema,
        sample records, coverage, methodology, and license before you buy.
      </p>

      {filters}

      {items.length === 0 ? (
        <div className="rounded-xl border hairline bg-white p-8 text-center">
          <p className="text-sm text-sand-500">No datasets match these filters.</p>
          <Link href="/custom" className="mt-2 inline-block text-sm text-pine-600 hover:underline">
            Request a custom dataset instead →
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <DatasetCard key={d.id} dataset={d} />
          ))}
        </div>
      )}
    </div>
  );
}
