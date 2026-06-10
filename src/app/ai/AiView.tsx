"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import styles from "./ai.module.css";

type Reorder = {
  product: string;
  current_stock: number;
  suggested_qty: number;
  reason: string;
};
type Dead = {
  product: string;
  stock: number;
  days_since_last_sale: number;
  suggestion: string;
};
type Forecast = {
  expected_sales: number;
  currency: string;
  trend: "up" | "down" | "flat";
  top_products: { product: string; expected_units: number }[];
};
type ChatMsg = { role: "you" | "assistant"; text: string };

const nf = new Intl.NumberFormat("en-US");

// Calls the /api/ai/* stub endpoints (session-authed, same-origin) and renders the
// mock data. No real AI — this is the Phase 12 placeholder UI structure.
export function AiView({ ai }: { ai: Dictionary["ai"] }) {
  const [reorder, setReorder] = useState<Reorder[] | null>(null);
  const [dead, setDead] = useState<Dead[] | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [r, d, f] = await Promise.all([
          fetch("/api/ai/reorder-suggestions").then((x) => x.json()),
          fetch("/api/ai/dead-stock").then((x) => x.json()),
          fetch("/api/ai/forecast").then((x) => x.json()),
        ]);
        if (!active) return;
        setReorder(r.data ?? []);
        setDead(d.data ?? []);
        setForecast(f.data ?? null);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setMessages((m) => [...m, { role: "you", text: q }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const j = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: j.data?.reply ?? ai.error },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: ai.error }]);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className={styles.muted}>{ai.loading}</p>;
  if (failed) return <p className={styles.muted}>{ai.error}</p>;

  const arrow =
    forecast?.trend === "up" ? "↑" : forecast?.trend === "down" ? "↓" : "";

  return (
    <div className={styles.grid}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{ai.reorder.title}</h2>
        {reorder && reorder.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{ai.reorder.product}</th>
                <th>{ai.reorder.stock}</th>
                <th>{ai.reorder.suggested}</th>
                <th>{ai.reorder.reason}</th>
              </tr>
            </thead>
            <tbody>
              {reorder.map((x, i) => (
                <tr key={i}>
                  <td>{x.product}</td>
                  <td>{nf.format(x.current_stock)}</td>
                  <td>{nf.format(x.suggested_qty)}</td>
                  <td className={styles.muted}>{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>{ai.empty}</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{ai.deadStock.title}</h2>
        {dead && dead.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{ai.deadStock.product}</th>
                <th>{ai.deadStock.stock}</th>
                <th>{ai.deadStock.days}</th>
                <th>{ai.deadStock.suggestion}</th>
              </tr>
            </thead>
            <tbody>
              {dead.map((x, i) => (
                <tr key={i}>
                  <td>{x.product}</td>
                  <td>{nf.format(x.stock)}</td>
                  <td>{nf.format(x.days_since_last_sale)}</td>
                  <td className={styles.muted}>{x.suggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>{ai.empty}</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{ai.forecast.title}</h2>
        {forecast ? (
          <div className={styles.forecastBody}>
            <div className={styles.statRow}>
              <span className={styles.muted}>{ai.forecast.period}</span>
              <span>{ai.forecast.next7}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.muted}>{ai.forecast.expected}</span>
              <span>
                {nf.format(forecast.expected_sales)} {forecast.currency} {arrow}
              </span>
            </div>
            <span className={styles.muted}>{ai.forecast.topProducts}</span>
            <ul className={styles.list}>
              {forecast.top_products.map((p, i) => (
                <li key={i}>
                  {p.product} — {nf.format(p.expected_units)} {ai.forecast.units}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.muted}>{ai.empty}</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{ai.chat.title}</h2>
        {messages.length > 0 && (
          <div className={styles.chat}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "you" ? styles.msgYou : styles.msgAssistant}
              >
                <strong>
                  {m.role === "you" ? ai.chat.you : ai.chat.assistant}:
                </strong>{" "}
                {m.text}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={send} className={styles.chatForm}>
          <input
            className={styles.input}
            value={input}
            placeholder={ai.chat.placeholder}
            disabled={sending}
            dir="auto"
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className={styles.send}
            disabled={sending || !input.trim()}
          >
            {sending ? ai.chat.sending : ai.chat.send}
          </button>
        </form>
      </section>
    </div>
  );
}
