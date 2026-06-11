import Link from "next/link";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LangPill } from "./LangPill";
import {
  IconBolt,
  IconBook,
  IconBox,
  IconTrending,
  IconCloudOff,
  IconWallet,
  IconBars,
  IconBackup,
  IconChat,
  IconCheck,
  IconCode,
  IconWifiOff,
  IconQuote,
  IconMenu,
} from "./icons";
import s from "./landing.module.css";

export default async function LandingPage() {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const t = dict.landing;
  const p = t.pricing;

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
              <a className={s.navLink} href="#features">
                {t.nav.features}
              </a>
              <a className={s.navLink} href="#pricing">
                {t.nav.pricing}
              </a>
              <Link className={s.navLink} href="/developers">
                {t.nav.developers}
              </Link>
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
        <section className={s.hero}>
          <div className={`${s.container} ${s.bento} ${s.heroGrid}`}>
            <div className={s.heroText}>
              <div className={s.badge}>
                <span className={s.badgeDot} />
                <span className={s.badgeText}>{t.hero.badge}</span>
              </div>
              <h1 className={s.heroTitle}>
                {t.hero.titleLine1} <br />
                <span className={s.heroAccent}>{t.hero.titleAccent}</span>
              </h1>
              <p className={s.heroSub}>{t.hero.subtitle}</p>
              <div className={s.heroCtas}>
                <Link href="/login" className={s.btnPrimary}>
                  {t.hero.ctaPrimary}
                </Link>
                <Link href="/developers" className={s.btnOutline}>
                  <IconCode size={22} />
                  {t.hero.ctaDevelopers}
                </Link>
              </div>
            </div>
            <div className={s.heroMedia}>
              <div className={s.heroImgWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={s.heroImg}
                  alt={t.hero.imageAlt}
                  src="https://lh3.googleusercontent.com/aida/AP1WRLsfrlg3iT-1Fi0ucnaH7S0Mf3cexoVynGOSFEEvJRJwhDHNrsfujP2uGNCYaqLeD4i9jBpCP0MXPDsVomuWrnxYZ_TJyWDc0Fsv2U1Ts7_T5b5wx4IUTkRBESjjv7Bq70CqoCiAOO7QRxu7xCZZaQ3l7GnwqH_UDlR_sF7r5Fm-ApFW6bejW8bfyvd0k10zf-WJ9KQemTrxcdAb7WT2pnvoJ1JTEzWVyDK-6FQjG-zn9MgakZeB645jMA"
                />
                <div className={s.heroImgFade} />
              </div>
              <div className={`${s.floatCard} ${s.glassCard}`}>
                <div className={s.floatRow}>
                  <span className={s.floatIcon}>
                    <IconWifiOff size={22} />
                  </span>
                  <div>
                    <div className={s.floatLabel}>{t.hero.floatStatus}</div>
                    <div className={s.floatValue}>{t.hero.floatValue}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={s.heroGlow} />
        </section>

        {/* ---- Problem / Solution ---- */}
        <section className={`${s.section} ${s.sectionAlt}`} id="features">
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.h2}>{t.problem.title}</h2>
              <p className={s.lead}>{t.problem.subtitle}</p>
            </div>
            <div className={s.bento}>
              <div className={`${s.card} ${s.col4} ${s.glassCard}`}>
                <IconBolt size={36} className={s.cError} />
                <h3 className={s.cardTitle}>{t.problem.power.title}</h3>
                <p className={s.cardText}>{t.problem.power.text}</p>
              </div>
              <div className={`${s.card} ${s.col4} ${s.glassCard}`}>
                <IconBook size={36} className={s.cSecondary} />
                <h3 className={s.cardTitle}>{t.problem.debt.title}</h3>
                <p className={s.cardText}>{t.problem.debt.text}</p>
              </div>
              <div className={`${s.card} ${s.col4} ${s.glassCard}`}>
                <IconBox size={36} className={s.cPrimary} />
                <h3 className={s.cardTitle}>{t.problem.inventory.title}</h3>
                <p className={s.cardText}>{t.problem.inventory.text}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Features bento ---- */}
        <section className={s.section}>
          <div className={s.container}>
            <div className={s.bento}>
              <div className={`${s.featureCard} ${s.lgCol4} ${s.col6} ${s.glassCard}`}>
                <div className={`${s.cardChip} ${s.chipPrimary}`}>
                  <IconTrending size={22} />
                </div>
                <h3 className={s.cardTitle}>{t.features.smart.title}</h3>
                <p className={s.cardText}>{t.features.smart.text}</p>
              </div>
              <div className={`${s.featureHighlight} ${s.lgCol4} ${s.col6}`}>
                <div className={s.cardChip}>
                  <IconCloudOff size={22} />
                </div>
                <h3 className={s.cardTitle}>{t.features.offline.title}</h3>
                <p className={s.cardText}>{t.features.offline.text}</p>
                <div className={s.featureGlow} />
              </div>
              <div className={`${s.featureCard} ${s.lgCol4} ${s.col6} ${s.glassCard}`}>
                <div className={`${s.cardChip} ${s.chipSecondary}`}>
                  <IconWallet size={22} />
                </div>
                <h3 className={s.cardTitle}>{t.features.debt.title}</h3>
                <p className={s.cardText}>{t.features.debt.text}</p>
              </div>
              <div className={`${s.featureCard} ${s.lgCol4} ${s.col6} ${s.glassCard}`}>
                <div className={`${s.cardChip} ${s.chipTertiary}`}>
                  <IconBars size={22} />
                </div>
                <h3 className={s.cardTitle}>{t.features.reports.title}</h3>
                <p className={s.cardText}>{t.features.reports.text}</p>
              </div>
              <div className={`${s.featureCard} ${s.lgCol4} ${s.col6} ${s.glassCard}`}>
                <div className={`${s.cardChip} ${s.chipPrimary}`}>
                  <IconBackup size={22} />
                </div>
                <h3 className={s.cardTitle}>{t.features.backup.title}</h3>
                <p className={s.cardText}>{t.features.backup.text}</p>
              </div>
              <div className={`${s.featureCard} ${s.lgCol4} ${s.col6} ${s.glassCard}`}>
                <div className={`${s.cardChip} ${s.chipPrimary}`}>
                  <IconChat size={22} />
                </div>
                <h3 className={s.cardTitle}>{t.features.telegram.title}</h3>
                <p className={s.cardText}>{t.features.telegram.text}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section className={`${s.section} ${s.sectionMid}`}>
          <div className={s.stepsWrap}>
            <h2 className={s.h2} style={{ marginBottom: "4rem" }}>
              {t.steps.title}
            </h2>
            <div className={s.steps}>
              <div className={s.stepLine} />
              <div className={s.step}>
                <div className={s.stepCircle}>1</div>
                <div>
                  <h4 className={s.stepTitle}>{t.steps.s1.title}</h4>
                  <p className={s.stepText}>{t.steps.s1.text}</p>
                </div>
              </div>
              <div className={s.step}>
                <div className={s.stepCircle}>2</div>
                <div>
                  <h4 className={s.stepTitle}>{t.steps.s2.title}</h4>
                  <p className={s.stepText}>{t.steps.s2.text}</p>
                </div>
              </div>
              <div className={s.step}>
                <div className={s.stepCircle}>3</div>
                <div>
                  <h4 className={s.stepTitle}>{t.steps.s3.title}</h4>
                  <p className={s.stepText}>{t.steps.s3.text}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section className={s.section} id="pricing">
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.h2}>{p.title}</h2>
              <p className={s.lead}>{p.subtitle}</p>
            </div>
            <div className={s.pricingGrid}>
              {/* Free */}
              <div className={`${s.priceCard} ${s.glassCard}`}>
                <div className={s.planHead}>
                  <h3 className={s.planName}>{p.free.name}</h3>
                  <div className={s.priceRow}>
                    <span className={s.price}>{p.free.price}</span>
                    <span className={s.pricePer}>{p.perFree}</span>
                  </div>
                </div>
                <ul className={s.planList}>
                  {[p.free.f1, p.free.f2, p.free.f3].map((f) => (
                    <li className={s.planItem} key={f}>
                      <IconCheck size={20} className={s.cPrimary} /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={s.planBtn}>
                  {p.free.cta}
                </Link>
              </div>

              {/* Basic (popular) */}
              <div className={`${s.priceCard} ${s.priceCardPopular} ${s.glassCard}`}>
                <span className={s.popularBadge}>{p.popular}</span>
                <div className={s.planHead}>
                  <h3 className={`${s.planName} ${s.planNamePrimary}`}>{p.basic.name}</h3>
                  <div className={s.priceRow}>
                    <span className={s.price}>{p.basic.price}</span>
                    <span className={s.pricePer}>{p.perMonth}</span>
                  </div>
                </div>
                <ul className={s.planList}>
                  {[p.basic.f1, p.basic.f2, p.basic.f3, p.basic.f4].map((f, i) => (
                    <li className={`${s.planItem} ${i === 0 ? s.planItemBold : ""}`} key={f}>
                      <IconCheck size={20} className={s.cPrimary} /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={`${s.planBtn} ${s.planBtnPrimary}`}>
                  {p.basic.cta}
                </Link>
              </div>

              {/* Smart */}
              <div className={`${s.priceCard} ${s.priceCardSmart} ${s.glassCard}`}>
                <div className={s.planHead}>
                  <h3 className={`${s.planName} ${s.planNameSecondary}`}>{p.smart.name}</h3>
                  <div className={s.priceRow}>
                    <span className={s.price}>{p.smart.price}</span>
                    <span className={s.pricePer}>{p.perMonth}</span>
                  </div>
                </div>
                <ul className={s.planList}>
                  {[p.smart.f1, p.smart.f2, p.smart.f3, p.smart.f4].map((f, i) => (
                    <li className={`${s.planItem} ${i === 2 ? s.planItemBold : ""}`} key={f}>
                      <IconCheck size={20} className={s.cSecondary} /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={`${s.planBtn} ${s.planBtnSecondary}`}>
                  {p.smart.cta}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Developers ---- */}
        <section className={`${s.section} ${s.sectionAlt}`} id="developers">
          <div className={`${s.container} ${s.bento}`} style={{ alignItems: "center" }}>
            <div className={s.devText}>
              <h2 className={s.h2}>{t.devSection.title}</h2>
              <p className={s.lead} style={{ marginBottom: "2rem" }}>
                {t.devSection.text}
              </p>
              <Link href="/developers" className={s.devBtn}>
                <IconBook size={20} />
                {t.devSection.cta}
              </Link>
            </div>
            <div className={s.devMedia}>
              <div className={s.codeWrap}>
                <div className={s.codeDots}>
                  <span className={`${s.dot} ${s.dotR}`} />
                  <span className={`${s.dot} ${s.dotY}`} />
                  <span className={`${s.dot} ${s.dotG}`} />
                </div>
                <pre className={s.codePre}>
                  <span className={s.tComment}>{t.devSection.codeComment}</span>
                  {"\n"}
                  <span className={s.tKeyword}>const</span> rafraf ={" "}
                  <span className={s.tKeyword}>require</span>(
                  <span className={s.tString}>{"'rafraf-sdk'"}</span>);{"\n\n"}
                  rafraf.<span className={s.tFunc}>init</span>({"{ "}
                  {"\n  apiKey: "}
                  <span className={s.tString}>{"'your_secret_key'"}</span>
                  {"\n}"});{"\n\n"}
                  <span className={s.tKeyword}>async</span>{" "}
                  <span className={s.tKeyword}>function</span>{" "}
                  <span className={s.tFunc}>getSales</span>() {"{"}
                  {"\n  "}
                  <span className={s.tKeyword}>const</span> sales ={" "}
                  <span className={s.tKeyword}>await</span> rafraf.
                  <span className={s.tFunc}>getDailyTotal</span>();{"\n  "}
                  <span className={s.tVar}>console</span>.
                  <span className={s.tFunc}>log</span>(
                  <span className={s.tString}>{"'Today Sales:'"}</span>, sales);
                  {"\n}"}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Testimonials ---- */}
        <section className={s.section}>
          <div className={s.container}>
            <h2 className={s.h2} style={{ textAlign: "center", marginBottom: "4rem" }}>
              {t.testimonials.title}
            </h2>
            <div className={s.testGrid}>
              {[t.testimonials.t1, t.testimonials.t2, t.testimonials.t3].map((q) => (
                <div className={`${s.testCard} ${s.glassCard}`} key={q.name}>
                  <span className={s.quoteMark}>
                    <IconQuote size={36} />
                  </span>
                  <p className={s.testText}>{q.text}</p>
                  <div className={s.testFoot}>
                    <div className={s.avatar}>{q.avatar}</div>
                    <div>
                      <div className={s.testName}>{q.name}</div>
                      <div className={s.testRole}>{q.role}</div>
                    </div>
                  </div>
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
                {t.finalCta.cta}
              </Link>
              <p className={s.finalNote}>{t.finalCta.note}</p>
            </div>
            <div className={s.glowA} />
            <div className={s.glowB} />
          </div>
        </section>
      </main>

      {/* ---- Footer ---- */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <div className={s.logo}>{dict.app.name}</div>
            <p className={s.footerText}>{t.footer.tagline}</p>
            <div className={s.socials}>
              <a className={s.social} href="#" aria-label="Telegram">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.4.52-.46-.01-1.35-.26-2.01-.48-.81-.27-1.45-.41-1.39-.87.03-.24.31-.49.85-.75 3.33-1.45 5.55-2.4 6.67-2.87 3.18-1.32 3.84-1.55 4.27-1.56.1 0 .31.02.45.14.12.1.15.24.17.34-.01.06 0 .13-.01.19z" />
                </svg>
              </a>
            </div>
          </div>
          <div className={s.footerCols}>
            <div className={s.footerCol}>
              <h5 className={s.footerColTitle}>{t.footer.company}</h5>
              <a className={s.footerLink} href="#">{t.footer.about}</a>
              <a className={s.footerLink} href="#pricing">{t.footer.pricing}</a>
              <a className={s.footerLink} href="#">{t.footer.contact}</a>
            </div>
            <div className={s.footerCol}>
              <h5 className={s.footerColTitle}>{t.footer.legal}</h5>
              <a className={s.footerLink} href="#">{t.footer.privacy}</a>
              <a className={s.footerLink} href="#">{t.footer.terms}</a>
              <a className={s.footerLink} href="#">{t.footer.data}</a>
            </div>
            <div className={s.footerCol}>
              <h5 className={s.footerColTitle}>{t.footer.developers}</h5>
              <Link className={s.footerLink} href="/developers">{t.footer.apiDocs}</Link>
              <a className={s.footerLink} href="#">{t.footer.github}</a>
            </div>
          </div>
        </div>
        <div className={s.footerBottom}>{t.footer.rights}</div>
      </footer>
    </>
  );
}
