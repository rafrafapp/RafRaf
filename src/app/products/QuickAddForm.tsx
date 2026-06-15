"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { productSchema } from "@/lib/validation/product";
import { getDb } from "@/lib/offline/db";
import {
  saveProduct,
  stashProductImage,
  setProductImage,
} from "@/lib/offline/products-repo";
import { syncAll } from "@/lib/offline/sync";
import { createUploadSignature } from "@/lib/cloudinary/actions";
import {
  uploadSigned,
  buildDeliveryUrl,
  validateImage,
  PRODUCT_IMAGE_SIZE,
} from "@/lib/cloudinary/upload-client";
import { Spinner } from "@/components/Spinner";
import styles from "./product-form.module.css";

const BarcodeScanner = dynamic(
  () => import("@/components/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false },
);
const CameraCapture = dynamic(
  () => import("@/components/CameraCapture").then((m) => m.CameraCapture),
  { ssr: false },
);

// The quick-add unit choices (in the requested order).
const QUICK_UNITS = ["piece", "kg", "liter", "meter", "box", "dozen"] as const;

function generateBarcode(): string {
  let s = "200";
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10);
  return s;
}

type Props = {
  merchantId: string;
  products: Dictionary["products"];
  common: Dictionary["common"];
  currency: string;
  locale: Locale;
};

