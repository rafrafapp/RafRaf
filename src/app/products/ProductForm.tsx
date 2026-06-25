"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Dictionary } from "@/i18n/get-dictionary";
import {
  PRODUCT_UNITS,
  productSchema,
  type ProductCustomField,
} from "@/lib/validation/product";
import {
  saveProduct,
  stashProductImage,
  setProductImage,
  clearProductImage,
} from "@/lib/offline/products-repo";
import { syncAll } from "@/lib/offline/sync";
import type { LocalProduct } from "@/lib/offline/db";
import { createUploadSignature, deleteImage } from "@/lib/cloudinary/actions";
import {
  uploadSigned,
  uploadUnsigned,
  buildDeliveryUrl,
  validateImage,
  PRODUCT_IMAGE_SIZE,
} from "@/lib/cloudinary/upload-client";
import { Spinner } from "@/components/Spinner";
import styles from "./product-form.module.css";

// The camera + decoder bundle is heavy and browser-only; load it lazily, only
// when the merchant actually opens the scanner.
const BarcodeScanner = dynamic(
  () => import("@/components/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false },
);

// Camera capture is browser-only (getUserMedia) — load it lazily on demand.
const CameraCapture = dynamic(
  () => import("@/components/CameraCapture").then((m) => m.CameraCapture),
  { ssr: false },
);

// Auto-saved draft of a new (unsaved) product, restored if the merchant leaves
// and comes back. Only used in "create" mode; cleared on save / "start fresh".
const DRAFT_KEY = "product_draft";

type Props = {
  mode: "create" | "edit";
  merchantId: string;
  initial?: LocalProduct;
  customFields: ProductCustomField[];
  products: Dictionary["products"];
  common: Dictionary["common"];
  currency: string;
};

// A throwaway internal code for products without a real barcode. The "200"
// prefix is the GS1 in-store / restricted-distribution range.
function generateBarcode(): string {
  let s = "200";
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return v == null ? "" : v.toString();
}

export function ProductForm({
  mode,
  merchantId,
  initial,
  customFields,
  products,
  common,
  currency,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [nameError, setNameError] = useState(false);

  // Draft restore (create mode only).
  const draftLoadedRef = useRef(false);
  const [draftFound, setDraftFound] = useState(false);

  // Persist the current form values to localStorage (excluding the image).
  function saveDraft() {
    if (mode !== "create" || !draftLoadedRef.current) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const obj: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") obj[k] = v;
    }
    const hasContent = Object.values(obj).some(
      (v) => v && v.trim() !== "" && v.trim() !== "0",
    );
    try {
      if (hasContent) localStorage.setItem(DRAFT_KEY, JSON.stringify(obj));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  // On mount (create only): read any saved draft, restore the fields into the
  // uncontrolled inputs, and show the "draft found" banner.
  useEffect(() => {
    if (mode !== "create") {
      draftLoadedRef.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, string>;
        const form = formRef.current;
        if (form) {
          for (const [k, v] of Object.entries(data)) {
            if (k === "barcode") {
              setBarcode(v);
              continue;
            }
            const el = form.elements.namedItem(k) as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
              | null;
            if (el && "value" in el) el.value = v;
          }
        }
        setDraftFound(true);
      }
    } catch {
      /* ignore malformed draft */
    }
    draftLoadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist programmatic barcode changes (generate / scan) — these don't fire
  // the form's onInput.
  useEffect(() => {
    saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDraftFound(false);
    formRef.current?.reset();
    setBarcode("");
    setImageFile(null);
    setPreview(null);
    setImgError(null);
  }

  // Optional image (offline-first): picked locally, uploaded in the foreground when
  // online (with a % bar) or stashed for upload on sync when offline.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial?.image_url ?? null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const img = products.image as Record<string, string>;

  function onPickImage(file: File | null) {
    setImgError(null);
    if (!file) return;
    const v = validateImage(file);
    if (v) {
      setImgError(v === "too_large" ? img.tooLarge : img.invalidType);
      return;
    }
    setImageFile(file);
    setRemoveExisting(false);
    setPreview(URL.createObjectURL(file));
  }

  function onRemoveImage() {
    setImageFile(null);
    setPreview(null);
    setRemoveExisting(true);
    setImgError(null);
  }

  // Apply the chosen image to a just-saved product. Never throws — image is optional.
  async function applyImage(productId: string): Promise<void> {
    if (removeExisting && !imageFile) {
      if (initial?.image_url || initial?.image_public_id) {
        await clearProductImage(productId);
        if (initial?.image_public_id) {
          try {
            await deleteImage(initial.image_public_id);
          } catch {
            /* best-effort */
          }
        }
      }
      return;
    }
    if (!imageFile) return;

    const online = typeof navigator === "undefined" || navigator.onLine;
    if (online) {
      try {
        const sig = await createUploadSignature("product");
        setUploadPct(0);
        const { publicId, version } = sig
          ? await uploadSigned(imageFile, sig, setUploadPct)
          : await uploadUnsigned(imageFile, "rafraf/products", setUploadPct);
        const url = buildDeliveryUrl(publicId, version, PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE);
        await setProductImage(productId, url, publicId);
        if (initial?.image_public_id && initial.image_public_id !== publicId) {
          try { await deleteImage(initial.image_public_id); } catch { /* best-effort */ }
        }
        setUploadPct(null);
        return;
      } catch {
        setUploadPct(null);
        // fall through → stash for sync
      }
    }
    await stashProductImage(merchantId, productId, imageFile);
  }

  const units = products.units as Record<string, string>;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Custom Arabic validation (no native browser tooltip): name is required.
    if (!str(formData, "name").trim()) {
      setNameError(true);
      setError(null);
      return;
    }
    setNameError(false);

    // Assemble custom_fields from ONLY the keys valid for this business type.
    const custom: Record<string, string | number> = {};
    for (const def of customFields) {
      const raw = str(formData, `cf_${def.key}`).trim();
      if (!raw) continue;
      if (def.type === "number") {
        const n = Number(raw);
        if (!Number.isNaN(n)) custom[def.key] = n;
      } else {
        custom[def.key] = raw;
      }
    }

    const parsed = productSchema.safeParse({
      name: str(formData, "name"),
      name_en: str(formData, "name_en"),
      barcode: str(formData, "barcode"),
      category: str(formData, "category"),
      subcategory: "",
      // Empty number fields default to 0 (inputs start blank, not pre-filled "0").
      cost_price: str(formData, "cost_price") || "0",
      sell_price: str(formData, "sell_price") || "0",
      stock: str(formData, "stock") || "0",
      min_stock: str(formData, "min_stock") || "0",
      unit: str(formData, "unit"),
      notes: str(formData, "notes"),
      custom_fields: custom,
    });
    if (!parsed.success) {
      setError(products.errors.invalid);
      return;
    }

    startTransition(async () => {
      try {
        // Write to IndexedDB first (works offline), then handle the (optional)
        // image, then push best-effort.
        const id = await saveProduct({
          mode,
          merchantId,
          base: initial,
          data: parsed.data,
        });
        await applyImage(id);
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
        void syncAll(merchantId).catch(() => {});
        router.push("/products");
      } catch {
        setError(products.errors.failed);
      }
    });
  }

  const draft = products.draft as Record<string, string>;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={saveDraft}
      onChange={saveDraft}
      className={styles.form}
      noValidate
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {draftFound && (
        <div className={styles.draftBanner}>
          <span>{draft.found}</span>
          <div className={styles.draftActions}>
            <button
              type="button"
              className={styles.draftKeep}
              onClick={() => setDraftFound(false)}
            >
              {draft.keep}
            </button>
            <button
              type="button"
              className={styles.draftFresh}
              onClick={discardDraft}
            >
              {draft.fresh}
            </button>
          </div>
        </div>
      )}

      <label className={styles.label}>
        {products.fields.name}
        <input
          className={styles.input}
          name="name"
          maxLength={200}
          defaultValue={initial?.name ?? ""}
          aria-invalid={nameError}
          onInput={() => nameError && setNameError(false)}
        />
        {nameError && (
          <span className={styles.fieldError}>{common.required}</span>
        )}
      </label>

      <label className={styles.label}>
        {products.fields.nameEn}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="name_en"
          maxLength={200}
          dir="ltr"
          defaultValue={initial?.name_en ?? ""}
        />
      </label>

      <label className={styles.label}>
        {products.fields.barcode}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <span className={styles.barcodeRow}>
          <input
            className={styles.input}
            name="barcode"
            maxLength={120}
            dir="ltr"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <button
            type="button"
            className={styles.scanBtn}
            onClick={() => setScanning(true)}
          >
            {products.scan}
          </button>
          <button
            type="button"
            className={styles.genBtn}
            onClick={() => setBarcode(generateBarcode())}
          >
            {products.generate}
          </button>
        </span>
      </label>

      <label className={styles.label}>
        {products.fields.category}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="category"
          maxLength={120}
          defaultValue={initial?.category ?? ""}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.label}>
          {products.fields.costPrice} ({currency})
          <input
            className={styles.input}
            name="cost_price"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            defaultValue={initial ? String(initial.cost_price) : ""}
          />
        </label>
        <label className={styles.label}>
          {products.fields.sellPrice} ({currency})
          <input
            className={styles.input}
            name="sell_price"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            defaultValue={initial ? String(initial.sell_price) : ""}
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.label}>
          {products.fields.stock}
          <input
            className={styles.input}
            name="stock"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            defaultValue={initial ? String(initial.stock) : ""}
          />
        </label>
        <label className={styles.label}>
          {products.fields.unit}
          <select
            className={styles.input}
            name="unit"
            defaultValue={initial?.unit ?? ""}
          >
            <option value="">{products.selectUnit}</option>
            {PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {units[u]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.label}>
        {products.fields.minStock}
        <input
          className={styles.input}
          name="min_stock"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          dir="ltr"
          defaultValue={initial ? String(initial.min_stock) : ""}
        />
        <span className={styles.muted}>{products.fields.minStockHint}</span>
      </label>

      {customFields.length > 0 && (
        <div className={styles.customSection}>
          {customFields.map((f) => (
            <label key={f.key} className={styles.label}>
              {f.label}{" "}
              <span className={styles.muted}>({common.optional})</span>
              <input
                className={styles.input}
                name={`cf_${f.key}`}
                type={
                  f.type === "number"
                    ? "number"
                    : f.type === "date"
                      ? "date"
                      : "text"
                }
                step={f.type === "number" ? "any" : undefined}
                dir={f.type === "text" ? undefined : "ltr"}
                defaultValue={
                  initial?.custom_fields?.[f.key] != null
                    ? String(initial.custom_fields[f.key])
                    : ""
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className={styles.label}>
        {img.label} <span className={styles.muted}>({common.optional})</span>
        <div className={styles.imageRow}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className={styles.imgPreview} />
          ) : (
            <span className={styles.imgPlaceholder} aria-hidden>
              🖼️
            </span>
          )}
          <div className={styles.imgActions}>
            <div className={styles.imgButtons}>
              <button
                type="button"
                className={styles.imgBtn}
                disabled={pending}
                onClick={() => setCameraOpen(true)}
              >
                📷 {img.capture}
              </button>
              <button
                type="button"
                className={styles.imgBtn}
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
              >
                ⬆️ {img.upload}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              disabled={pending}
              onChange={(e) => {
                onPickImage(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {preview && !removeExisting && (
              <button
                type="button"
                className={styles.removeImg}
                disabled={pending}
                onClick={onRemoveImage}
              >
                {img.remove}
              </button>
            )}
            <span className={styles.imgHint}>{img.hint}</span>
          </div>
        </div>
        {imgError && (
          <span className={styles.error} role="alert">
            {imgError}
          </span>
        )}
        {uploadPct != null && (
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ inlineSize: `${uploadPct}%` }}
            />
          </div>
        )}
      </div>

      <label className={styles.label}>
        {products.fields.notes}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <textarea
          className={styles.textarea}
          name="notes"
          maxLength={2000}
          rows={3}
          defaultValue={initial?.notes ?? ""}
        />
      </label>

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            {products.saving}
          </>
        ) : (
          products.save
        )}
      </button>

      {scanning && (
        <BarcodeScanner
          onDetected={(text) => {
            setBarcode(text);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
          labels={{
            title: products.scanTitle,
            hint: products.scanHint,
            error: products.scanError,
            close: products.scanClose,
            upload: products.scanUpload,
          }}
        />
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            onPickImage(file);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
          labels={{
            title: img.cameraTitle,
            capture: img.cameraCapture,
            retake: img.cameraRetake,
            confirm: img.cameraConfirm,
            close: products.scanClose,
            error: img.cameraError,
            zoom: img.cameraZoom,
          }}
        />
      )}
    </form>
  );
}
