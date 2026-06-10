// Browser-only Cloudinary helpers. No secret here — the upload uses a server-
// generated signature (see actions.createUploadSignature). Imported by the product
// form (foreground upload + progress) and the sync engine (offline-stored images).

export type SignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
};

export type UploadResult = { publicId: string; version: number };

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// Returns an error code, or null if the file is an acceptable image.
export function validateImage(file: File): "too_large" | "invalid_type" | null {
  if (!file.type.startsWith("image/")) return "invalid_type";
  if (file.size > MAX_BYTES) return "too_large";
  return null;
}

// Direct signed upload to Cloudinary with progress (XHR exposes upload progress;
// fetch doesn't). Resolves with the stored public_id + version.
export function uploadSigned(
  blob: Blob,
  sig: SignedUpload,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob);
    form.append("api_key", sig.apiKey);
    form.append("timestamp", String(sig.timestamp));
    form.append("public_id", sig.publicId);
    form.append("signature", sig.signature);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText) as {
            public_id: string;
            version: number;
          };
          resolve({ publicId: r.public_id, version: r.version });
        } catch {
          reject(new Error("cloudinary: bad response"));
        }
      } else {
        reject(new Error(`cloudinary: upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("cloudinary: network error"));
    xhr.send(form);
  });
}

// Delivery URL with auto-format (WebP/AVIF) + auto-quality + fit-within resize.
export function buildDeliveryUrl(
  publicId: string,
  version: number,
  w: number,
  h: number,
): string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const t = `f_auto,q_auto,c_limit,w_${w},h_${h}`;
  return `https://res.cloudinary.com/${cloud}/image/upload/${t}/v${version}/${publicId}`;
}

export const PRODUCT_IMAGE_SIZE = 800;
export const LOGO_IMAGE_SIZE = 200;
