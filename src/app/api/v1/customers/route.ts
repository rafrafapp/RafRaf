import { apiGate, handle } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";
import { parsePaging } from "@/lib/api/schemas";
import { listCustomers, createCustomer } from "@/lib/api/db";
import { customerSchema } from "@/lib/validation/customer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const gate = await apiGate(req, "customers:read");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const url = new URL(req.url);
    const { limit, offset } = parsePaging(url);
    const data = await listCustomers(gate.principal.merchantId, {
      limit,
      offset,
      q: url.searchParams.get("q"),
    });
    return apiOk(data, { headers: { "x-page-limit": String(limit) } });
  });
}

export async function POST(req: Request) {
  const gate = await apiGate(req, "customers:write");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        "validation_error",
        parsed.error.issues[0]?.message ?? "Invalid customer.",
      );
    }
    const created = await createCustomer(gate.principal.merchantId, parsed.data);
    return apiOk(created, { status: 201 });
  });
}
