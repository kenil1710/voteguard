import type { Verdict } from "./types";

export const VERDICT_STYLE: Record<
  string,
  { text: string; bg: string; border: string; dot: string; label: string }
> = {
  RECOMMEND: {
    text: "text-[color:var(--color-verdict-good)]",
    bg: "bg-[color-mix(in_oklab,var(--color-verdict-good)_12%,transparent)]",
    border: "border-[color-mix(in_oklab,var(--color-verdict-good)_40%,transparent)]",
    dot: "bg-[color:var(--color-verdict-good)]",
    label: "Recommend",
  },
  CAUTION: {
    text: "text-[color:var(--color-verdict-warn)]",
    bg: "bg-[color-mix(in_oklab,var(--color-verdict-warn)_12%,transparent)]",
    border: "border-[color-mix(in_oklab,var(--color-verdict-warn)_40%,transparent)]",
    dot: "bg-[color:var(--color-verdict-warn)]",
    label: "Caution",
  },
  OPPOSE: {
    text: "text-[color:var(--color-verdict-bad)]",
    bg: "bg-[color-mix(in_oklab,var(--color-verdict-bad)_12%,transparent)]",
    border: "border-[color-mix(in_oklab,var(--color-verdict-bad)_40%,transparent)]",
    dot: "bg-[color:var(--color-verdict-bad)]",
    label: "Oppose",
  },
  UNKNOWN: {
    text: "text-ink-400",
    bg: "bg-ink-800/60",
    border: "border-ink-600/50",
    dot: "bg-ink-500",
    label: "Not analysed",
  },
};

export function verdictStyle(v: string | undefined) {
  return VERDICT_STYLE[v ?? "UNKNOWN"] ?? VERDICT_STYLE.UNKNOWN;
}

/** A dimension score to a bar colour. The rung, not the number, sets the hue. */
export function scoreHue(score: number) {
  if (score >= 70) return "var(--color-verdict-good)";
  if (score >= 45) return "var(--color-verdict-warn)";
  return "var(--color-verdict-bad)";
}

export const PLATFORM_LABEL: Record<string, string> = {
  snapshot: "Snapshot",
  tally: "Tally",
  discourse: "Forum",
};

export function titleCase(key: string) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function flagLabel(flag: string) {
  return flag.toLowerCase().split("_").join(" ");
}

export function shortAddress(a: string) {
  if (!a || a.length < 12) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ago(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function whenUtc(epoch: number) {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function gen(wei: string | number | undefined) {
  const n = Number(wei ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0";
  return (n / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function verdictOf(v: string | undefined): Verdict {
  return (["RECOMMEND", "CAUTION", "OPPOSE"].includes(v ?? "")
    ? v
    : "UNKNOWN") as Verdict;
}
