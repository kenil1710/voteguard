import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/contract";
import { CONSUMER, NETWORK, VOTEGUARD, explorerAddress } from "@/lib/genlayer";
import { titleCase } from "@/lib/format";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How VoteGuard scores a DAO proposal: the five dimensions, the parser bounds, the quote gate, the consensus rule, and how to integrate the oracle.",
};

export const revalidate = 300;

const DIMENSION_NOTES: Record<string, string> = {
  feasibility:
    "Can this be implemented as written? A parameter change or a ratification is trivial by construction; an outcome with no mechanism behind it is not.",
  budget_risk:
    "Is the requested amount reasonable for what it buys? Only scored when the proposal actually asks for money — a proposal that requests nothing is CONSERVATIVE by construction and no model output can move it.",
  centralization_risk:
    "Does this concentrate power? Authority to a council with a stated term and a revocation path is a different finding from discretionary control of a treasury.",
  clarity:
    "Can a voter tell exactly what they are approving? Placeholders, missing amounts and undefined terms are the failure mode.",
  alignment:
    "Does it serve the DAO's stated purpose? The one dimension a parser has almost nothing to say about, which is why it is weighted 15% and why the parser abstains towards NEUTRAL rather than guessing.",
};

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 scroll-mt-24 font-display text-2xl tracking-tight text-white first:mt-0"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15px] leading-relaxed text-ink-300">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-ink-700/50 bg-ink-950/60 px-4 py-3.5 font-mono text-[12px] leading-relaxed text-ink-200">
      {children}
    </pre>
  );
}

