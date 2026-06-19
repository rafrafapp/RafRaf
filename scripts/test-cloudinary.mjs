// Diagnostic: reproduce the browser's signed Cloudinary upload server-side to get
// the exact error. Run: node --env-file=.env.local scripts/test-cloudinary.mjs
import { v2 as cloudinary } from "cloudinary";

const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

console.log("cloud_name present:", Boolean(cloud), cloud ? `(${cloud})` : "");
console.log("api_key present:", Boolean(apiKey));
console.log("api_secret present:", Boolean(apiSecret), apiSecret ? `(len ${apiSecret.length})` : "");
console.log(
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:",
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "(unset)",
);

if (!cloud || !apiKey || !apiSecret) {
  console.error("Missing Cloudinary env — aborting.");
  process.exit(1);
}

const timestamp = Math.round(Date.now() / 1000);
const publicId = `rafraf/_diagnostic/test_${timestamp}`;
const signature = cloudinary.utils.api_sign_request(
  { public_id: publicId, timestamp },
  apiSecret,
);

// 1x1 transparent PNG
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "t.png");
form.append("api_key", apiKey);
form.append("timestamp", String(timestamp));
form.append("public_id", publicId);
form.append("signature", signature);

const url = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;
console.log("\nPOST", url);
const res = await fetch(url, { method: "POST", body: form });
const text = await res.text();
console.log("HTTP status:", res.status);
console.log("Response:", text.slice(0, 1500));

if (res.ok) {
  try {
    cloudinary.config({ cloud_name: cloud, api_key: apiKey, api_secret: apiSecret, secure: true });
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
    console.log("\n✅ Upload OK — test asset cleaned up.");
  } catch (e) {
    console.log("\n⚠️ Upload OK but cleanup failed:", e?.message);
  }
} else {
  console.log("\n❌ Upload FAILED — this is why product images don't store.");
}
