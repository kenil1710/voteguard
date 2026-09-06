"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Preview } from "@/lib/types";

/**
 * The submit form.
 *
 * The PREVIEW is the interesting part and it is free. It shows the caller the
 * URL the contract will actually fetch, which for Snapshot is a different
 * string entirely from the one they pasted — and that difference is the whole
 * first design decision made visible rather than explained.
 *
 * The write itself is not sent from here. The contract charges a fee and takes
 * a wallet signature, and the honest thing on a page with no wallet connected
 * is to hand over the exact command rather than to pretend.
 */
export function AnalyzeForm({ fee, paused }: { fee: string; paused: boolean }) {
  const [url, setUrl] = useState("");
  const [dao, setDao] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a proposal URL first.");
      return;
    }
    start(async () => {
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const json = (await res.json()) as Preview;
        setPreview(json);
        if (!json.ok) setError(json.reason ?? "That URL cannot be analysed.");
      } catch {
        setError("Could not reach the oracle. Try again in a moment.");
      }
    });
  }

  const command =
    preview?.ok && preview.proposal_key
      ? `genlayer write $VOTEGUARD analyze_proposal \\\n  --args "${url.trim()}" "${dao.trim() || "—"}"`
      : "";

  return (
    <div className="card rounded-lg p-6">
      <form onSubmit={check} className="space-y-5">
        <div>
          <label htmlFor="url" className="label mb-2 block">
            Proposal URL
          </label>
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://snapshot.org/#/aavedao.eth/proposal/0x…"
            className="w-full rounded-md border border-ink-600/60 bg-ink-900/80 px-3.5 py-3 font-mono text-[13px] text-ink-100 placeholder:text-ink-500 focus:border-royal-400"
          />
          <p className="mt-2 text-xs text-ink-500">
            Snapshot, Tally, or any Discourse forum topic.
          </p>
        </div>

        <div>
          <label htmlFor="dao" className="label mb-2 block">
            DAO name <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="dao"
            name="dao"
            type="text"
            autoComplete="off"
            value={dao}
            onChange={(e) => setDao(e.target.value)}
            placeholder="Aave DAO"
            className="w-full rounded-md border border-ink-600/60 bg-ink-900/80 px-3.5 py-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-royal-400"
          />
          <p className="mt-2 text-xs text-ink-500">
            A label only. The authoritative DAO is read from the proposal
            document, and a mismatch is reported rather than believed.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-royal-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-royal-400 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Preview — free, no transaction"}
        </button>
      </form>

      {error ? (
        <div className="mt-5 rounded-md border border-[color-mix(in_oklab,var(--color-verdict-bad)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-bad)_10%,transparent)] px-4 py-3">
          <p className="text-sm text-[color:var(--color-verdict-bad)]">{error}</p>
        </div>
      ) : null}

      {preview?.ok ? (
        <div className="mt-6 space-y-4 border-t border-ink-700/50 pt-6">
          <div className="flex items-center gap-2">
            <span className="rounded border border-royal-500/40 bg-royal-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-royal-300">
              {preview.platform}
            </span>
            {preview.already_analyzed ? (
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--color-verdict-good)]">
                Already assessed
              </span>
            ) : null}
          </div>

          <div>
            <div className="label mb-1.5">Canonical identity</div>
            <code className="block break-all rounded bg-ink-900/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-200">
              {preview.proposal_key}
            </code>
          </div>

          <div>
            <div className="label mb-1.5">What the validators will fetch</div>
            <code className="block break-all rounded bg-ink-900/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-300">
              {preview.fetch_url}
            </code>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
              Not the URL you pasted. A plain GET of a snapshot.org proposal
              link returns the same 1,363-byte empty app shell for every
              proposal that has ever existed, so the contract never fetches one.
            </p>
          </div>

          {preview.already_analyzed && preview.latest_assessment_id ? (
            <Link
              href={`/proposal/${preview.latest_assessment_id}`}
              className="inline-flex w-full items-center justify-center rounded-md border border-ink-600/60 px-4 py-3 text-sm font-semibold text-ink-100 transition-colors hover:border-royal-400/60"
            >
              View assessment #{preview.latest_assessment_id} →
            </Link>
          ) : (
            <div>
              <div className="label mb-1.5">Submit it</div>
              <pre className="overflow-x-auto rounded bg-ink-900/70 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink-200">
                {command}
              </pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(command);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="mt-2 text-[12px] font-semibold text-royal-300 hover:text-royal-200"
              >
                {copied ? "Copied" : "Copy command"}
              </button>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                {paused
                  ? "Submissions are paused right now; reads and refunds are unaffected."
                  : fee === "0"
                    ? "The fee is currently zero on this deployment."
                    : `Send ${fee} GEN with the call. Anything over the fee is credited back.`}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
