import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LangPill } from "../LangPill";
import { IconCode, IconCheck, IconBook, IconMenu, IconBolt } from "../icons";
import s from "../landing.module.css";
import d from "./developers.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const m = dict.devPage.meta;
  return {
    title: m.title,
    description: m.description,
    openGraph: {
      title: m.title,
      description: m.description,
      type: "website",
      locale: locale === "ar" ? "ar_SY" : "en_US",
      siteName: dict.app.name,
    },
  };
}

// Endpoint rows are API facts (method/path/scope are language-neutral); the human
// note resolves to a dictionary key so it translates with the locale.
const ENDPOINTS = [
  { endpoint: "GET /api/v1", scope: "—", note: "info" },
  { endpoint: "GET /api/v1/products", scope: "products:read", note: "listProducts" },
  { endpoint: "POST /api/v1/products", scope: "products:write", note: "createProduct" },
  { endpoint: "GET /api/v1/products/:id", scope: "products:read", note: "getProduct" },
  { endpoint: "PATCH /api/v1/products/:id", scope: "products:write", note: "patchProduct" },
  { endpoint: "DELETE /api/v1/products/:id", scope: "products:write", note: "deleteProduct" },
  { endpoint: "GET /api/v1/transactions", scope: "transactions:read", note: "listTx" },
  { endpoint: "POST /api/v1/transactions", scope: "transactions:write", note: "createTx" },
  { endpoint: "GET /api/v1/customers", scope: "customers:read", note: "listCustomers" },
  { endpoint: "POST /api/v1/customers", scope: "customers:write", note: "createCustomer" },
  { endpoint: "GET /api/v1/customers/:id", scope: "customers:read", note: "getCustomer" },
  { endpoint: "GET /api/v1/inventory/alerts", scope: "products:read", note: "alerts" },
] as const;

