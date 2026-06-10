import { NextResponse } from "next/server";
import { requireSmart, aiGateError } from "@/lib/ai/guard";
import { chatReplyStub } from "@/lib/ai/stub";

export const runtime = "nodejs";

// PLACEHOLDER — "chat with your data" in Arabic. Returns a canned reply that echoes
// the question. NO Claude API call (see lib/ai/claude.ts for the future wiring).
export async function POST(req: Request) {
  const gate = await requireSmart();
  if (!gate.ok) return aiGateError(gate);

  let message = "";
  try {
    const body = (await req.json()) as { message?: unknown };
    if (typeof body?.message === "string") message = body.message.slice(0, 2000);
  } catch {
    // ignore — empty message yields the generic stub reply
  }

  return NextResponse.json(
    { data: { reply: chatReplyStub(message) }, placeholder: true },
    { headers: { "cache-control": "no-store" } },
  );
}
