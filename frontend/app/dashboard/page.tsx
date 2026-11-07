"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseConfiguredClientSide } from "@/lib/supabase/client";

interface Purchase {
  id: string;
  amount: number;
  currency: string;
  payment_status: string;
  created_at: string;
  dataset: { name: string; slug: string; format: string } | null;
}
interface CustomRequestRow {
  id: string;
  original_prompt: string;
  status: string;
  estimated_price: number | null;
  currency: string;
  estimated_delivery_hours: number | null;
  created_at: string;
  job: { id: string; status: string; progress: number; stage: string | null; error_message: string | null } | null;
}
interface JobRow {
  id: string;
  status: string;
  progress: number;
  stage: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  request_title: string;
  has_result: boolean;
}

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [requests, setRequests] = useState<CustomRequestRow[] | null>(null);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!supabaseConfiguredClientSide()) {
      setError("Supabase is not configured on this deployment — the dashboard can't load.");
      setLoading(false);
      return;
    }
    setError("");
    const [resPurchases, resRequests, resJobs] = await Promise.all([
      fetch("/api/orders", { cache: "no-store" }),
      fetch("/api/custom-requests", { cache: "no-store" }),
      fetch("/api/jobs", { cache: "no-store" }),
    ]);
    if (resPurchases.status === 401) {
      setNeedLogin(true);
      setLoading(false);
      return;
    }
    let runningJobs = false;
    if (resPurchases.ok) {
      setPurchases(((await resPurchases.json()) as { orders: Purchase[] }).orders ?? []);
    }
    if (resRequests.ok) {
      setRequests(((await resRequests.json()) as { custom_requests: CustomRequestRow[] }).custom_requests ?? []);
    }
    if (resJobs.ok) {
      const data = ((await resJobs.json()) as { jobs: JobRow[] }) ?? { jobs: [] };
      setJobs(data.jobs ?? []);
      runningJobs = (data.jobs ?? []).some((j) => j.status === "pending" || j.status === "running");
    }
    if (!resPurchases.ok && !resRequests.ok && !resJobs.ok) {
      setError("Could not load dashboard data from the server.");
    }
    setLoading(false);
    return runningJobs;
  }, []);

  // Keeps job progress fresh while any job is running. The timeout is driven
  // from the effect so there is no self-referencing callback inside loadAll.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const poll = async () => {
      const running = await loadAll();
      if (running && !cancelled) {
        timer = setTimeout(() => void poll(), 10_000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadAll]);

  if (needLogin) {
    return (
      <div className="container-x max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-sand-600">Your dashboard</h1>
        <p className="mt-3 text-sm text-sand-500">
          Sign in to see purchased datasets, custom requests, and job progress.
        </p>
        <Link href="/login?next=/dashboard" className="mt-6 inline-block rounded-lg bg-pine-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-500">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="container-x py-10">
      <h1 className="text-2xl font-semibold text-sand-600">Dashboard</h1>
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-6 text-sm text-sand-400">Loading your data…</p>}

      {!loading && !error && (
        <div className="mt-8 space-y-12">
          {/* Purchases */}
          <section>
            <h2 className="text-lg font-semibold text-sand-600">Purchased datasets</h2>
            {purchases && purchases.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border hairline bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand-100 text-xs uppercase tracking-wide text-sand-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Dataset</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Purchased</th>
                      <th className="px-4 py-2.5 font-medium text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y hairline">
                    {purchases.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-3">
                          {o.dataset?.slug ? (
                            <Link href={`/datasets/${o.dataset.slug}`} className="text-pine-700 hover:underline">
                              {o.dataset?.name ?? "Dataset"}
                            </Link>
                          ) : o.dataset ? (
                            o.dataset.name
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-sand-500">
                          ${Number(o.amount).toFixed(2)} {o.currency}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={o.payment_status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-sand-400">
                          {new Date(o.created_at).toISOString().slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {o.payment_status === "completed" && o.dataset?.slug ? (
                            <a
                              href={`/api/datasets/${o.dataset.slug}/download`}
                              className="inline-block rounded-md bg-pine-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pine-500"
                            >
                              Download {o.dataset.format}
                            </a>
                          ) : (
                            <span className="text-xs text-sand-400">— {o.payment_status} —</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {/* Jobs */}
          <section>
            <h2 className="text-lg font-semibold text-sand-600">Collection jobs</h2>
            {jobs && jobs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {jobs.map((j) => (
                  <div key={j.id} className="rounded-xl border hairline bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-sand-600">{j.request_title || j.id}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-sand-400">{j.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusPill status={j.status} />
                        {j.status === "completed" && j.has_result && (
                          <a
                            href={`/api/jobs/${j.id}/download`}
                            className="rounded-md bg-pine-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pine-500"
                          >
                            Download result
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-100">
                        <div
                          className={`h-full rounded-full transition-all ${j.status === "failed" ? "bg-red-400" : "bg-pine-500"}`}
                          style={{ width: `${Math.min(100, Math.max(0, j.progress))}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-sand-400">
                        {j.status === "completed"
                          ? `Completed ${j.completed_at ? new Date(j.completed_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : ""}`
                          : j.status === "failed"
                            ? `Failed: ${j.error_message ?? "unknown error"}`
                            : `${j.progress}% — ${j.stage ?? "queued"}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {/* Custom requests */}
          <section>
            <h2 className="text-lg font-semibold text-sand-600">Custom dataset requests</h2>
            {requests && requests.length > 0 ? (
              <div className="mt-4 space-y-3">
                {requests.map((r) => (
                  <div key={r.id} className="rounded-xl border hairline bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-xl">
                        <p className="text-sm text-sand-600">{r.original_prompt}</p>
                        <p className="mt-1 text-xs text-sand-400">
                          Created {new Date(r.created_at).toISOString().slice(0, 10)}
                          {r.estimated_price ? ` · quoted $${Number(r.estimated_price).toFixed(2)} ${r.currency} · ~${r.estimated_delivery_hours}h` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusPill status={r.status} />
                        {["quoted", "approved"].includes(r.status) && (
                          <Link
                            href="/custom"
                            className="rounded-md border hairline px-3 py-1.5 text-xs text-pine-700 hover:border-pine-300"
                          >
                            Approve & pay
                          </Link>
                        )}
                      </div>
                    </div>
                    {r.job && (
                      <p className="mt-2 text-xs text-sand-400">
                        Job: {r.job.status} · {r.job.progress}%
                        {r.job.stage ? ` · ${r.job.stage}` : ""}
                        {r.job.error_message ? ` · ${r.job.error_message}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {purchases?.length === 0 && requests?.length === 0 && (
            <p className="rounded-xl border hairline bg-white p-6 text-sm text-sand-400">
              Nothing here yet. Explore the{" "}
              <Link className="text-pine-600 hover:underline" href="/marketplace">
                marketplace
              </Link>{" "}
              or submit a custom request.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-pine-100 text-pine-700"
      : status === "failed" || status === "cancelled" || status === "refunded"
        ? "bg-red-100 text-red-700"
        : status === "running" || status === "paid" || status === "in_progress"
          ? "bg-blue-100 text-blue-700"
          : "bg-sand-100 text-sand-500";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>{status}</span>
  );
}
