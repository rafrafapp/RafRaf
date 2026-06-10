import { apiOk } from "@/lib/api/respond";

export const runtime = "nodejs";

// Public API info (no key required). Lists the available endpoints.
export async function GET() {
  return apiOk({
    name: "RafRaf API",
    version: "v1",
    auth: "Authorization: Bearer rafraf_…",
    docs: "/docs/public-api.md",
    endpoints: [
      "GET    /api/v1/products",
      "POST   /api/v1/products",
      "GET    /api/v1/products/:id",
      "PATCH  /api/v1/products/:id",
      "DELETE /api/v1/products/:id",
      "GET    /api/v1/transactions",
      "POST   /api/v1/transactions",
      "GET    /api/v1/customers",
      "POST   /api/v1/customers",
      "GET    /api/v1/customers/:id",
      "GET    /api/v1/inventory/alerts",
    ],
  });
}
