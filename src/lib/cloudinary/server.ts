import "server-only";
import { v2 as cloudinary } from "cloudinary";

// Server-only Cloudinary access. CLOUDINARY_API_SECRET never leaves the server —
// the client only ever receives a short-lived signature (see actions.ts). No-op /
// null when unconfigured (image upload stays optional).

let _configured = false;
function configure(): boolean {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud_name || !api_key || !api_secret) return false;
  if (!_configured) {
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
    _configured = true;
  }
  return true;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

export type SignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
};

// Sign an upload for ONE specific public_id (the folder path is baked into it).
// Only public_id + timestamp are signed, so a tampered folder/public_id breaks the
// signature — the client can't upload anywhere else.
export function signUpload(publicId: string): SignedUpload | null {
  if (!configure()) return null;
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, timestamp },
    process.env.CLOUDINARY_API_SECRET!.trim(),
  );
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY!.trim(),
    timestamp,
    signature,
    publicId,
  };
}

// Best-effort delete of a stored asset (used when an image is replaced/removed).
export async function destroyImage(publicId: string): Promise<void> {
  if (!configure()) return;
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch {
    // swallow — a failed cleanup must never break the request
  }
}
