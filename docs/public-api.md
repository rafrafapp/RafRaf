# RafRaf Public API (v1)

Versioned REST API at `/api/v1/*`. Server-to-server (do **not** call it from a
browser — API keys must stay secret). All responses are JSON, `Cache-Control: no-store`.

## Authentication

Every request (except `GET /api/v1`) requires a per-merchant API key:

```
Authorization: Bearer rafraf_xxxxxxxx…
```

Generate/revoke keys in **Settings → API keys**. The plaintext key is shown **once**
at creation; only its SHA-256 hash + a display prefix are stored. A key is scoped to a
single merchant's data and is either **read-only** or **read-write**.

### Scopes
`products:read|write`, `transactions:read|write`, `customers:read|write`. A read-only
key holds the three `:read` scopes; a read-write key holds all six.

## Responses & errors

- Success: `{ "data": … }` (status `200`, or `201` on create).
- Error: `{ "error": { "code": "…", "message": "…" } }` with the matching HTTP status.

| Status | When |
|---|---|
| 401 `unauthorized` / `invalid_key` | missing/malformed header or unknown key |
| 403 `revoked_key` / `forbidden_scope` | key revoked, or lacks the endpoint's scope |
| 400 `invalid_json` / `validation_error` | bad body |
| 404 `not_found` | resource not in your store |
| 422 `transaction_failed` | the ledger RPC rejected the transaction |
| 429 `rate_limited` | over your plan's per-minute limit (`Retry-After: 60`) |

## Rate limits (per key, per minute)

`free` 60 · `basic` 300 · `smart` 1000. (Enforced only when Upstash is configured;
otherwise fail-open.)

## Endpoints

| Method & path | Scope | Notes |
|---|---|---|
| `GET /api/v1` | — | API info (no key) |
| `GET /api/v1/products` | products:read | `?limit&offset&q&category` |
| `POST /api/v1/products` | products:write | body = product fields |
| `GET /api/v1/products/:id` | products:read | |
| `PATCH /api/v1/products/:id` | products:write | partial update |
| `DELETE /api/v1/products/:id` | products:write | |
| `GET /api/v1/transactions` | transactions:read | `?limit&offset&type&from&to` |
| `POST /api/v1/transactions` | transactions:write | atomic; idempotent on `client_uuid` |
| `GET /api/v1/customers` | customers:read | `?limit&offset&q` |
| `POST /api/v1/customers` | customers:write | |
| `GET /api/v1/customers/:id` | customers:read | |
| `GET /api/v1/inventory/alerts` | products:read | products at/below `min_stock` |

## Examples

```bash
# List products
curl https://<host>/api/v1/products -H "Authorization: Bearer rafraf_xxx"

# Create a product
curl -X POST https://<host>/api/v1/products \
  -H "Authorization: Bearer rafraf_xxx" -H "Content-Type: application/json" \
  -d '{"name":"شاي","sell_price":1500,"cost_price":1000,"stock":50,"unit":"box"}'

# Record a sale — decrements stock atomically; resend the same client_uuid safely
curl -X POST https://<host>/api/v1/transactions \
  -H "Authorization: Bearer rafraf_xxx" -H "Content-Type: application/json" \
  -d '{"type":"sell","product_id":"<uuid>","qty":2,"price":1500,"payment":"cash","client_uuid":"order-1001"}'

# Create a customer
curl -X POST https://<host>/api/v1/customers \
  -H "Authorization: Bearer rafraf_xxx" -H "Content-Type: application/json" \
  -d '{"name":"أحمد","phone":"0991234567"}'
```

### Transaction body

`type` is one of `sell | buy | return_customer | return_supplier | expense |
debt_payment | supplier_payment`. Common fields: `product_id`, `product_name`, `qty`,
`price`, `discount` (0–100), `total` (computed if omitted), `payment`
(`cash|credit|partial`), `currency`, `customer_id`, `supplier_id`, `paid`, `note`, and
`client_uuid` (send a stable one for idempotency). `merchant_id` is always taken from
the API key — never sent in the body.