export function QuickAddForm({
  merchantId,
  products,
  common,
  currency,
}: Props) {
  const [pending, startTransition] = useTransition();

  // Required fields
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [minTouched, setMinTouched] = useState(false);
  const [unit, setUnit] = useState(""); // kept across saves
  const [nameError, setNameError] = useState(false);

  // Optional (collapsed) section
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [category, setCategory] = useState(""); // kept across saves
  const [catOpen, setCatOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);

  const units = products.units as Record<string, string>;
  const img = products.image as Record<string, string>;
  const qa = products.quickAdd;

  // Existing categories (for the smart search).
  const allCats =
    useLiveQuery(
      async () => {
        const rows = await getDb()
          .products.where("[merchant_id+_deleted]")
          .equals([merchantId, 0])
          .toArray();
        const set = new Set<string>();
        for (const r of rows) if (r.category) set.add(r.category);
        return [...set].sort();
      },
      [merchantId],
      [],
    ) ?? [];

  const catQuery = category.trim().toLowerCase();
  const catMatches = useMemo(
    () =>
      (catQuery
        ? allCats.filter((c) => c.toLowerCase().includes(catQuery))
        : allCats
      ).slice(0, 6),
    [allCats, catQuery],
  );
  const exactCat = allCats.some((c) => c.toLowerCase() === catQuery);

  // Auto-suggest حد التنبيه = 10% of stock (min 1) until the user edits it.
  function onStockChange(v: string) {
    setStock(v);
    if (minTouched) return;
    const n = Number(v);
    setMinStock(
      v.trim() !== "" && !Number.isNaN(n) && n > 0
        ? String(Math.max(1, Math.round(n * 0.1)))
        : "",
    );
  }

  function onPickImage(file: File | null) {
    setImgError(null);
    if (!file) return;
    const v = validateImage(file);
    if (v) {
      setImgError(v === "too_large" ? img.tooLarge : img.invalidType);
      return;
    }
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function applyImage(productId: string): Promise<void> {
    if (!imageFile) return;
    const online = typeof navigator === "undefined" || navigator.onLine;
    if (online) {
      try {
        const sig = await createUploadSignature("product");
        if (sig) {
          setUploadPct(0);
          const { publicId, version } = await uploadSigned(
            imageFile,
            sig,
            setUploadPct,
          );
          const url = buildDeliveryUrl(
            publicId,
            version,
            PRODUCT_IMAGE_SIZE,
            PRODUCT_IMAGE_SIZE,
          );
          await setProductImage(productId, url, publicId);
          setUploadPct(null);
          return;
        }
      } catch {
        setUploadPct(null); // fall through → stash for sync
      }
    }
    await stashProductImage(merchantId, productId, imageFile);
  }

  // Reset for the next product, KEEPING unit + category (per spec).
  function resetForNext() {
    setName("");
    setCost("");
    setSell("");
    setStock("");
    setMinStock("");
    setMinTouched(false);
    setNameEn("");
    setBarcode("");
    setImageFile(null);
    setPreview(null);
    setImgError(null);
    setUploadPct(null);
    setNameError(false);
    setError(null);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      setError(null);
      return;
    }
    setNameError(false);

    const parsed = productSchema.safeParse({
      name,
      name_en: nameEn,
      barcode,
      category,
      subcategory: "",
      // Empty number fields default to 0 (inputs start blank).
      cost_price: cost || "0",
      sell_price: sell || "0",
      stock: stock || "0",
      min_stock: minStock || "0",
      unit,
      notes: "",
      custom_fields: {},
    });
    if (!parsed.success) {
      setError(products.errors.invalid);
      return;
    }

    startTransition(async () => {
      try {
        const id = await saveProduct({ mode: "create", merchantId, data: parsed.data });
        await applyImage(id);
        void syncAll(merchantId).catch(() => {});
        resetForNext(); // keeps unit + category
        setToast(true);
        if (typeof window !== "undefined")
          window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setToast(false), 2200);
      } catch {
        setError(products.errors.failed);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      {toast && <div className={styles.toast}>{qa.saved}</div>}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* Name (AR) — required, full width */}
      <label className={styles.label}>
        {products.fields.name}
        <input
          className={styles.input}
          value={name}
          maxLength={200}
          aria-invalid={nameError}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(false);
          }}
        />
        {nameError && (
          <span className={styles.fieldError}>{common.required}</span>
        )}
      </label>

      {/* Cost + Sell (50/50) */}
      <div className={styles.row}>
        <label className={styles.label}>
          {products.fields.costPrice} ({currency})
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          {products.fields.sellPrice} ({currency})
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={sell}
            onChange={(e) => setSell(e.target.value)}
          />
        </label>
      </div>

      {/* Stock + Min-stock (50/50) */}
      <div className={styles.row}>
        <label className={styles.label}>
          {products.fields.stock}
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={stock}
            onChange={(e) => onStockChange(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          {products.fields.minStock}
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={minStock}
            onChange={(e) => {
              setMinTouched(true);
              setMinStock(e.target.value);
            }}
          />
          <span className={styles.muted}>{qa.minStockHint}</span>
        </label>
      </div>

      {/* Unit */}
      <label className={styles.label}>
        {products.fields.unit}
        <select
          className={styles.input}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="">{products.selectUnit}</option>
          {QUICK_UNITS.map((u) => (
            <option key={u} value={u}>
              {units[u]}
            </option>
          ))}
        </select>
      </label>

      {/* Optional (collapsed) */}
      <button
        type="button"
        className={styles.optionalToggle}
        onClick={() => setOptionalOpen((v) => !v)}
        aria-expanded={optionalOpen}
      >
        {qa.optional} {optionalOpen ? "−" : "+"}
      </button>

      {optionalOpen && (
        <div className={styles.customSection}>
          <label className={styles.label}>
            {products.fields.nameEn}{" "}
            <span className={styles.muted}>({common.optional})</span>
            <input
              className={styles.input}
              dir="ltr"
              maxLength={200}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </label>

          {/* Category — smart search / add */}
          <div className={styles.label}>
            {products.fields.category}{" "}
            <span className={styles.muted}>({common.optional})</span>
            <div className={styles.catWrap}>
              <input
                className={styles.input}
                value={category}
                placeholder={qa.searchCategory}
                maxLength={120}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCatOpen(true);
                }}
                onFocus={() => setCatOpen(true)}
                onBlur={() => setTimeout(() => setCatOpen(false), 150)}
              />
              {catOpen && (catMatches.length > 0 || (catQuery && !exactCat)) && (
                <div className={styles.catList}>
                  {catMatches.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={styles.catItem}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCategory(c);
                        setCatOpen(false);
                      }}
                    >
                      {c}
                    </button>
                  ))}
                  {catQuery && !exactCat && (
                    <button
                      type="button"
                      className={styles.catAdd}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCatOpen(false);
                      }}
                    >
                      + {qa.addCategory.replace("{q}", category.trim())}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Barcode + scan */}
          <label className={styles.label}>
            {products.fields.barcode}{" "}
            <span className={styles.muted}>({common.optional})</span>
            <span className={styles.barcodeRow}>
              <input
                className={styles.input}
                dir="ltr"
                maxLength={120}
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

          {/* Image */}
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
                    onClick={() => fileRef.current?.click()}
                  >
                    ⬆️ {img.upload}
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    onPickImage(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {preview && (
                  <button
                    type="button"
                    className={styles.removeImg}
                    onClick={() => {
                      setImageFile(null);
                      setPreview(null);
                    }}
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
        </div>
      )}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            {products.saving}
          </>
        ) : (
          qa.saveAnother
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
