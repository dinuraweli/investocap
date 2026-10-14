import { NextResponse } from "next/server";

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export class BadRequest extends Error {}
export class Unauthorized extends Error {}
export class Conflict extends Error {}
export class NotFound extends Error {}

/**
 * Parse a JSON body. Requiring application/json also acts as CSRF protection: browsers
 * cannot send that content type cross-site without a CORS preflight, which we never grant.
 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new BadRequest("Content-Type must be application/json");
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new BadRequest("Invalid JSON body");
  }
}

export function reqString(b: Record<string, unknown>, key: string, max = 200): string {
  const v = b[key];
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`"${key}" is required`);
  if (v.length > max) throw new BadRequest(`"${key}" is too long`);
  return v.trim();
}

export function reqNumber(b: Record<string, unknown>, key: string, { min = 0, minExclusive = false } = {}): number {
  const v = b[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequest(`"${key}" must be a number`);
  if (minExclusive ? v <= min : v < min) throw new BadRequest(`"${key}" must be ${minExclusive ? ">" : ">="} ${min}`);
  return v;
}

/** Wrap a handler so BadRequest becomes a 400 and unexpected errors a generic 500 (logged server-side). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BadRequest) return fail(400, e.message);
      if (e instanceof Unauthorized) return fail(401, "Sign in required");
      if (e instanceof Conflict) return fail(409, e.message);
      if (e instanceof NotFound) return fail(404, e.message);
      console.error("[api]", e);
      return fail(502, "Upstream or server error. Please retry.");
    }
  };
}
