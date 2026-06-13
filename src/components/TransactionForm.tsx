"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { type LocalProduct, type PaymentMethod } from "@/lib/offline/db";
import { recordTransaction } from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import {
  RETURN_KINDS,
  PAYMENT_METHODS,
  parsePositive,
  type ReturnKind,
} from "@/lib/validation/transaction";
import { fromBase, toBase } from "@/lib/validation/currency";
import { useCurrencies, rateFor } from "@/lib/offline/useCurrencies";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { ProductPicker } from "@/components/ProductPicker";
import { PartyPicker, type Party } from "@/components/PartyPicker";
import { CurrencySelect } from "@/components/CurrencySelect";
import { Spinner } from "@/components/Spinner";
import { BackButton } from "@/components/BackButton";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");
const round2 = (n: number) => Math.round(n * 100) / 100;

type Props = {
  mode: "buy" | "return";
  merchantId: string;
  currency: string;
  locale: Locale;
  appName: string;
  tx: Dictionary["transactions"];
  common: Dictionary["common"];
  syncLabels: Dictionary["products"]["sync"];
  scanLabels: {
    title: string;
    hint: string;
    error: string;
    close: string;
    upload: string;
  };
};

// Product-based ledger entry: a purchase (stock in) or a return
// (customer → stock in, supplier → stock out). Offline-first like products.
export function TransactionForm({
  mode,
  merchantId,
  currency,
  locale,
  appName,
  tx,
  common,
  syncLabels,
  scanLabels,
}: Props) {
  const router = useRouter();
  const { online, syncing, sync } = useSync(merchantId);
  const { currencies, base } = useCurrencies(merchantId);
  const [currencyCode, setCurrencyCode] = useState<string>("");
  const selected =
    currencies.find((c) => c.code === currencyCode) ?? base ?? null;
  const code = selected?.code ?? "SYP";
  const rate = selected ? Number(selected.rate_to_base) || 1 : 1;
  const symbol = selected?.symbol ?? "ل.س";
  const baseSymbol = base?.symbol ?? "ل.س";
  const isBaseCur = !selected || selected.is_base;

  const [product, setProduct] = useState<LocalProduct | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<ReturnKind>("return_customer");
  const [party, setParty] = useState<Party | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isBuy = mode === "buy";
  const block = isBuy ? tx.buy : tx.returns;
  const priceLabel = isBuy ? tx.buy.cost : tx.returns.price;
  const noteLabel = isBuy ? tx.buy.note : tx.returns.reason;
  const returnKinds = tx.returns as Record<string, string>;
  const payments = tx.payments as Record<string, string>;
  // Which party applies: a purchase links a supplier; a return links whichever
  // side the goods move (customer return ↔ customer, supplier return ↔ supplier).
  const partyKind: "customer" | "supplier" =
    isBuy || kind === "return_supplier" ? "supplier" : "customer";

  function pick(p: LocalProduct) {
    setProduct(p);
    // Catalog prices are base (SYP); show in the chosen currency.
    const base = Number(isBuy ? p.cost_price : p.sell_price);
    setPrice(String(round2(fromBase(base, rate))));
    setError(null);
  }

  function changeCurrency(newCode: string) {
    const oldRate = rate;
    const newRate = rateFor(currencies, newCode);
    const pr = Number(price);
    if (!Number.isNaN(pr) && pr > 0)
      setPrice(String(round2(fromBase(toBase(pr, oldRate), newRate))));
    setPaid("");
    setCurrencyCode(newCode);
  }

  async function save() {
    setError(null);
    if (!product) {
      setError(tx.errors.noProduct);
      return;
    }
    const q = parsePositive(qty);
    const pr = parsePositive(price);
    if (q == null || pr == null) {
      setError(tx.errors.invalid);
      return;
    }
    setSaving(true);
    try {
      await recordTransaction({
        merchantId,
        type: isBuy ? "buy" : kind,
        currency: code,
        exchangeRate: rate,
        product_id: product.id,
        product_name: product.name,
        qty: q,
        price: pr,
        note: note.trim() || null,
        customerId: partyKind === "customer" ? (party?.id ?? null) : null,
        supplierId: partyKind === "supplier" ? (party?.id ?? null) : null,
        payment: isBuy ? payment : "cash",
        paid: isBuy && payment === "partial" ? Number(paid) || 0 : undefined,
      });
      void syncAll(merchantId).catch(() => {});
      router.push("/transactions");
    } catch {
      setError(tx.errors.failed);
      setSaving(false);
    }
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.logo}>
          {appName}
        </Link>
        <div className={styles.headerActions}>
          <SyncBadge
            merchantId={merchantId}
            online={online}
            syncing={syncing}
            onSync={() => void sync()}
            labels={syncLabels}
          />
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: common.arabic, english: common.english }}
          />
        </div>
      </header>

      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>{block.title}</h1>
          <p className={styles.subtitle}>{block.subtitle}</p>
        </div>
        <BackButton label={common.back} />
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={styles.form}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {!isBuy && (
          <div className={styles.label}>
            {tx.returns.kind}
            <div className={styles.segment}>
              {RETURN_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.chip} ${kind === k ? styles.chipActive : ""}`}
                  onClick={() => {
                    setKind(k);
                    setParty(null);
                  }}
                >
                  {returnKinds[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        {product ? (
          <div className={styles.label}>
            {block.product}
            <div className={styles.lineFoot}>
              <span className={styles.cartName}>{product.name}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setProduct(null)}
              >
                {tx.pickProduct}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.label}>
            {block.product}
            <ProductPicker
              merchantId={merchantId}
              currency={currency}
              onPick={pick}
              labels={{
                search: tx.sell.searchProduct,
                scan: tx.sell.scan,
                empty: tx.list.emptyFiltered,
                noProducts: tx.noProducts,
                available: tx.sell.available,
              }}
              scanLabels={scanLabels}
            />
          </div>
        )}

        {product && (
          <>
            <div className={styles.row}>
              <label className={styles.label}>
                {block.qty}
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  dir="ltr"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                {priceLabel} ({symbol})
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  dir="ltr"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
            </div>

            {currencies.length > 1 && (
              <label className={styles.label}>
                {tx.currency}
                <CurrencySelect
                  currencies={currencies}
                  value={code}
                  onChange={changeCurrency}
                  locale={locale}
                  className={styles.input}
                />
              </label>
            )}
            {!isBaseCur && (Number(qty) || 0) > 0 && (Number(price) || 0) > 0 && (
              <p className={styles.muted}>
                {tx.inBase}: ≈{" "}
                {nf.format((Number(qty) || 0) * (Number(price) || 0) * rate)}{" "}
                {baseSymbol}
              </p>
            )}

            <label className={styles.label}>
              {isBuy
                ? tx.buy.supplier
                : partyKind === "supplier"
                  ? tx.returns.supplier
                  : tx.returns.customer}{" "}
              <span className={styles.muted}>({common.optional})</span>
            </label>
            <PartyPicker
              key={partyKind}
              merchantId={merchantId}
              kind={partyKind}
              value={party}
              onChange={setParty}
              labels={{
                search: isBuy
                  ? tx.buy.searchSupplier
                  : partyKind === "supplier"
                    ? tx.returns.searchSupplier
                    : tx.returns.searchCustomer,
                none: isBuy ? tx.buy.noSupplier : tx.returns.noParty,
                add: tx.party.add,
                selected: tx.party.selected,
                change: tx.party.change,
              }}
            />

            {isBuy && (
              <>
                <div className={styles.label}>
                  {tx.buy.payment}
                  <div className={styles.segment}>
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`${styles.chip} ${payment === m ? styles.chipActive : ""}`}
                        onClick={() => setPayment(m)}
                      >
                        {payments[m]}
                      </button>
                    ))}
                  </div>
                </div>
                {payment === "partial" && (
                  <label className={styles.label}>
                    {tx.buy.paidNow} ({currency})
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      dir="ltr"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}

            <label className={styles.label}>
              {noteLabel}{" "}
              <span className={styles.muted}>({common.optional})</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.submit}
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner />
                  {tx.sell.completing}
                </>
              ) : (
                block.save
              )}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
