# Cloudinary image upload

Optional product images + store logo. Uploads are **signed server-side** — the API
secret never reaches the browser; the browser uploads the file directly to Cloudinary
with a short-lived signature.

## Setup
1. Create a Cloudinary account. The dashboard shows **Cloud name**, **API Key**, **API Secret**.
2. Add to `.env.local`:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud
   CLOUDINARY_API_KEY=1234567890
   CLOUDINARY_API_SECRET=xxxxxxxx
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
   ```
   No unsigned upload preset is needed — uploads are signed.
3. Restart the server.

## How it works
- Assets live under `rafraf/<merchantId>/{products,logos}/…`. The signature pins the
  public_id (folder), so a merchant can't upload into — or delete from — another
  tenant's folder. `lib/cloudinary/actions.ts` (`createUploadSignature`, `deleteImage`,
  `updateStoreLogo`) is auth-checked and prefix-scoped.
- **Delivery transform** `f_auto,q_auto,c_limit,w_<W>,h_<H>` → WebP/AVIF, optimized, fit
  within 800×800 (products) / 200×200 (logo). The original is stored.
- **Product images are offline-first**: picked online → foreground upload with a % bar;
  picked offline (or a foreground upload failed) → held in IndexedDB (`product_images`)
  and uploaded on the next sync (`pushPendingProductImages`). Replacing an image deletes
  the old asset.
- **Store logo** uploads online from Settings.
- Everything is **optional**: with the env unset, the upload helpers no-op and
  products/logo save normally.

## Limits
- Max file size 2 MB, images only (enforced client-side; Cloudinary also rejects
  server-side).

## Verify
- Add a product image online → progress bar → thumbnail in the list; the stored URL
  contains `f_auto,q_auto,…,w_800`. Replace it → the old asset disappears from the
  Cloudinary Media Library.
- Add a product image offline (DevTools → Network → Offline) → "📷 pending upload" badge →
  reconnect → uploads on sync.
- Save a product with no image → works exactly as before.
- Settings → Store logo → upload (200px) → replace deletes the old.