export default async function DevelopersPage() {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const t = dict.devPage;
  const notes = t.endpoints.notes;
  const lf = dict.landing.footer;

  const plans = [
    { d: t.pricing.free, per: t.pricing.perFree, card: "", name: "", popular: false },
    {
      d: t.pricing.basic,
      per: t.pricing.perMonth,
      card: s.priceCardPopular,
      name: s.planNamePrimary,
      popular: true,
    },
    {
      d: t.pricing.smart,
      per: t.pricing.perMonth,
      card: s.priceCardSmart,
      name: s.planNameSecondary,
      popular: false,
    },
  ];

  return (
    <>
      {/* ---- Top nav ---- */}
      <header className={s.nav}>
        <nav className={s.navInner}>
          <div className={s.navStart}>
            <Link href="/" className={s.logo}>
              {dict.app.name}
            </Link>
            <div className={s.navLinks}>
              <Link className={s.navLink} href="/">
                {t.nav.home}
              </Link>
              <a className={s.navLink} href="#endpoints">
                {t.nav.endpoints}
              </a>
              <a className={s.navLink} href="#pricing">
                {t.nav.pricing}
              </a>
            </div>
          </div>
          <div className={s.navEnd}>
            <LangPill current={locale} />
            <Link href="/login" className={`${s.loginBtn} ${s.label}`}>
              {t.nav.login}
            </Link>
            <span className={s.hamburger} aria-hidden>
              <IconMenu />
            </span>
          </div>
        </nav>
      </header>

      <main className={s.main}>
        {/* ---- Hero ---- */}
        <section className={d.hero}>
          <div className={`${s.container} ${s.bento}`} style={{ alignItems: "center" }}>
            <div className={s.devText}>
              <div className={s.badge} style={{ marginBlockEnd: "1.25rem" }}>
                <span className={s.badgeDot} />
                <span className={s.badgeText}>{t.hero.badge}</span>
              </div>
              <h1 className={s.heroTitle} style={{ fontSize: "3rem" }}>
                {t.hero.title}
              </h1>
              <p className={s.heroSub} style={{ marginBlockStart: "1.25rem" }}>
                {t.hero.subtitle}
              </p>
              <div className={s.heroCtas}>
                <Link href="/login" className={s.btnPrimary}>
                  {t.hero.ctaPrimary}
                </Link>
                <a href="#endpoints" className={s.btnOutline}>
                  <IconCode size={22} />
                  {t.hero.ctaSecondary}
                </a>
              </div>
            </div>
            <div className={s.devMedia}>
              <div className={s.codeWrap}>
                <div className={s.codeDots}>
                  <span className={`${s.dot} ${s.dotR}`} />
                  <span className={`${s.dot} ${s.dotY}`} />
                  <span className={`${s.dot} ${s.dotG}`} />
                </div>
                <pre className={s.codePre} dir="ltr">
                  <span className={d.curlComment}>{t.quickStart.authComment}</span>
                  {"\n"}
                  {"curl https://rafraf.app/api/v1/products \\\n"}
                  {'  -H "Authorization: Bearer rafraf_xxx"\n\n'}
                  <span className={d.curlComment}>{t.quickStart.createComment}</span>
                  {"\n"}
                  {"curl -X POST https://rafraf.app/api/v1/products \\\n"}
                  {'  -H "Authorization: Bearer rafraf_xxx" \\\n'}
                  {'  -H "Content-Type: application/json" \\\n'}
                  {'  -d \'{"name":"Tea","sell_price":1500,"stock":50}\'\n\n'}
                  <span className={d.curlComment}>{t.quickStart.saleComment}</span>
                  {"\n"}
                  {"curl -X POST https://rafraf.app/api/v1/transactions \\\n"}
                  {'  -H "Authorization: Bearer rafraf_xxx" \\\n'}
                  {'  -H "Content-Type: application/json" \\\n'}
                  {'  -d \'{"type":"sell","product_id":"<id>","qty":2,"price":1500,"client_uuid":"order-1001"}\''}
                </pre>
              </div>
            </div>
          </div>
          <div className={d.heroGlow} />
        </section>

        {/* ---- Auth & scopes ---- */}
        <section className={`${s.section} ${s.sectionAlt}`}>
          <div className={s.container}>
            <div className={s.sectionHead} style={{ marginBlockEnd: "1rem" }}>
              <h2 className={s.h2}>{t.quickStart.title}</h2>
              <p className={s.lead}>{t.quickStart.intro}</p>
            </div>
            <div className={d.authGrid}>
              <div className={`${d.authCard} ${s.glassCard}`}>
                <h3 className={d.authCardTitle}>
                  <IconCheck size={20} className={s.cPrimary} />
                  {t.auth.keysTitle}
                </h3>
                <p className={d.authCardText}>{t.auth.keysText}</p>
              </div>
              <div className={`${d.authCard} ${s.glassCard}`}>
                <h3 className={d.authCardTitle}>
                  <IconCode size={20} className={s.cSecondary} />
                  {t.auth.scopesTitle}
                </h3>
                <p className={d.authCardText}>{t.auth.scopesText}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Endpoints ---- */}
        <section className={s.section} id="endpoints">
          <div className={s.container}>
            <div className={s.sectionHead} style={{ marginBlockEnd: "2.5rem" }}>
              <h2 className={s.h2}>{t.endpoints.title}</h2>
              <p className={s.lead}>{t.endpoints.subtitle}</p>
            </div>
            <div className={`${d.tableWrap} ${s.glassCard}`}>
              <div className={d.scroll}>
                <table className={d.table}>
                  <thead>
                    <tr>
                      <th>{t.endpoints.colEndpoint}</th>
                      <th>{t.endpoints.colScope}</th>
                      <th>{t.endpoints.colNotes}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENDPOINTS.map((e) => (
                      <tr key={e.endpoint}>
                        <td>
                          <span className={d.method} dir="ltr">
                            {e.endpoint}
                          </span>
                        </td>
                        <td>
                          <span className={d.scope} dir="ltr">
                            {e.scope}
                          </span>
                        </td>
                        <td className={d.note}>{notes[e.note]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${d.errorsCard} ${s.glassCard}`}>
              <h3 className={d.authCardTitle}>
                <IconBolt size={20} className={s.cError} />
                {t.errors.title}
              </h3>
              <p className={d.errorsText}>{t.errors.text}</p>
              <p className={d.errorsText} style={{ margin: 0 }}>
                {t.errors.rateText}
              </p>
            </div>
          </div>
        </section>

        {/* ---- Plan limits (pricing) ---- */}
        <section className={`${s.section} ${s.sectionAlt}`} id="pricing">
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.h2}>{t.pricing.title}</h2>
              <p className={s.lead}>{t.pricing.subtitle}</p>
            </div>
            <div className={s.pricingGrid}>
              {plans.map((pl) => (
                <div
                  className={`${s.priceCard} ${pl.card} ${s.glassCard}`}
                  key={pl.d.name}
                >
                  {pl.popular && <span className={s.popularBadge}>{t.pricing.popular}</span>}
                  <div className={s.planHead}>
                    <h3 className={`${s.planName} ${pl.name}`}>{pl.d.name}</h3>
                    <div className={s.priceRow}>
                      <span className={s.price}>{pl.d.price}</span>
                      <span className={s.pricePer}>{pl.per}</span>
                    </div>
                  </div>
                  <div className={d.rateRow}>
                    <span className={d.rateBig}>{pl.d.rate}</span>
                    <span className={d.rateUnit}>{t.pricing.rateUnit}</span>
                  </div>
                  <ul className={s.planList}>
                    {[pl.d.f1, pl.d.f2, pl.d.f3].map((f) => (
                      <li className={s.planItem} key={f}>
                        <IconCheck size={20} className={s.cPrimary} /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/login"
                    className={`${s.planBtn} ${pl.popular ? s.planBtnPrimary : ""}`}
                  >
                    {pl.d.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Final CTA ---- */}
        <section className={s.section} style={{ paddingBlock: "6rem" }}>
          <div className={`${s.finalCta} ${s.glassCard}`}>
            <div className={s.finalInner}>
              <h2 className={s.finalTitle}>{t.finalCta.title}</h2>
              <p className={s.finalText}>{t.finalCta.text}</p>
              <Link href="/login" className={s.btnPrimary}>
                <IconBook size={20} />
                {t.finalCta.cta}
              </Link>
              <p className={s.finalNote}>{t.finalCta.docsNote}</p>
            </div>
            <div className={s.glowA} />
            <div className={s.glowB} />
          </div>
        </section>
      </main>

      {/* ---- Footer (shared with the landing) ---- */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <div className={s.logo}>{dict.app.name}</div>
            <p className={s.footerText}>{lf.tagline}</p>
          </div>
          <div className={s.footerCols}>
            <div className={s.footerCol}>
              <h5 className={s.footerColTitle}>{lf.company}</h5>
              <Link className={s.footerLink} href="/">
                {t.nav.home}
              </Link>
              <a className={s.footerLink} href="#pricing">
                {lf.pricing}
              </a>
            </div>
            <div className={s.footerCol}>
              <h5 className={s.footerColTitle}>{lf.developers}</h5>
              <a className={s.footerLink} href="#endpoints">
                {t.endpoints.title}
              </a>
              <a className={s.footerLink} href="#">
                {lf.github}
              </a>
            </div>
            <div className={s.footerCol}>
              <h5 className={s.footerColTitle}>{lf.legal}</h5>
              <a className={s.footerLink} href="#">
                {lf.privacy}
              </a>
              <a className={s.footerLink} href="#">
                {lf.terms}
              </a>
            </div>
          </div>
        </div>
        <div className={s.footerBottom}>{lf.rights}</div>
      </footer>
    </>
  );
}
