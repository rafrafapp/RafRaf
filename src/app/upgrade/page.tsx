import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { PageHeader } from "@/components/PageHeader";
import styles from "./upgrade.module.css";

const PLAN_ORDER = ["free", "basic", "smart"] as const;
type PlanKey = (typeof PLAN_ORDER)[number];

// Plans page — plans are activated MANUALLY by the admin after out-of-band
// payment (no card processing in Syria); the CTA routes merchants to Telegram.
export default async function UpgradePage() {
  if (!(await getUser())) redirect("/login");
  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const currentPlan = ctx.status === "ok" ? ctx.merchant.plan : "free";

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const u = dict.upgrade;
  const botUser = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  return (
    <main className={styles.main}>
      <PageHeader
        title={u.title}
        backHref="/settings"
        backLabel={dict.common.back}
        bellLabel={dict.dashboard.notifications.title}
      />

      <p className={styles.subtitle}>{u.subtitle}</p>

      <div className={styles.planList}>
        {PLAN_ORDER.map((key) => {
          const plan = u.plans[key as PlanKey];
          const isCurrent = currentPlan === key;
          const highlight = key === "smart";
          return (
            <section
              key={key}
              className={`${styles.planCard} ${highlight ? styles.planSmart : ""} ${
                isCurrent ? styles.planCurrent : ""
              }`}
            >
              <div className={styles.planHead}>
                <h2 className={styles.planName}>{plan.name}</h2>
                <span className={styles.planPrice}>
                  {key === "free" ? u.free : u.priceOnRequest}
                </span>
              </div>
              {isCurrent && (
                <span className={styles.currentBadge}>{u.currentPlan}</span>
              )}
              <ul className={styles.featureList}>
                {plan.features.map((f) => (
                  <li key={f} className={styles.feature}>
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={styles.check}
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className={styles.contactCard}>
        <h2 className={styles.contactTitle}>{u.contactTitle}</h2>
        <p className={styles.contactBody}>{u.contactBody}</p>
        {botUser && (
          <a
            href={`https://t.me/${botUser}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.contactBtn}
          >
            {u.contactCta}
          </a>
        )}
      </section>
    </main>
  );
}