export default async function DocsPage() {
  const config = await getConfig();
  const dims = config?.dimensions ?? [];
  const thresholds = config?.verdict_thresholds ?? {};
  const limits = config?.limits ?? {};

  const TOC = [
    ["what-it-does", "What it does"],
    ["reading", "Reading a proposal"],
    ["rubric", "The five dimensions"],
    ["bounds", "How the model is fenced"],
    ["verdict", "How the verdict is derived"],
    ["consensus", "What the validators agree on"],
    ["platforms", "Supported platforms"],
    ["integrate", "Integration guide"],
    ["limits", "What it does not do"],
  ] as const;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_200px]">
      <article className="min-w-0 max-w-3xl">
        <header className="mb-10">
          <div className="label mb-2">Methodology</div>
          <h1 className="font-display text-4xl tracking-tight text-white">
            How VoteGuard scores a proposal
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-300">
            Every number below is a module constant in a deployed contract, not
            a setting. No owner can move a weight, a threshold or a bucket
            boundary — the only way to change the rubric is to deploy a
            different contract with a different version string.
          </p>
        </header>

        <H2 id="what-it-does">What it does</H2>
        <P>
          You give VoteGuard the URL of a governance proposal. Five GenLayer
          validators each fetch that proposal independently, apply one fixed
          rubric, and agree on an assessment across five dimensions. The result
          goes on chain with the evidence it was derived from, so anybody can
          replay the arithmetic — and any contract can check the verdict before
          it executes.
        </P>

        <H2 id="reading">Reading a proposal</H2>
        <P>
          The submitted URL is <strong className="text-ink-100">never fetched</strong>.
          That is not a shortcut; it is the first thing the project measured.
          A plain GET of{" "}
          <code className="font-mono text-[13px] text-ink-200">
            snapshot.org/#/&lt;space&gt;/proposal/&lt;0x…&gt;
          </code>{" "}
          returns HTTP 200 and a 1,363-byte application shell — the same 1,363
          bytes for every proposal that has ever existed, because everything
          after the <code className="font-mono">#</code> never leaves the
          browser. A contract that fetched what the user pasted would score an
          empty page, report success, and be wrong about every proposal
          identically.
        </P>
        <P>
          So every URL is parsed into a platform and an identifier, and the
          identifier builds a request against a document endpoint that actually
          carries the proposal. The identifier is also the canonical key: two
          URLs that name the same proposal produce the same record, and a
          Discourse slug — which Discourse itself ignores — never reaches the
          key, the fetch URL or the content hash.
        </P>
        <P>
          Vote counts, quorum progress and proposal state are excluded from the
          request the validators make, not merely ignored afterwards. An
          assessment that changed because somebody voted would not be a risk
          assessment.
        </P>

        <H2 id="rubric">The five dimensions</H2>
        <P>
          Each dimension lands on one of four rungs, and each rung owns a band
          of the 0–100 score. The rung decides the band; the parsed evidence
          positions the dimension inside it. Nothing can drag a dimension out of
          the rung the reading put it in.
        </P>
        <div className="mt-6 space-y-5">
          {(dims.length
            ? dims
            : [
                { key: "feasibility", weight: 25, buckets: ["TRIVIAL", "STRAIGHTFORWARD", "COMPLEX", "IMPRACTICAL"] },
                { key: "budget_risk", weight: 25, buckets: ["CONSERVATIVE", "REASONABLE", "AGGRESSIVE", "EXCESSIVE"] },
                { key: "centralization_risk", weight: 20, buckets: ["DISTRIBUTED", "MODERATE", "CONCENTRATED", "DANGEROUS"] },
                { key: "clarity", weight: 15, buckets: ["CLEAR", "ADEQUATE", "VAGUE", "AMBIGUOUS"] },
                { key: "alignment", weight: 15, buckets: ["ALIGNED", "NEUTRAL", "QUESTIONABLE", "MISALIGNED"] },
              ]
          ).map((d) => (
            <div key={d.key} className="card rounded-lg p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg text-ink-100">
                  {titleCase(d.key)}
                </h3>
                <span className="label">{d.weight}% of the score</span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-400">
                {DIMENSION_NOTES[d.key]}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.buckets.map((b, i) => (
                  <span
                    key={b}
                    className="rounded border px-2 py-0.5 font-mono text-[11px]"
                    style={{
                      borderColor: `color-mix(in oklab, ${["var(--color-verdict-good)", "var(--color-verdict-good)", "var(--color-verdict-warn)", "var(--color-verdict-bad)"][i]} 40%, transparent)`,
                      color: ["var(--color-verdict-good)", "var(--color-verdict-good)", "var(--color-verdict-warn)", "var(--color-verdict-bad)"][i],
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <H2 id="bounds">How the model is fenced</H2>
        <P>
          Eighteen features are parsed from the proposal text by ordinary code —
          length, section headers, the largest requested amount and its unit,
          whether payment is tranched, whether there is a clawback clause,
          whether a multisig or council is named, whether anyone gets sole
          discretion, whether there is a revocation path, whether voting
          parameters are touched, whether placeholders remain. Those eighteen
          are computed from a proposal body that is signed and pinned, so two
          validators reach the same number with certainty rather than with
          probability.
        </P>
        <P>
          The model contributes five: one ladder level per dimension. It is
          fenced three ways, and each fence is checkable by a machine:
        </P>
        <ol className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-300">
          <li className="flex gap-3">
            <span className="font-display text-royal-400">1.</span>
            <span>
              It picks a <strong className="text-ink-100">ladder level</strong>,
              not a score, and every level is an explicit condition rather than
              an adjective. Asking five models for an opinion produces five
              different numbers; asking them to match a written condition
              produces a classifier.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-royal-400">2.</span>
            <span>
              Every level arrives with a{" "}
              <strong className="text-ink-100">verbatim quote</strong>, and
              every validator checks that at least 28 consecutive characters of
              it really occur in the proposal it fetched. A level whose evidence
              is not in the text is discarded, so a model that invents a
              justification cannot move a score at all.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-royal-400">3.</span>
            <span>
              The level is <strong className="text-ink-100">clamped</strong>{" "}
              into a floor and a ceiling the parser computed independently.
              Where the evidence is decisive the two collapse onto one number
              and the model has no influence whatsoever.
            </span>
          </li>
        </ol>

        <H2 id="verdict">How the verdict is derived</H2>
        <P>
          Deterministically, from the five dimensions — never asked of a model.
          The weighted average sets a baseline, and then three overrides apply,
          because a proposal can carry a respectable average and still be one
          nobody should execute.
        </P>
        <div className="card mt-5 rounded-lg p-5">
          <dl className="space-y-3 text-[14px]">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-300">
                Score ≥ {thresholds.RECOMMEND ?? 70}
              </dt>
              <dd className="font-semibold text-[color:var(--color-verdict-good)]">
                RECOMMEND
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-300">
                Score ≥ {thresholds.CAUTION ?? 45}
              </dt>
              <dd className="font-semibold text-[color:var(--color-verdict-warn)]">
                CAUTION
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-300">Below that</dt>
              <dd className="font-semibold text-[color:var(--color-verdict-bad)]">
                OPPOSE
              </dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2 border-t border-ink-700/50 pt-4 text-[13px] leading-relaxed text-ink-400">
            {(config?.verdict_overrides ?? [
              "2+ dimensions at worst rung -> OPPOSE",
              "any dimension at worst rung, or 3+ model abstentions -> never RECOMMEND",
            ]).map((o) => (
              <li key={o} className="flex gap-2">
                <span className="text-royal-400">→</span>
                <span className="font-mono">{o}</span>
              </li>
            ))}
          </ul>
        </div>

        <H2 id="consensus">What the validators agree on</H2>
        <P>
          On the eighteen parsed fields it is exact equality with no tolerance
          at all. Two nodes reaching different numbers there means one of them
          read a different document, and that must never settle.
        </P>
        <P>
          On the five model fields it is three independent checks: the quote
          verifies verbatim against the text this node fetched, the level sits
          inside the bounds this node computed, and the level is within one rung
          of this node&rsquo;s own reading. The one-rung tolerance is real and is
          stated plainly — two accepted readings of one proposal can differ by a
          rung on a dimension. Analyse the same proposal twice and the
          difference is visible on its page, bounded and recomputable rather
          than silent.
        </P>
        <P>
          That tolerance is not a shortcut. Five validators asked for five free
          ordinals disagreed on <em>every single round</em> the project measured
          — sixteen consecutive undetermined transactions. Narrowing the axis to
          something the nodes can actually verify is what makes an on-chain
          model oracle settle at all.
        </P>

        <H2 id="platforms">Supported platforms</H2>
        <div className="mt-5 space-y-4">
          {[
            ["Snapshot", "snapshot.org and snapshot.box", "Read through hub.snapshot.org. The proposal body is signed and pinned to IPFS, and the CID is stored beside the assessment."],
            ["Tally", "tally.xyz/gov/<org>/proposal/<n>", "Read from the page's own server-rendered payload. Tally's API requires a key, which a contract cannot hold."],
            ["Discourse", "any DAO forum running Discourse", "The topic id is the identity; the slug is decoration and is discarded. Covers Aave, Arbitrum, Uniswap, Optimism, ENS, Lido, Balancer, Gitcoin and every other Discourse forum."],
          ].map(([name, shape, note]) => (
            <div key={name} className="card rounded-lg p-5">
              <h3 className="font-display text-lg text-ink-100">{name}</h3>
              <code className="mt-1 block font-mono text-[12px] text-ink-400">
                {shape}
              </code>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-400">{note}</p>
            </div>
          ))}
        </div>

        <H2 id="integrate">Integration guide</H2>
        <P>
          VoteGuard is built to be read by other contracts, not only by people.
          There are two primitives, and the difference between them matters.
        </P>
        <P>
          <code className="font-mono text-[13px] text-ink-100">is_recommended(id)</code>{" "}
          is the soft gate — it returns a boolean, and an unanalysed proposal is
          <em> not</em> recommended. Absence of evidence is not evidence of
          safety, and a treasury that treated it as such would execute anything
          by simply never asking.
        </P>
        <P>
          <code className="font-mono text-[13px] text-ink-100">
            require_recommended(id)
          </code>{" "}
          is the hard gate — it <strong className="text-ink-100">reverts</strong>{" "}
          unless the verdict is RECOMMEND. A calling contract does not have to
          remember to check a boolean, because the whole transaction fails.
        </P>
        <Code>{`# read the verdict before executing
genlayer call ${VOTEGUARD || "<VOTEGUARD>"} \\
  get_risk_summary --args "https://snapshot.org/#/<space>/proposal/<0x…>"

# or let your own transaction fail
genlayer call ${VOTEGUARD || "<VOTEGUARD>"} \\
  require_recommended --args <assessment_id>`}</Code>
        <P>
          The reference integration is{" "}
          <strong className="text-ink-100">GovernanceConsumer</strong>: a DAO
          treasury that queues payouts against a proposal URL and will only
          release them if VoteGuard recommends it. Its oracle address is pinned
          at construction with no setter, and every payout snapshots the verdict
          mode, score floor and staleness window it was queued under — so moving
          the defaults can never reach money already promised.
        </P>
        {CONSUMER ? (
          <Code>{`# the treasury refuses to pay on a proposal it did not like
genlayer call ${CONSUMER} \\
  preflight --args "https://snapshot.org/#/<space>/proposal/<0x…>"`}</Code>
        ) : null}

        <H2 id="limits">What it does not do</H2>
        <P>
          <strong className="text-ink-100">It does not price tokens.</strong>{" "}
          The amount it reads is the largest stated quantity near a funding
          word, reported with its unit — “1M–10M ARB”, not a dollar value.
          Converting tokens to a common unit needs a price, and a price is
          exactly the kind of field that moves between two fetches seconds
          apart; a price oracle inside a consensus round would make every
          token-denominated proposal unsettleable for a reason that has nothing
          to do with the proposal.
        </P>
        <P>
          <strong className="text-ink-100">
            It does not read discussion, votes or history.
          </strong>{" "}
          One proposal document, judged on its own terms.
        </P>
        <P>
          <strong className="text-ink-100">It is not advice.</strong> It is a
          structured second opinion with its reasoning attached. Read the
          proposal.
        </P>

        <div className="card mt-14 rounded-lg p-5">
          <div className="label mb-3">Deployment</div>
          <dl className="space-y-2 text-[13px]">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-500">Network</dt>
              <dd className="font-mono capitalize text-ink-200">{NETWORK}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-500">VoteGuard</dt>
              <dd>
                <a
                  href={explorerAddress(VOTEGUARD)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-ink-200 hover:text-royal-300"
                >
                  {VOTEGUARD || "—"}
                </a>
              </dd>
            </div>
            {CONSUMER ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-500">GovernanceConsumer</dt>
                <dd>
                  <a
                    href={explorerAddress(CONSUMER)}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-ink-200 hover:text-royal-300"
                  >
                    {CONSUMER}
                  </a>
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-500">Rubric</dt>
              <dd className="font-mono text-ink-200">
                {config?.rubric_version ?? "1.0.0"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-500">Per-proposal cooldown</dt>
              <dd className="font-mono text-ink-200">
                {Number(limits.proposal_cooldown_seconds ?? 900) / 60} min
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
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
      </article>

      <nav className="hidden lg:block">
        <div className="sticky top-24">
          <div className="label mb-3">On this page</div>
          <ul className="space-y-2 text-[13px]">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-ink-400 hover:text-royal-300">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
