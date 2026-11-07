"use client";

import { useState } from "react";

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}
interface Schema {
  label?: string;
  synthetic?: boolean;
  synthetic_notice?: string;
  fields?: SchemaField[];
  notes?: string[];
}
interface PreviewData {
  synthetic: boolean;
  synthetic_notice: string | null;
  schema: Schema;
  sample_records: Record<string, unknown>[];
  total_sample_records: number;
}

export function PreviewButton({ datasetId, label = "Preview" }: { datasetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function openPreview() {
    setOpen(true);
    setState("loading");
    setError("");
    try {
      const res = await fetch(`/api/datasets/${datasetId}/preview`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "Failed to load preview");
      setData((await res.json()) as PreviewData);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={openPreview}
        className="rounded-md border hairline bg-white px-3 py-1.5 text-sm text-sand-500 hover:border-pine-300 hover:text-pine-700"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-pine-900/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl fade-up">
            <div className="flex items-center justify-between border-b hairline px-5 py-3">
              <h4 className="font-semibold text-sand-600">Dataset preview — schema & sample records</h4>
              <button onClick={() => setOpen(false)} className="text-sm text-sand-400 hover:text-sand-600" aria-label="Close preview">
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-5">
              {state === "loading" && <p className="text-sm text-sand-400">Loading preview…</p>}
              {state === "error" && <p className="text-sm text-red-600">{error}</p>}
              {data && (
                <>
                  {data.synthetic && (
                    <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      ⚠ {data.synthetic_notice ?? "Simulated demo data — not real measurements."}
                    </p>
                  )}
                  <div className="mb-5">
                    <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-400">
                      Fields ({data.schema.fields?.length ?? 0})
                    </h5>
                    <div className="overflow-hidden rounded-md border hairline">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-sand-100 text-sand-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Column</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Required</th>
                            <th className="px-3 py-2 font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y hairline">
                          {(data.schema.fields ?? []).map((f) => (
                            <tr key={f.name}>
                              <td className="px-3 py-1.5 font-mono text-pine-700">{f.name}</td>
                              <td className="px-3 py-1.5 text-sand-500">{f.type}</td>
                              <td className="px-3 py-1.5 text-sand-400">{f.required ? "yes" : "no"}</td>
                              <td className="px-3 py-1.5 text-sand-400">{f.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-400">
                      Sample records
                    </h5>
                    <div className="overflow-auto rounded-md border hairline">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-sand-100 text-sand-500">
                          <tr>
                            {data.sample_records[0] &&
                              Object.keys(data.sample_records[0]).map((k) => (
                                <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{k}</th>
                              ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y hairline">
                          {data.sample_records.map((row, i) => (
                            <tr key={i}>
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="px-3 py-1.5 font-mono whitespace-nowrap text-sand-500">
                                  {String(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-sand-400">
                      Showing {data.sample_records.length} sample records.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
