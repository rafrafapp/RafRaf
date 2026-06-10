import { NextResponse } from "next/server";
import { requireSmart, aiGateError } from "@/lib/ai/guard";
import { reorderStub } from "@/lib/ai/stub";

export const runtime = "nodejs";

// PLACEHOLDER — returns mock reorder suggestions (no real analysis / model call).
export async function GET() {
  const gate = await requireSmart();
  if (!gate.ok) return aiGateError(gate);
  return NextResponse.json(
    { data: reorderStub(), placeholder: true },
    { headers: { "cache-control": "no-store" } },
  );
}
