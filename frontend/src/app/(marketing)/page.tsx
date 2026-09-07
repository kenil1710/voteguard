import Link from "next/link";
import { HeroSeal } from "@/components/HeroSeal";
import { DimensionBar, FlagList, VerdictBadge } from "@/components/ui";
import { getRecent, getStats } from "@/lib/contract";
import { NETWORK } from "@/lib/genlayer";
import { ago } from "@/lib/format";

export const revalidate = 60;

const STEPS = [
  {
    n: "01",
    title: "Submit a URL",
    body: "A Snapshot proposal, a Tally proposal, or a topic on any Discourse governance forum. Nothing else is needed — not an API key, not the proposal text.",
  },
  {
    n: "02",
    title: "Validators read it, independently",
    body: "The URL is parsed into an identifier and each validator fetches the proposal itself. What the user typed is never fetched: snapshot.org is a hash-routed app whose every proposal URL returns the same empty shell.",
  },
  {
    n: "03",
    title: "One rubric, applied five ways",
    body: "Nineteen features are parsed from the proposal text and five are read by a model against a fixed ladder — each requiring a verbatim quote. The parser sets a floor and a ceiling; the model picks inside them.",
  },
  {
    n: "04",
    title: "The assessment lands on chain",
    body: "Every stored number is recomputed from the agreed feature vector, so anyone can replay the arithmetic years later — and any contract can ask before it executes.",
  },
];

/**
 * The example card is deliberately STATIC and deliberately labelled as such.
 * A landing page that renders a live record can show an empty box on a slow
 * RPC, and the first thing a visitor would learn is that the oracle is broken.
 */
const EXAMPLE = {
  title: "[ARFC] Deploy Aave V4 on Arc",
  dao: "Aave DAO",
  verdict: "CAUTION",
  score: 60,
  dimensions: [
    {
      name: "Feasibility",
      label: "STRAIGHTFORWARD",
      score: 80,
      weight: 25,
      evidence:
        "the initial deployment would activate with one liquidity hub and two spokes, supporting an initial set of high-quality assets",
    },
    {
      name: "Budget risk",
      label: "AGGRESSIVE",
      score: 35,
      weight: 25,
      evidence:
        "aave dao is expected to receive a minimum of $2m per year in protocol revenue from the aave v4 deployment on arc",
    },
    {
      name: "Centralization risk",
      label: "CONCENTRATED",
      score: 45,
      weight: 20,
      evidence:
        "these values may be refined once liquidity is deployed and market conditions become observable on-chain.",
    },
    {
      name: "Clarity",
      label: "ADEQUATE",
      score: 80,
      weight: 15,
      evidence: "this arfc proposes deploying aave protocol v4 on arc network.",
    },
    {
      name: "Alignment",
      label: "NEUTRAL",
      score: 80,
      weight: 15,
      evidence:
        "generates additional protocol tvl and revenue. arc s infrastructure is designed to concentrate stablecoin liquidity",
    },
  ],
  flags: ["UNSTATED_AMOUNT", "NO_CLAWBACK", "NO_MILESTONES", "NO_TIMELINE"],
};

