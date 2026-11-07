import { z } from "zod";
import { NextResponse } from "next/server";

/** Standard JSON success envelope. */
export function ok(data: unknown, initStatus = 200) {
  return NextResponse.json(data, { status: initStatus });
}

/** Standard JSON error envelope. */
export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Convenience wrappers for common statuses. */
export const badRequest = (msg: string) => fail(400, "bad_request", msg);
export const unauthorized = (msg = "Sign in to continue.") =>
  fail(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have access to this resource.") =>
  fail(403, "forbidden", msg);
export const notFound = (msg = "Resource not found.") => fail(404, "not_found", msg);
export const conflict = (msg: string) => fail(409, "conflict", msg);
export const unavailable = (msg: string) => fail(503, "unavailable", msg);

export function internal(msg = "Unexpected server error.") {
  return fail(500, "internal", msg);
}

/** Parse + validate a JSON body against a Zod schema; throws ApiFail. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFail(400, "bad_request", "Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiFail(400, "validation_error", first?.message || "Invalid request body.");
  }
  return result.data;
}

export class ApiFail extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Uniform errors for route handlers. */
export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiFail) {
      return fail(error.status, error.code, error.message);
    }
    // Some route handlers `throw` one of the convenience response helpers
    // (unauthorized()/forbidden()/…). Honor them instead of leaking a 500.
    if (error instanceof Response) {
      return error;
    }
    console.error("[api] unhandled error", error);
    return internal(
      error instanceof Error ? error.message : "Unexpected server error."
    );
  }
}

/** Deep clone through JSON to guarantee a JSON-serializable payload. */
export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeId(value: unknown): string {
  return typeof value === "string" ? value : "";
}
