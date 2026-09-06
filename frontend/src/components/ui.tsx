import Link from "next/link";
import type { ReactNode } from "react";
import { PLATFORM_LABEL, flagLabel, scoreHue, verdictStyle } from "@/lib/format";

export function VerdictBadge({
  verdict,
  score,
  size = "md",
}: {
  verdict: string;
  score?: number;
  size?: "sm" | "md" | "lg";
}) {
  const s = verdictStyle(verdict);
  const pad =
    size === "lg"
      ? "px-4 py-2 text-sm"
      : size === "sm"
        ? "px-2 py-0.5 text-[11px]"
        : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-semibold tracking-wide ${s.bg} ${s.border} ${s.text} ${pad}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label.toUpperCase()}
      {typeof score === "number" ? (
        <span className="tabular opacity-70">{score}</span>
      ) : null}
    </span>
  );
}

export function PlatformTag({ platform }: { platform: string }) {
  return (
    <span className="rounded border border-ink-600/50 bg-ink-800/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink-300">
      {PLATFORM_LABEL[platform] ?? platform}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence?: string }) {
  if (!confidence) return null;
  const tone =
    confidence === "HIGH"
      ? "text-ink-200"
      : confidence === "MEDIUM"
        ? "text-ink-300"
        : "text-[color:var(--color-verdict-warn)]";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-widest ${tone}`}>
      {confidence} confidence
    </span>
  );
}

/** One dimension, as a labelled bar. The label is the finding; the bar is scale. */
export function DimensionBar({
  name,
  label,
  score,
  weight,
  evidence,
}: {
  name: string;
  label: string;
  score: number;
  weight: number;
  evidence?: string;
}) {
  return (
    <div className="border-t border-ink-700/50 py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h4 className="font-display text-[15px] text-ink-100">{name}</h4>
          <span className="text-[11px] text-ink-500">{weight}% weight</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: scoreHue(score) }}
          >
            {label}
          </span>
          <span className="tabular font-display text-lg text-ink-100">{score}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(2, score)}%`, background: scoreHue(score) }}
        />
      </div>
      {evidence ? (
        <p className="mt-2.5 border-l-2 border-royal-500/40 pl-3 text-[13px] leading-relaxed text-ink-300 italic">
          “{evidence}”
        </p>
      ) : (
        <p className="mt-2.5 text-[12px] text-ink-500">
          No verifiable quote — this dimension fell back to the parsed evidence.
        </p>
      )}
    </div>
  );
}

export function FlagList({ flags, max = 99 }: { flags: string[]; max?: number }) {
  if (!flags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.slice(0, max).map((f) => (
        <span
          key={f}
          className="rounded border border-ink-600/50 bg-ink-800/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-300"
        >
          {flagLabel(f)}
        </span>
      ))}
      {flags.length > max ? (
        <span className="px-1 py-0.5 text-[10px] text-ink-500">
          +{flags.length - max} more
        </span>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="card rounded-lg px-4 py-4">
      <div className="label">{label}</div>
      <div className="tabular mt-1.5 font-display text-3xl leading-none text-ink-100">
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-xs text-ink-400">{sub}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {eyebrow ? <div className="label mb-2">{eyebrow}</div> : null}
      <h2 className="font-display text-2xl tracking-tight text-ink-100 sm:text-3xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">{children}</p>
      ) : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card rounded-lg px-6 py-12 text-center">
      <h3 className="font-display text-lg text-ink-200">{title}</h3>
      {children ? (
        <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-400">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Button({
  href,
  children,
  variant = "primary",
  type,
  disabled,
}: {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  type?: "submit" | "button";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50";
  const style =
    variant === "primary"
      ? "bg-royal-500 text-white hover:bg-royal-400"
      : "border border-ink-600/60 text-ink-200 hover:border-royal-400/60 hover:text-white";
  if (href)
    return (
      <Link href={href} className={`${base} ${style}`}>
        {children}
      </Link>
    );
  return (
    <button type={type ?? "button"} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}
