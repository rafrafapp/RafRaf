import "server-only";
import { NextResponse } from "next/server";
import { getUser, getMerchant } from "@/lib/auth/merchant";
import { rateLimit } from "@/lib/security/ratelimit";

// AI features are gated to the "smart" plan. These endpoints are session-authed
// (the in-app dashboard calls them), so we derive the plan from the merchant row
// server-side — never trust the client. Phase 12 is a PLACEHODLER: the guard is
// real, but the handlers return mock data (no Claude API calls yet).

export type AiGate =
  | { ok: true; merchantId: string; plan: string }
  | {
      ok: false;
      status: number;
      code: "unauthorized" | "smart_plan_required" | "rate_limited";
    };

export async function requireSmart(): Promise<AiGate> {
  const user = await getUser();
  if (!user) return { ok: false, status: 401, code: "unauthorized" };
  const merchant = await getMerchant();
  if (!merchant) return { ok: false, status: 401, code: "unauthorized" };
  if (merchant.plan !== "smart") {
    return { ok: false, status: 403, code: "smart_plan_required" };
  }
  // Per-merchant rate limit (Node — Upstash never reaches the Edge runtime).
  // No-op until Upstash is configured.
  if (!(await rateLimit(`ai:${merchant.id}`, 30)).success) {
    return { ok: false, status: 429, code: "rate_limited" };
  }
  return { ok: true, merchantId: merchant.id, plan: merchant.plan };
}

const MESSAGES: Record<string, string> = {
  unauthorized: "Authentication required.",
  smart_plan_required: "This feature requires the Smart plan.",
  rate_limited: "Rate limit exceeded. Try again shortly.",
};

export function aiGateError(
  gate: Extract<AiGate, { ok: false }>,
): NextResponse {
  return NextResponse.json(
    { error: { code: gate.code, message: MESSAGES[gate.code] ?? gate.code } },
    { status: gate.status, headers: { "cache-control": "no-store" } },
  );
}
