import { notFound } from "next/navigation";
import Link from "next/link";
import { getDataset } from "@/lib/data";
import { PreviewButton } from "@/components/preview-button";
import { BuyDatasetButton } from "@/components/buy-dataset-button";
import { CategoryBadge } from "@/components/dataset-card";

export const dynamic = "force-dynamic";

interface DatasetDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function DatasetDetailPage(props: DatasetDetailPageProps) {
  const { slug } = await props.params;
  const dataset = await getDataset(slug);
  if (!dataset) notFound();

  const synthetic = dataset.schema_json?.synthetic ?? false;
  const sampleKeys = dataset.sample_data[0] ? Object.keys(dataset.sample_data[0]) : [];

  return (
    <div className="container-x py-10">
      <Link href="/marketplace" className="mb-6 inline-block text-sm text-sand-400 hover:text-pine-700">
        ← Back to marketplace
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* Main column */}
        <div>
          <div className="mb-3 flex items-center gap-3">
            <CategoryBadge category={dataset.category} />
            <span className="rounded border border-sand-200 px-1.5 py-0.5 font-mono text-[10px] uppercase text-sand-400">
              {dataset.format}
            </span>
            {synthetic && (
              <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                simulated data
              </span>
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-sand-600">{dataset.name}</h1>
          <p className="mt-4 max-w-3xl leading-relaxed text-sand-500">{dataset.description}</p>

          {synthetic && dataset.schema_json?.synthetic_notice && (
            <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠ {dataset.schema_json.synthetic_notice}
            </p>
          )}

          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold text-sand-600">Coverage & collection</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <InfoRow label="Coverage" value={dataset.coverage} />
              <InfoRow label="Freshness" value={dataset.freshness} />
              <InfoRow label="Last updated" value={new Date(dataset.last_updated).toISOString().slice(0, 16).replace("T", " ") + " UTC"} />
              <InfoRow
                label="Approx. sample size"
                value={`${dataset.sample_count} sample record${dataset.sample_count === 1 ? "" : "s"} shown`}
              />
              {dataset.methodology && <InfoRow label="Methodology" value={dataset.methodology} wide />}
            </dl>
          </section>

          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold text-sand-600">Sources & licensing</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {dataset.source_information && <InfoRow label="Source" value={dataset.source_information} wide />}
              {dataset.license_information && <InfoRow label="License" value={dataset.license_information} wide />}
            </dl>
          </section>

          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold text-sand-600">Schema</h2>
            <div className="overflow-hidden rounded-lg border hairline bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-sand-100 text-xs uppercase tracking-wide text-sand-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Column</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y hairline">
                  {(dataset.schema_json?.fields ?? []).map((f) => (
                    <tr key={f.name}>
                      <td className="px-4 py-2 font-mono text-xs text-pine-700">{f.name}</td>
                      <td className="px-4 py-2 text-xs text-sand-400">
                        {f.type}
                        {f.required ? " · required" : ""}
                      </td>
                      <td className="px-4 py-2 text-sand-500">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-sand-600">Sample records</h2>
              <PreviewButton datasetId={dataset.id} label="Open structured preview" />
            </div>
            {sampleKeys.length === 0 ? (
              <p className="rounded-lg border hairline bg-white p-4 text-sm text-sand-400">
                No sample records are attached to this dataset.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border hairline bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sand-100 text-sand-500">
                    <tr>
                      {sampleKeys.map((k) => (
                        <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y hairline">
                    {dataset.sample_data.slice(0, 6).map((row, i) => (
                      <tr key={i}>
                        {sampleKeys.map((k) => (
                          <td key={k} className="px-3 py-2 font-mono whitespace-nowrap text-sand-500">
                            {String((row as Record<string, unknown>)[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-sand-400">
              {synthetic
                ? "These records are simulated and labeled as such throughout the dataset."
                : "Sample records are truncated to 6 rows; the full file is delivered after purchase."}
            </p>
          </section>
        </div>

        {/* Purchase panel */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border hairline bg-white p-6">
            <p className="text-sm text-sand-400">Price</p>
            <p className="mt-1 text-3xl font-semibold text-sand-600">
              ${dataset.price.toFixed(2)}
              <span className="ml-1 text-sm font-normal text-sand-400">{dataset.currency}</span>
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-sand-500">
              <li>✓ Perpetual internal-use license</li>
              <li>✓ Pay with PayPal Sandbox</li>
              <li>✓ Signed-link download, verified server-side</li>
            </ul>
            <div className="mt-6">
              <BuyDatasetButton datasetId={dataset.id} price={dataset.price} currency={dataset.currency} />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-sand-400">
              Access is granted only after PayPal confirms and TWIG verifies the captured amount
              server-side. Repeat captures are idempotent and cannot grant duplicate access.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border hairline bg-white p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-sand-400">{label}</dt>
      <dd className="mt-1 text-sand-500">{value}</dd>
    </div>
  );
}
