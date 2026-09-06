"use client";

import { useState } from "react";

/**
 * The verification panel.
 *
 * `verified` is not a badge the site awards; it is what the CONTRACT returned
 * when asked to recompute the record from its own evidence. A page that
 * rendered a green tick it had decided for itself would be exactly the thing
 * this project exists to argue against.
 */
export function EvidencePanel({
  assessmentId,
  evidence,
  contentHash,
  verified,
  differences,
}: {
  assessmentId: number;
  evidence: string;
  contentHash: string;
  verified: boolean | null;
  differences: string[];
}) {
  const [open, setOpen] = useState(false);
  let parsed: Record<string, number> | null = null;
  try {
    parsed = JSON.parse(evidence) as Record<string, number>;
  } catch {
    parsed = null;
  }

  const MODEL = new Set(["mfeas", "mbud", "mcen", "mcla", "mali"]);
  const entries = parsed ? Object.entries(parsed) : [];
  const model = entries.filter(([k]) => MODEL.has(k));
  const parsedFields = entries.filter(([k]) => !MODEL.has(k));

  const tone =
    verified === true
      ? {
          border: "border-[color-mix(in_oklab,var(--color-verdict-good)_45%,transparent)]",
          bg: "bg-[color-mix(in_oklab,var(--color-verdict-good)_10%,transparent)]",
          text: "text-[color:var(--color-verdict-good)]",
        }
      : verified === false
        ? {
            border: "border-[color-mix(in_oklab,var(--color-verdict-bad)_45%,transparent)]",
            bg: "bg-[color-mix(in_oklab,var(--color-verdict-bad)_10%,transparent)]",
            text: "text-[color:var(--color-verdict-bad)]",
          }
        : { border: "border-ink-600/50", bg: "bg-ink-800/40", text: "text-ink-300" };

  return (
    <section className={`rounded-lg border p-5 ${tone.border} ${tone.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg text-ink-100">Verification</h2>
        <span className={`text-[11px] font-bold uppercase tracking-widest ${tone.text}`}>
          {verified === true ? "Verified" : verified === false ? "Mismatch" : "Unreachable"}
        </span>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-ink-300">
        {verified === true ? (
          <>
            The contract recomputed every score, label, finding and the verdict
            from the evidence vector alone, and got the stored record back —
            including the content hash.
          </>
        ) : verified === false ? (
          <>
            The stored record does not follow from its own evidence. No honest
            path through the contract can produce this.
          </>
        ) : (
          <>The oracle could not be reached to run the recomputation.</>
        )}
      </p>

      {differences.length ? (
        <ul className="mt-3 space-y-1 font-mono text-[11px] text-[color:var(--color-verdict-bad)]">
          {differences.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <div className="label mb-1.5">Content hash</div>
        <code className="block break-all font-mono text-[11px] text-ink-300">
          {contentHash}
        </code>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-4 text-[12px] font-semibold text-royal-300 hover:text-royal-200"
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} the {entries.length}-field evidence vector
      </button>

      {open && parsed ? (
        <div className="mt-3 space-y-3">
          <div>
            <div className="label mb-1.5">
              Parsed from the proposal — identical on every validator
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:grid-cols-3">
              {parsedFields.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-ink-500">{k}</span>
                  <span className="tabular text-ink-200">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">
              Read by the model — quote-checked, then clamped
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:grid-cols-3">
              {model.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-royal-300/80">{k}</span>
                  <span className="tabular text-ink-200">
                    {v === 4 ? "abstained" : v}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-500">
            Assessment #{assessmentId}. Any reader can paste this vector into
            the published rubric and reach the same five numbers.
          </p>
        </div>
      ) : null}
    </section>
  );
}
