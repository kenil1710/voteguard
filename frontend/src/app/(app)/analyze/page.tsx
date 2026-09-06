import type { Metadata } from "next";
import Link from "next/link";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import { getConfig } from "@/lib/contract";
import { gen } from "@/lib/format";

export const metadata: Metadata = {
  title: "Analyse a proposal",
  description:
    "Submit any Snapshot, Tally or Discourse governance proposal for an on-chain risk assessment.",
};

export const revalidate = 300;

const PLATFORMS = [
  {
    name: "Snapshot",
    shape: "snapshot.org/#/<space>/proposal/<0x…>",
    note: "Read through hub.snapshot.org — the proposal body is signed and pinned to IPFS, so every validator reads identical bytes.",
    examples: ["Aave", "Uniswap", "Arbitrum", "ENS", "Lido", "Balancer"],
  },
  {
    name: "Tally",
    shape: "tally.xyz/gov/<org>/proposal/<n>",
    note: "Read from the page's own server-rendered payload. Tally's API needs a key, which a contract cannot hold.",
    examples: ["Uniswap", "Compound", "Gitcoin"],
  },
  {
    name: "Discourse forums",
    shape: "<forum>/t/<slug>/<topic-id>",
    note: "Any DAO forum running Discourse. The slug is ignored — Discourse resolves a topic by id, so the title always comes from the document.",
    examples: [
      "governance.aave.com",
      "forum.arbitrum.foundation",
      "gov.uniswap.org",
      "gov.optimism.io",
    ],
  },
];

export default async function AnalyzePage() {
  const config = await getConfig();
  const fee = gen(config?.fee_wei);
  const paused = Boolean(config?.paused);
  const cooldown = Number(config?.limits?.proposal_cooldown_seconds ?? 900);
  const rateLimit = Number(config?.limits?.rate_limit_seconds ?? 300);

  return (
    <>
      <header className="mb-10">
        <div className="label mb-2">Submit</div>
        <h1 className="font-display text-4xl tracking-tight text-white">
          Analyse a proposal
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-300">
          Paste the URL of a live or closed governance proposal. VoteGuard
          parses it into an identifier, five validators fetch the proposal
          themselves, and the assessment lands on chain.
        </p>
      </header>

      {paused ? (
        <div className="mb-8 rounded-lg border border-[color-mix(in_oklab,var(--color-verdict-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-warn)_10%,transparent)] px-5 py-4">
          <p className="text-sm text-[color:var(--color-verdict-warn)]">
            <strong className="font-semibold">New analysis is paused.</strong>{" "}
            Every existing assessment is still readable and still verifiable —
            pausing blocks submissions only.
          </p>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr]">
        <AnalyzeForm fee={fee} paused={paused} />

        <aside className="space-y-6">
          <section className="card rounded-lg p-5">
            <h2 className="font-display text-lg text-ink-100">
              Supported platforms
            </h2>
            <div className="mt-4 space-y-5">
              {PLATFORMS.map((p) => (
                <div key={p.name}>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-royal-500/40 bg-royal-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-royal-300">
                      {p.name}
                    </span>
                  </div>
                  <code className="mt-1.5 block font-mono text-[11px] leading-relaxed text-ink-300">
                    {p.shape}
                  </code>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
                    {p.note}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.examples.map((e) => (
                      <span
                        key={e}
                        className="rounded bg-ink-800/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-400"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card rounded-lg p-5">
            <h2 className="font-display text-lg text-ink-100">What it costs</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-400">Fee per analysis</dt>
                <dd className="tabular font-semibold text-ink-100">
                  {fee === "0" ? "Free" : `${fee} GEN`}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-400">Per-wallet cooldown</dt>
                <dd className="tabular text-ink-200">{rateLimit / 60} min</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-400">Per-proposal cooldown</dt>
                <dd className="tabular text-ink-200">{cooldown / 60} min</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-ink-700/50 pt-4 text-[13px] leading-relaxed text-ink-400">
              A submission that is refused — an unsupported URL, a proposal that
              cannot be read, a cooldown that has not elapsed — is{" "}
              <strong className="font-semibold text-ink-200">
                refunded in full
              </strong>
              , claimable with <code className="font-mono">claim_refund()</code>
              . No path that takes money can revert while holding it.
            </p>
          </section>

          <section className="card rounded-lg p-5">
            <h2 className="font-display text-lg text-ink-100">
              What is never read
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
              Vote counts, quorum progress and proposal state are all excluded
              from the request the validators make — not merely ignored
              afterwards. An assessment that changed because somebody voted
              would not be a risk assessment.
            </p>
            <Link
              href="/docs"
              className="mt-3 inline-block text-[13px] font-semibold text-royal-300 hover:text-royal-200"
            >
              The full rubric →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
