import { apiGate, handle } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";
import { getCustomer } from "@/lib/api/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await apiGate(req, "customers:read");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const { id } = await ctx.params;
    const customer = await getCustomer(gate.principal.merchantId, id);
    if (!customer) return apiError(404, "not_found", "Customer not found.");
    return apiOk(customer);
  });
}
