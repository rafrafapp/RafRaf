import { NextResponse } from "next/server";

// Standard JSON envelopes for /api/v1. Success: { data }. Failure:
// { error: { code, message } }. Always no-store (API responses aren't cacheable
// by the CDN). Server-to-server only — no CORS headers (API keys must never be
// used from a browser).

const BASE_HEADERS: Record<string, string> = { "cache-control": "no-store" };

export function apiOk(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  return NextResponse.json(
    { data },
    {
      status: init?.status ?? 200,
      headers: { ...BASE_HEADERS, ...(init?.headers ?? {}) },
    },
  );
}

export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...BASE_HEADERS, ...(headers ?? {}) } },
  );
}
