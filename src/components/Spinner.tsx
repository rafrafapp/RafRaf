import styles from "./Spinner.module.css";

// Tiny inline loading spinner — pure CSS (CSP-safe, no external asset). Sized to
// the current font (1em) and inherits the text colour, so it sits cleanly next to
// a button label: `{pending ? <><Spinner /> {label.saving}</> : label.save}`.
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`${styles.spinner} ${className}`} aria-hidden="true" />;
}