export default async function Landing() {
  const [stats, recent] = await Promise.all([getStats(), getRecent(3)]);
  const analysed = Number(stats?.total_analyzed ?? 0);
  const daos = Number(stats?.daos_tracked ?? 0);
  const verdicts = stats?.verdicts ?? {};

  return (
    <>
      {/* ── hero ────────────────────────────────────────────────────────── */}
      <section className="seal-grid relative overflow-hidden border-b border-ink-700/40">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink-600/50 bg-ink-850/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-300">
              <span className="h-1.5 w-1.5 rounded-full bg-royal-400" />
              On-chain governance oracle · {NETWORK}
            </div>
            <h1 className="font-display text-4xl leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Every proposal
              <br />
              deserves a{" "}
              <span className="text-royal-400">second opinion</span>.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-300">
              DAOs vote on proposals that move millions, written by whoever
              wanted to write them and read carefully by almost nobody.
              VoteGuard puts a structured risk assessment on chain — five
              independent validators, one fixed rubric, and a verdict any
              contract can check before it executes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/analyze"
                className="rounded-md bg-royal-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-royal-400"
              >
                Analyse a proposal
              </Link>
              <Link
                href="/proposals"
                className="rounded-md border border-ink-600/60 px-5 py-3 text-sm font-semibold text-ink-200 transition-colors hover:border-royal-400/60 hover:text-white"
              >
                Browse assessments
              </Link>
            </div>
            <p className="mt-5 text-xs text-ink-500">
              Supports Snapshot, Tally, and any Discourse governance forum —
              Aave, Arbitrum, Uniswap, ENS, Lido, Optimism, Balancer, Gitcoin.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <HeroSeal className="w-full" />
          </div>
        </div>
      </section>

      {/* ── stats ───────────────────────────────────────────────────────── */}
      <section className="border-b border-ink-700/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-5 py-10 sm:grid-cols-4">
          {[
            { label: "Proposals analysed", value: analysed },
            { label: "DAOs covered", value: daos },
            {
              label: "Recommended",
              value: Number(verdicts.RECOMMEND ?? 0),
              tone: "text-[color:var(--color-verdict-good)]",
            },
            {
              label: "Flagged or opposed",
              value:
                Number(verdicts.CAUTION ?? 0) + Number(verdicts.OPPOSE ?? 0),
              tone: "text-[color:var(--color-verdict-warn)]",
            },
          ].map((s) => (
            <div key={s.label} className="px-2 text-center sm:px-4">
              <div
                className={`tabular font-display text-4xl leading-none ${s.tone ?? "text-ink-100"}`}
              >
                {s.value}
              </div>
              <div className="label mt-2">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── how it works ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-10 max-w-2xl">
          <div className="label mb-2">How it works</div>
          <h2 className="font-display text-3xl tracking-tight text-white">
            Four steps, none of which require trusting us
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-ink-700/50 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-ink-850/60 p-6">
              <div className="font-display text-2xl text-royal-400/70">{s.n}</div>
              <h3 className="mt-3 font-display text-lg text-ink-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── the example ─────────────────────────────────────────────────── */}
      <section className="border-y border-ink-700/40 bg-ink-950/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <div className="label mb-2">What an assessment looks like</div>
            <h2 className="font-display text-3xl leading-tight tracking-tight text-white">
              Five dimensions, each with the sentence it rests on
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Every dimension the model scores arrives with a fragment it copied
              out of the proposal, and every validator checks that fragment
              against its own copy of the text. A level whose evidence is not
              actually in the proposal is discarded — so a model that invents a
              justification cannot move a score at all.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              The overall verdict is then derived by arithmetic, not opinion.
              Any dimension at its worst rung forfeits a recommendation; two of
              them is an <span className="text-[color:var(--color-verdict-bad)]">OPPOSE</span>{" "}
              whatever the weighted average says.
            </p>
            <Link
              href="/docs"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-royal-300 hover:text-royal-200"
            >
              Read the full methodology →
            </Link>
          </div>

          <figure className="card rounded-xl p-6">
            <figcaption className="sr-only">
              An example assessment, shown as a static illustration
            </figcaption>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label">{EXAMPLE.dao}</div>
                <h3 className="mt-1 font-display text-xl leading-snug text-ink-100">
                  {EXAMPLE.title}
                </h3>
              </div>
              <VerdictBadge verdict={EXAMPLE.verdict} score={EXAMPLE.score} />
            </div>
            <div className="mt-5">
              {EXAMPLE.dimensions.map((d) => (
                <DimensionBar key={d.name} {...d} />
              ))}
            </div>
            <div className="mt-5 border-t border-ink-700/50 pt-4">
              <div className="label mb-2">Findings</div>
              <FlagList flags={EXAMPLE.flags} />
            </div>
            <p className="mt-4 text-[11px] text-ink-500">
              A real assessment of a real Aave proposal, captured from
              Studionet. Shown as a fixed illustration so this page cannot
              render half-empty when the RPC is slow.
            </p>
          </figure>
        </div>
      </section>

      {/* ── recent ──────────────────────────────────────────────────────── */}
      {recent.length ? (
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="label mb-2">Live from the contract</div>
              <h2 className="font-display text-3xl tracking-tight text-white">
                Recently assessed
              </h2>
            </div>
            <Link
              href="/proposals"
              className="text-sm font-semibold text-royal-300 hover:text-royal-200"
            >
              See all →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {recent.map((a) => (
              <Link
                key={a.assessment_id}
                href={`/proposal/${a.assessment_id}`}
                className="card card-hover flex flex-col rounded-lg p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="label">{a.dao || a.dao_id}</span>
                  <VerdictBadge verdict={a.verdict} size="sm" />
                </div>
                <h3 className="mt-2 line-clamp-2 font-display text-[17px] leading-snug text-ink-100">
                  {a.title}
                </h3>
                <div className="mt-auto flex items-baseline justify-between pt-4">
                  <span className="tabular font-display text-2xl text-ink-100">
                    {a.overall_score}
                    <span className="text-sm text-ink-500">/100</span>
                  </span>
                  <span className="text-xs text-ink-500">
                    {ago(a.age_seconds)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── cta ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="card seal-grid rounded-xl px-8 py-14 text-center">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
            Check a proposal before you vote
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-300">
            Paste any Snapshot, Tally or forum URL. The assessment lands on
            chain, recomputes from its own evidence, and any contract can read
            it.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/analyze"
              className="rounded-md bg-royal-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-royal-400"
            >
              Analyse a proposal
            </Link>
            <Link
              href="/docs#integrate"
              className="rounded-md border border-ink-600/60 px-6 py-3 text-sm font-semibold text-ink-200 transition-colors hover:border-royal-400/60 hover:text-white"
            >
              Integrate the oracle
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
