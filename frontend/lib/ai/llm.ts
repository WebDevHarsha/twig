/**
 * LLM service abstraction.
 *
 * Providers are NOT hardcoded: read credentials from the environment.
 *   AI_API_KEY, AI_BASE_URL (OpenAI-compatible base, optional), AI_MODEL
 *
 * Every call requests strict JSON and validates it against a Zod schema.
 * If AI credentials are missing (or a call/validation fails), callers use the
 * deterministic fallback in lib/ai/fallback.ts — the app must never break,
 * and the LLM must never be the source of truth for prices, feasibility or
 * which datasets exist.
 */

import type { z } from "zod";

export function aiConfigured(): boolean {
  return Boolean(
    process.env.AI_API_KEY &&
      process.env.AI_MODEL &&
      (process.env.AI_BASE_URL || "https://api.openai.com/v1")
  );
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatJsonArgs<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

const TIMEOUT_MS = 25_000;

export async function chatJson<T>(args: ChatJsonArgs<T>): Promise<
  { ok: true; value: T } | { ok: false; error: string }
> {
  if (!aiConfigured()) {
    return { ok: false, error: "AI credentials are not configured." };
  }
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.AI_MODEL as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `AI request failed (${res.status}): ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "AI returned an empty completion." };

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content.replace(/^```json\s*|```\s*$/g, "").trim());
    } catch {
      return { ok: false, error: "AI returned non-JSON content." };
    }
    const validated = args.schema.safeParse(parsedJson);
    if (!validated.success) {
      return { ok: false, error: "AI output failed schema validation." };
    }
    return { ok: true, value: validated.data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
