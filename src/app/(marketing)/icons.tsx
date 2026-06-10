// Inline SVG icons for the landing page — replaces the Material Symbols icon font
// (external font is blocked by the strict CSP). Stroke icons inherit `currentColor`.

type Props = { size?: number; className?: string };

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true,
});

export function IconBolt({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconBook({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
export function IconBox({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
export function IconTrending({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
export function IconCloudOff({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
export function IconWallet({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}
export function IconBars({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <line x1="3" y1="21" x2="3" y2="3" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="7" y="12" width="3" height="6" fill="currentColor" stroke="none" />
      <rect x="12" y="8" width="3" height="10" fill="currentColor" stroke="none" />
      <rect x="17" y="5" width="3" height="13" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconBackup({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      <polyline points="9 13 12 10 15 13" />
      <line x1="12" y1="10" x2="12" y2="20" />
    </svg>
  );
}
export function IconChat({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}
export function IconCheck({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
export function IconCode({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
export function IconWifiOff({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}
export function IconQuote({ size = 24, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7.17 6A5.17 5.17 0 0 0 2 11.17V18h6.83v-6.83H5.5A1.67 1.67 0 0 1 7.17 9.5zM18.5 6a5.17 5.17 0 0 0-5.17 5.17V18H20.17v-6.83h-3.34A1.67 1.67 0 0 1 18.5 9.5z" />
    </svg>
  );
}
export function IconMenu({ size = 24, className }: Props) {
  return (
    <svg {...base(size, className)}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
