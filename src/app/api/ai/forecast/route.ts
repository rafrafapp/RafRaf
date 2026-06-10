import { NextResponse } from "next/server";
import { requireSmart, aiGateError } from "@/lib/ai/guard";
import { forecastStub } from "@/lib/ai/stub";

export const runtime = "nodejs";

// PLACEHOLDER — returns a mock demand forecast (no real analysis / model call).
export async function GET() {
  const gate = await requireSmart();
  if (!gate.ok) return aiGateError(gate);
  return NextResponse.json(
    { data: forecastStub(), placeholder: true },
    { headers: { "cache-control": "no-store" } },
  );
}
