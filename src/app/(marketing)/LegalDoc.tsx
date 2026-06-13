import Link from "next/link";
import { LangPill } from "./LangPill";
import type { Locale } from "@/i18n/config";
import s from "./legal.module.css";

type Doc = {
  title: string;
  intro: string;
  sections: { h: string; b: string }[];
};

type Props = {
  appName: string;
  locale: Locale;
  backHome: string;
  updated: string;
  rights: string;
  doc: Doc;
};

// Shared shell for the /terms and /privacy marketing pages (server component).
export function LegalDoc({
  appName,
  locale,
  backHome,
  updated,
  rights,
  doc,
}: Props) {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Link href="/" className={s.logo}>
          {appName}
        </Link>
        <div className={s.navEnd}>
          <LangPill current={locale} />
          <Link href="/" className={s.back}>
            {backHome}
          </Link>
        </div>
      </header>

      <main className={s.main}>
        <h1 className={s.title}>{doc.title}</h1>
        <p className={s.updated}>{updated}</p>
        <p className={s.intro}>{doc.intro}</p>
        {doc.sections.map((sec, i) => (
          <section className={s.section} key={i}>
            <h2 className={s.h}>{sec.h}</h2>
            <p className={s.b}>{sec.b}</p>
          </section>
        ))}
      </main>

      <footer className={s.footer}>{rights}</footer>
    </div>
  );
}
