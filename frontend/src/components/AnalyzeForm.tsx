"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { refreshAfterAnalysis } from "@/app/(app)/actions";
import { submitAnalysis, type SubmitResult } from "@/lib/wallet";
import { explorerTx } from "@/lib/genlayer";
import { gen } from "@/lib/format";
import type { Preview } from "@/lib/types";

/**
 * The submit form, in two halves.
 *
 * The PREVIEW is free and is the interesting half. It shows the caller the URL
 * the contract will actually fetch, which for Snapshot is a different string
 * entirely from the one they pasted — the whole first design decision made
 * visible rather than explained.
 *
 * The SUBMIT is the payable half. It is signed by the connected wallet and
 * waits out the consensus round, which takes minutes because five validators
 * each fetch and read the proposal. The CLI command stays on the page for
 * anyone without a browser wallet; it is the same call, made the other way.
 */
export function AnalyzeForm({
  fee,
  feeWei,
  paused,
}: {
  fee: string;
  feeWei: string;
  paused: boolean;
}) {
  const router = useRouter();
  const { account, connect, connecting, hasWallet, onWrongNetwork, switchNetwork } =
    useWallet();

  const [url, setUrl] = useState("");
  const [dao, setDao] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    setResult(null);
    setPendingHash(null);
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

  async function submit() {
    if (!account) return;
    setSubmitting(true);
    setResult(null);
    setPendingHash(null);
    try {
      const out = await submitAnalysis(
        account,
        url.trim(),
        dao.trim(),
        BigInt(feeWei || "0"),
        setPendingHash,
      );
      setResult(out);
      // The proposal list and the DAO pages are server-cached reads. The
      // action expires them on the server; refresh() then re-pulls them into
      // this client. Both halves are needed — see (app)/actions.ts.
      if (out.kind === "ok") {
        await refreshAfterAnalysis();
        router.refresh();
      }
    } catch (e) {
      setResult({
        kind: "failed",
        hash: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const command =
    preview?.ok && preview.proposal_key
      ? `genlayer write $VOTEGUARD analyze_proposal \\\n  --args "${url.trim()}" "${dao.trim() || "—"}"`
      : "";

  const canSubmit =
    Boolean(preview?.ok) && !preview?.already_analyzed && !paused && !submitting;

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
          className="w-full rounded-md border border-ink-600/60 px-4 py-3 text-sm font-semibold text-ink-100 transition-colors hover:border-royal-400/60 disabled:opacity-50"
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
            <div className="space-y-3">
              <div className="label">Submit it</div>

              {paused ? (
                <p className="rounded-md border border-[color-mix(in_oklab,var(--color-verdict-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-warn)_10%,transparent)] px-4 py-3 text-[13px] text-[color:var(--color-verdict-warn)]">
                  Submissions are paused right now; reads and refunds are
                  unaffected.
                </p>
              ) : onWrongNetwork ? (
                <button
                  onClick={switchNetwork}
                  className="w-full rounded-md border border-[color-mix(in_oklab,var(--color-verdict-warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-warn)_12%,transparent)] px-4 py-3 text-sm font-semibold text-[color:var(--color-verdict-warn)]"
                >
                  Switch your wallet to the right network
                </button>
              ) : account ? (
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="w-full rounded-md bg-royal-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-royal-400 disabled:opacity-50"
                >
                  {submitting
                    ? "Waiting for the validators…"
                    : fee === "0"
                      ? "Submit for analysis — free on this deployment"
                      : `Submit for analysis — ${fee} GEN`}
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="w-full rounded-md bg-royal-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-royal-400 disabled:opacity-50"
                >
                  {connecting
                    ? "Connecting…"
                    : hasWallet
                      ? "Connect wallet to submit"
                      : "Install a wallet to submit"}
                </button>
              )}

              {submitting ? (
                <p className="text-[12px] leading-relaxed text-ink-400">
                  Five validators are each fetching and reading the proposal,
                  then agreeing on the vector. This takes a few minutes — leave
                  the tab open.
                  {pendingHash ? (
                    <>
                      {" "}
                      <a
                        href={explorerTx(pendingHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-royal-300 hover:text-royal-200"
                      >
                        Follow the transaction →
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}

              <SubmitOutcome result={result} />

              <details className="group">
                <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink-400 hover:text-ink-200">
                  Or submit it from the command line →
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-ink-900/70 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink-200">
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
              </details>

              <p className="text-[12px] leading-relaxed text-ink-500">
                {fee === "0"
                  ? "The fee is zero on this deployment, so the call costs gas only."
                  : `${fee} GEN is sent with the call. Anything over the fee is credited back.`}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Three outcomes, kept visually distinct.
 *
 * `rejected` is the one that matters: the transaction SUCCEEDED and the fee
 * came back. Showing it as an error would be wrong, and showing it as a
 * confirmation would be worse.
 */
function SubmitOutcome({ result }: { result: SubmitResult | null }) {
  if (!result) return null;

  if (result.kind === "failed") {
    return (
      <div className="rounded-md border border-[color-mix(in_oklab,var(--color-verdict-bad)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-bad)_10%,transparent)] px-4 py-3">
        <p className="text-sm text-[color:var(--color-verdict-bad)]">
          {result.error}
        </p>
        {result.hash ? (
          <a
            href={explorerTx(result.hash)}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-block font-mono text-[11px] text-ink-400 hover:text-ink-200"
          >
            {result.hash.slice(0, 18)}… →
          </a>
        ) : null}
      </div>
    );
  }

  if (result.kind === "rejected") {
    return (
      <div className="rounded-md border border-[color-mix(in_oklab,var(--color-verdict-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-warn)_10%,transparent)] px-4 py-3">
        <p className="text-sm font-semibold text-[color:var(--color-verdict-warn)]">
          The contract turned this down.
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-300">
          {result.reason}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-400">
          {gen(result.refundWei)} GEN was credited back to you — claim it with{" "}
          <code className="font-mono">claim_refund()</code>. The transaction
          itself succeeded; nothing reverted while holding your money.
        </p>
        <a
          href={explorerTx(result.hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block font-mono text-[11px] text-ink-400 hover:text-ink-200"
        >
          {result.hash.slice(0, 18)}… →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[color-mix(in_oklab,var(--color-verdict-good)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-good)_10%,transparent)] px-4 py-3">
      <p className="text-sm font-semibold text-[color:var(--color-verdict-good)]">
        Assessed on chain.
      </p>
      {result.assessmentId ? (
        <Link
          href={`/proposal/${result.assessmentId}`}
          className="mt-1.5 inline-block text-[13px] font-semibold text-royal-300 hover:text-royal-200"
        >
          View assessment #{result.assessmentId} →
        </Link>
      ) : (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-300">
          The round settled. This network does not return the record with the
          receipt, so open{" "}
          <Link href="/proposals" className="font-semibold text-royal-300">
            the proposal list
          </Link>{" "}
          to read it.
        </p>
      )}
      <a
        href={explorerTx(result.hash)}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block font-mono text-[11px] text-ink-400 hover:text-ink-200"
      >
        {result.hash.slice(0, 18)}… →
      </a>
    </div>
  );
}
