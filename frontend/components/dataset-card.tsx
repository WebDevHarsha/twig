import Link from "next/link";
import type { DatasetSummary } from "@tw/contracts";

const CATEGORY_LABELS: Record<string, string> = {
  payments: "Payments",
  "api-performance": "API performance",
  infrastructure: "Infrastructure",
  transport: "Transport",
  intelligence: "Intelligence",
  other: "Other",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full border hairline bg-white px-2 py-0.5 text-[11px] font-medium text-pine-700">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

export function DatasetCard({ dataset }: { dataset: DatasetSummary }) {
  return (
    <Link
      href={`/datasets/${dataset.slug}`}
      className="group flex h-full flex-col rounded-xl border hairline bg-white p-5 transition hover:border-pine-300 hover:shadow-[0_1px_0_0_var(--color-pine-200)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <CategoryBadge category={dataset.category} />
        <span className="uppercase rounded border border-sand-200 px-1.5 py-0.5 font-mono text-[10px] text-sand-400">
          {dataset.format}
        </span>
      </div>
      <h3 className="font-semibold text-sand-600 group-hover:text-pine-700">{dataset.name}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-sand-500">{dataset.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-sand-400">
        <div>
          <dt className="font-medium text-sand-500">Coverage</dt>
          <dd className="truncate" title={dataset.coverage}>{dataset.coverage}</dd>
        </div>
        <div>
          <dt className="font-medium text-sand-500">Freshness</dt>
          <dd className="truncate" title={dataset.freshness}>{dataset.freshness}</dd>
        </div>
      </dl>
      <div className="mt-5 flex items-center justify-between border-t hairline pt-4">
        <span className="font-semibold text-sand-600">
          ${dataset.price.toFixed(2)}
          <span className="ml-1 text-xs font-normal text-sand-400">{dataset.currency}</span>
        </span>
        <span className="text-sm text-pine-600 group-hover:underline">View details →</span>
      </div>
    </Link>
  );
}
