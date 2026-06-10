import { randomUUID } from "node:crypto";
import { apiGate, handle } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";
import { parsePaging, apiTransactionSchema } from "@/lib/api/schemas";
import { listTransactions, recordTransaction } from "@/lib/api/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const gate = await apiGate(req, "transactions:read");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const url = new URL(req.url);
    const { limit, offset } = parsePaging(url);
    const data = await listTransactions(gate.principal.merchantId, {
      limit,
      offset,
      type: url.searchParams.get("type"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return apiOk(data, { headers: { "x-page-limit": String(limit) } });
  });
}

export async function POST(req: Request) {
  const gate = await apiGate(req, "transactions:write");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
    const parsed = apiTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        "validation_error",
        parsed.error.issues[0]?.message ?? "Invalid transaction.",
      );
    }
    // Idempotency: honor the caller's client_uuid; generate one if absent.
    const clientUuid = parsed.data.client_uuid ?? randomUUID();
    try {
      const tx = await recordTransaction(
        gate.principal.merchantId,
        parsed.data,
        clientUuid,
      );
      return apiOk(tx, { status: 201 });
    } catch (e) {
      // RPC-level rejections (e.g. unknown type / bad input) → 422 with the reason.
      return apiError(
        422,
        "transaction_failed",
        (e as Error)?.message ?? "Could not record transaction.",
      );
    }
  });
}
