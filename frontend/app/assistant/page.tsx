"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}
interface Recommendation {
  dataset_id: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  reason: string;
}
interface ChatResponse {
  reply: string;
  recommendations: Recommendation[];
  custom_request_proposal: {
    suggested_prompt: string;
    estimated_price: number;
    estimated_delivery_hours: number;
    note: string;
  } | null;
  mode: "ai" | "fallback";
}

const DEFAULT_PROMPT = "I need API latency benchmarks for payment providers in India.";

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    setError("");
    const nextMessages = [...messages, { role: "user", content } as Message];
    setMessages(nextMessages);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.filter((m) => m.role === "user") }),
      });
      if (res.status === 401) {
        setError("Sign in to chat with the assistant.");
        setPending(false);
        return;
      }
      const json = (await res.json()) as ChatResponse & {
        error?: { message: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? "Assistant request failed.");

      let reply = json.reply;
      if (json.recommendations.length) {
        reply +=
          "\n\nRecommendations:\n" +
          json.recommendations
            .map((r, i) => `${i + 1}. ${r.name} — $${r.price.toFixed(2)} ${r.currency}\n   Why: ${r.reason}`)
            .join("\n");
        reply += "\n\nOpen: " + json.recommendations.map((r) => `/datasets/${r.slug}`).join(", ");
      }
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
      void json.mode;
      void json.custom_request_proposal;
      setPending(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999 }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending(false);
    }
  }

  return (
    <div className="container-x max-w-3xl py-10">
      <h1 className="text-2xl font-semibold text-sand-600">Dataset assistant</h1>
      <p className="mt-2 text-sm text-sand-400">
        Ask for the data you have in mind. The assistant searches the real catalog, explains
        matches, and suggests a custom request when nothing fits. It never authorizes or captures
        payments — checkout stays in your hands.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          DEFAULT_PROMPT,
          "Which datasets cover API uptime history?",
          "I need regional API performance comparison data for finance apps.",
        ].map((q) => (
          <button
            key={q}
            onClick={() => void send(q)}
            disabled={pending || messages.length > 0}
            className="rounded-full border hairline bg-white px-3 py-1.5 text-xs text-sand-500 hover:border-pine-300 hover:text-pine-700 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="mt-6 max-h-[55vh] min-h-64 space-y-4 overflow-y-auto rounded-xl border hairline bg-white p-5"
      >
        {messages.length === 0 && (
          <p className="text-sm text-sand-400">
            No conversation yet. Try the example prompts above.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`fade-up max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-pine-600 text-white"
                : "bg-sand-100 text-sand-600"
            }`}
            style={{ whiteSpace: "pre-wrap" }}
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <div className="max-w-[85%] rounded-lg bg-sand-100 px-4 py-3">
            <span className="inline-flex gap-1">
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-pine-500" />
            </span>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the data you need…"
          className="flex-1 rounded-lg border hairline bg-white px-4 py-2.5 text-sm outline-none focus:border-pine-400"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-pine-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-500 disabled:opacity-60"
        >
          Send
        </button>
      </form>

      <p className="mt-4 text-xs text-sand-400">
        The assistant only suggests datasets from the live catalog. Custom quotes shown here are
        computed by TWIG&apos;s pricing engine. To buy, open the dataset page or submit a{" "}
        <Link href="/custom" className="text-pine-600 hover:underline">
          custom request
        </Link>
        .
      </p>
    </div>
  );
}
