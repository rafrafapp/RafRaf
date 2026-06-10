import { apiGate, handle } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { lowStockAlerts } from "@/lib/api/db";

export const runtime = "nodejs";

// Low-stock alerts: products at or below their min_stock (stock <= min_stock).
export async function GET(req: Request) {
  const gate = await apiGate(req, "products:read");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const data = await lowStockAlerts(gate.principal.merchantId);
    return apiOk(data);
  });
}
