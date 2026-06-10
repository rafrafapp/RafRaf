import { apiGate, handle } from "@/lib/api/handler";
import { apiOk, apiError } from "@/lib/api/respond";
import { productPatchSchema } from "@/lib/api/schemas";
import { getProduct, updateProduct, deleteProduct } from "@/lib/api/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const gate = await apiGate(req, "products:read");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const { id } = await ctx.params;
    const product = await getProduct(gate.principal.merchantId, id);
    if (!product) return apiError(404, "not_found", "Product not found.");
    return apiOk(product);
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await apiGate(req, "products:write");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
    const parsed = productPatchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        "validation_error",
        parsed.error.issues[0]?.message ?? "Invalid product.",
      );
    }
    // Only update keys the caller actually sent.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return apiError(400, "empty_patch", "No updatable fields provided.");
    }
    const updated = await updateProduct(gate.principal.merchantId, id, patch);
    if (!updated) return apiError(404, "not_found", "Product not found.");
    return apiOk(updated);
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await apiGate(req, "products:write");
  if (!gate.ok) return gate.response;
  return handle(async () => {
    const { id } = await ctx.params;
    const deleted = await deleteProduct(gate.principal.merchantId, id);
    if (!deleted) return apiError(404, "not_found", "Product not found.");
    return apiOk({ id, deleted: true });
  });
}
