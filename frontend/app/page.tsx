import Link from "next/link";
import { listFeaturedDatasets, listCategories } from "@/lib/data";
import { DatasetCard } from "@/components/dataset-card";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { isPaypalConfigured } from "@/lib/paypal";
import { aiConfigured } from "@/lib/ai/llm";
import { DemoBanner } from "@/components/demo-banner";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [featured, categories] = await Promise.all([
    listFeaturedDatasets(3).catch(() => []),
    listCategories().catch(() => []),
  ]);

  return (
    <>
      <DemoBanner
        supabase={isSupabaseConfigured()}
        paypal={isPaypalConfigured()}
        ai={aiConfigured()}
      />

      {/* Hero */}
      <section className="container-x pt-16 pb-14 sm:pt-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border hairline bg-white px-3 py-1 text-xs text-pine-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
          AI-agent-native data marketplace
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-sand-600 sm:text-6xl">
          Data your agents can&apos;t find. <span className="text-pine-600">Intelligence they can buy.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-sand-500">
          TWIG sells the data ordinary searches can&apos;t surface: benchmark results, uptime
          histories, and regional performance comparisons — ready-made for immediate download, or
          collected for you on demand by our benchmark worker.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/marketplace"
            className="rounded-lg bg-pine-600 px-5 py-3 font-semibold text-white transition hover:bg-pine-500"
          >
            Explore the marketplace
          </Link>
          <Link
            href="/custom"
            className="rounded-lg border hairline bg-white px-5 py-3 font-semibold text-sand-600 transition hover:border-pine-300 hover:text-pine-700"
          >
            Request a custom dataset
          </Link>
        </div>

        {/* Two product types */}
        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border hairline bg-white p-6">
            <h2 className="font-semibold text-sand-600">Ready-made datasets</h2>
            <p className="mt-2 text-sm leading-relaxed text-sand-500">
              Already collected, processed, and validated. Buy through PayPal Sandbox and download
              instantly — schema, sample records, licensing, and collection methodology are documented
              on every product page.
            </p>
          </div>
          <div className="rounded-xl border hairline bg-white p-6">
            <h2 className="font-semibold text-sand-600">Custom datasets</h2>
            <p className="mt-2 text-sm leading-relaxed text-sand-500">
              Describe what you need in plain language. AI turns it into a structured specification,
              TWIG quotes a deterministic price and delivery time, and a background worker collects
              and delivers the finished dataset.
            </p>
          </div>
        </div>
      </section>

      {/* Featured datasets */}
      <section className="container-x pb-8">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold text-sand-600">Featured datasets</h2>
            <p className="mt-1 text-sm text-sand-400">
              {categories.length > 0 && `${categories.length} categories · `}
              Updated regularly by the TWIG worker.
            </p>
          </div>
          <Link href="/marketplace" className="text-sm text-pine-600 hover:underline">
            View all →
          </Link>
        </div>
        {featured.length === 0 ? (
          <p className="rounded-xl border hairline bg-white p-6 text-sm text-sand-400">
            No datasets are published yet. Apply the Supabase seed to load the demo catalog.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {featured.map((d) => (
              <DatasetCard key={d.id} dataset={d} />
            ))}
          </div>
        )}
        {featured.some((d) => /simulated|demo/i.test(d.description)) && (
          <p className="mt-4 max-w-3xl text-xs text-sand-400">
            Sample records are simulated demo data clearly labeled on each dataset. They are never
            presented as live measurements.
          </p>
        )}
      </section>

      {/* How it works */}
      <section className="container-x pb-8">
        <h2 className="text-xl font-semibold text-sand-600">How buying works</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-4 text-sm">
          {[
            ["Browse", "Search the catalog with structured filters and inspect schemas and samples before paying."],
            ["Pay securely", "Checkout is a PayPal Sandbox order created server-side from our own prices."],
            ["Get verified", "TWIG captures the payment on the server and verifies the amount before granting access."],
            ["Download", "Files are delivered through short-lived signed links tied to your account."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-xl border hairline bg-white p-5">
              <span className="font-mono text-xs text-pine-600">0{i + 1}</span>
              <h3 className="mt-2 font-semibold text-sand-600">{title}</h3>
              <p className="mt-1 text-sand-500">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Custom teaser */}
      <section className="container-x pb-16">
        <div className="rounded-xl border border-pine-200 bg-pine-800 p-8 text-white">
          <h2 className="text-lg font-semibold">Can&apos;t find the dataset you need?</h2>
          <p className="mt-2 max-w-2xl text-sm text-pine-100">
            Example: &ldquo;I need API latency benchmarks for payment providers in India.&rdquo; Ask the
            assistant — it will find matches from the real catalog, or turn your request into a
            structured spec with a fixed price and delivery estimate.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/assistant"
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-pine-800 hover:bg-pine-50"
            >
              Ask the assistant
            </Link>
            <Link
              href="/custom"
              className="rounded-lg border border-pine-400 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pine-700"
            >
              Submit a custom request
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
