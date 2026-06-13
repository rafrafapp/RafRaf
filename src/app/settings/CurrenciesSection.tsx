"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { LocalMerchantCurrency } from "@/lib/offline/db";
import { useCurrencies } from "@/lib/offline/useCurrencies";
import {
  saveCurrency,
  deleteCurrencyLocal,
  ensureBaseCurrency,
} from "@/lib/offline/currencies-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { currencySchema, CURRENCY_PRESETS } from "@/lib/validation/currency";
import { Spinner } from "@/components/Spinner";
import f from "@/app/products/product-form.module.css";
import s from "./currencies.module.css";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

type Labels = Dictionary["settings"]["currencies"];

export function CurrenciesSection({
  merchantId,
  locale,
  labels: t,
}: {
  merchantId: string;
  locale: Locale;
  labels: Labels;
}) {
  const { all } = useCurrencies(merchantId);
  void useSync(merchantId); // keep currencies fresh + push edits

  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState<string>(CURRENCY_PRESETS[0].code);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [symbol, setSymbol] = useState<string>(CURRENCY_PRESETS[0].symbol);
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // inline rate edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");

  const isOther = preset === "other";

  function onPreset(p: string) {
    setPreset(p);
    const found = CURRENCY_PRESETS.find((c) => c.code === p);
    if (found) {
      setCode(found.code);
      setSymbol(found.symbol);
      setNameAr("");
      setNameEn("");
    } else {
      setCode("");
      setSymbol("");
    }
  }

  async function addCurrency() {
    setError(null);
    const presetDef = CURRENCY_PRESETS.find((c) => c.code === preset);
    const parsed = currencySchema.safeParse({
      code: isOther ? code : preset,
      name_ar: isOther ? nameAr : (presetDef?.name_ar ?? code),
      name_en: isOther ? nameEn : (presetDef?.name_en ?? code),
      symbol,
      rate_to_base: rate,
      is_active: true,
    });
    if (!parsed.success) {
      setError(t.errors.invalid);
      return;
    }
    if (all.some((c) => c.code === parsed.data.code)) {
      setError(t.errors.exists);
      return;
    }
    setBusy(true);
    try {
      await ensureBaseCurrency(merchantId);
      await saveCurrency({ mode: "create", merchantId, data: parsed.data });
      void syncAll(merchantId).catch(() => {});
      setAdding(false);
      setRate("");
      setCode("");
      onPreset(CURRENCY_PRESETS[0].code);
    } catch {
      setError(t.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  async function saveRate(c: LocalMerchantCurrency) {
    const parsed = currencySchema.safeParse({
      code: c.code,
      name_ar: c.name_ar,
      name_en: c.name_en,
      symbol: c.symbol,
      rate_to_base: editRate,
      is_active: c.is_active,
    });
    if (!parsed.success) {
      setError(t.errors.invalid);
      return;
    }
    setBusy(true);
    try {
      await saveCurrency({ mode: "edit", merchantId, base: c, data: parsed.data });
      void syncAll(merchantId).catch(() => {});
      setEditId(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: LocalMerchantCurrency) {
    if (c.is_base) return;
    if (!window.confirm(t.deleteConfirm)) return;
    setBusy(true);
    try {
      await deleteCurrencyLocal(c.id);
      void syncAll(merchantId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className={f.muted}>{t.subtitle}</p>

      <ul className={s.list}>
        {all.map((c) => (
          <li key={c.id} className={s.row}>
            <div className={s.info}>
              <span className={s.sym}>{c.symbol}</span>
              <div>
                <div className={s.name}>
                  {locale === "ar" ? c.name_ar : c.name_en}{" "}
                  <span className={s.code}>{c.code}</span>
                  {c.is_base && <span className={s.baseTag}>{t.base}</span>}
                </div>
                {editId === c.id ? (
                  <div className={s.rateEdit}>
                    <span className={s.rateLead}>1 {c.code} =</span>
                    <input
                      className={f.input}
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      dir="ltr"
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                    />
                    <span className={s.rateLead}>{t.sypUnit}</span>
                  </div>
                ) : (
                  <div className={s.rate}>
                    {c.is_base
                      ? t.baseRate
                      : `1 ${c.code} = ${nf.format(Number(c.rate_to_base))} ${t.sypUnit}`}
                  </div>
                )}
              </div>
            </div>

            <div className={s.actions}>
              {!c.is_base &&
                (editId === c.id ? (
                  <>
                    <button
                      type="button"
                      className={s.linkBtn}
                      disabled={busy}
                      onClick={() => void saveRate(c)}
                    >
                      {busy ? <Spinner /> : t.save}
                    </button>
                    <button
                      type="button"
                      className={s.linkBtnMuted}
                      onClick={() => setEditId(null)}
                    >
                      {t.cancel}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={s.linkBtn}
                      onClick={() => {
                        setEditId(c.id);
                        setEditRate(String(c.rate_to_base));
                        setError(null);
                      }}
                    >
                      {t.editRate}
                    </button>
                    <button
                      type="button"
                      className={s.linkBtnDanger}
                      disabled={busy}
                      onClick={() => void remove(c)}
                    >
                      {t.delete}
                    </button>
                  </>
                ))}
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p className={f.error} role="alert">
          {error}
        </p>
      )}

      {adding ? (
        <div className={f.customSection}>
          <label className={f.label}>
            {t.currency}
            <select
              className={f.input}
              value={preset}
              onChange={(e) => onPreset(e.target.value)}
            >
              {CURRENCY_PRESETS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {locale === "ar" ? c.name_ar : c.name_en}
                </option>
              ))}
              <option value="other">{t.other}</option>
            </select>
          </label>

          {isOther && (
            <>
              <label className={f.label}>
                {t.code}
                <input
                  className={f.input}
                  dir="ltr"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="GBP"
                />
              </label>
              <div className={f.row}>
                <label className={f.label}>
                  {t.nameAr}
                  <input
                    className={f.input}
                    maxLength={40}
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                  />
                </label>
                <label className={f.label}>
                  {t.nameEn}
                  <input
                    className={f.input}
                    dir="ltr"
                    maxLength={40}
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}

          <div className={f.row}>
            <label className={f.label}>
              {t.symbol}
              <input
                className={f.input}
                maxLength={8}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </label>
            <label className={f.label}>
              {t.rate}
              <input
                className={f.input}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                dir="ltr"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="14500"
              />
            </label>
          </div>
          <span className={f.muted}>{t.rateHint}</span>

          <div className={s.addActions}>
            <button
              type="button"
              className={f.submit}
              disabled={busy}
              onClick={() => void addCurrency()}
            >
              {busy ? (
                <>
                  <Spinner /> {t.saving}
                </>
              ) : (
                t.save
              )}
            </button>
            <button
              type="button"
              className={s.linkBtnMuted}
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={s.addBtn}
          onClick={() => {
            setAdding(true);
            onPreset(CURRENCY_PRESETS[0].code);
            setRate("");
            setError(null);
          }}
        >
          + {t.add}
        </button>
      )}
    </div>
  );
}
