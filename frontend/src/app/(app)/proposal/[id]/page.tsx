import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ConfidenceTag,
  DimensionBar,
  Empty,
  FlagList,
  PlatformTag,
  VerdictBadge,
} from "@/components/ui";
import { EvidencePanel } from "@/components/EvidencePanel";
import { getAssessment, getHistory, verifyAssessment } from "@/lib/contract";
import { explorerAddress } from "@/lib/genlayer";
import { VOTEGUARD } from "@/lib/genlayer";
import { ago, shortAddress, titleCase, whenUtc } from "@/lib/format";

export const revalidate = 60;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const a = await getAssessment(Number(id));
  if (!a?.found) return { title: `Assessment #${id}` };
  return {
    title: `${a.title} — ${a.verdict}`,
    description: `VoteGuard scored this ${a.dao} proposal ${a.overall_score}/100 (${a.verdict}).`,
  };
}

export default async function ProposalPage({ params }: Params) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric < 1) notFound();

  const a = await getAssessment(numeric);
  if (!a) {
    return (
      <Empty title="The oracle is unreachable">
        This page reads the contract directly. Try again in a moment.
      </Empty>
    );
  }
  if (!a.found) {
    return (
      <Empty title={`No assessment #${numeric}`}>
        {a.reason ?? "That id has never been issued."}{" "}
        <Link href="/proposals" className="font-semibold text-royal-300 hover:text-royal-200">
          Browse what has been assessed →
        </Link>
      </Empty>
    );
  }

  const [verified, history] = await Promise.all([
    verifyAssessment(numeric),
    getAssessment(numeric).then((x) =>
      x?.found ? getHistory(x.source_url, 6) : null,
    ),
  ]);

  const others = (history?.assessments ?? []).filter(
    (h) => h.assessment_id !== numeric,
  );

  return (
    <>
      <nav className="mb-6 text-sm text-ink-400">
        <Link href="/proposals" className="hover:text-ink-200">
          Proposals
        </Link>
        <span className="mx-2 text-ink-600">/</span>
        <Link
          href={`/dao/${encodeURIComponent(a.dao_id)}`}
          className="hover:text-ink-200"
        >
          {a.dao || a.dao_id}
        </Link>
        <span className="mx-2 text-ink-600">/</span>
        <span className="text-ink-500">#{a.assessment_id}</span>
      </nav>

      {/* ── headline ────────────────────────────────────────────────────── */}
      <header className="card rounded-xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/dao/${encodeURIComponent(a.dao_id)}`}
                className="label transition-colors hover:text-royal-300"
              >
                {a.dao || a.dao_id}
              </Link>
              <PlatformTag platform={a.platform} />
              <ConfidenceTag confidence={a.confidence} />
            </div>
            <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight text-white">
              {a.title}
            </h1>
            {!a.dao_name_matches && a.submitted_dao ? (
              <p className="mt-3 rounded-md border border-[color-mix(in_oklab,var(--color-verdict-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-warn)_10%,transparent)] px-3 py-2 text-[13px] text-[color:var(--color-verdict-warn)]">
                Submitted as “{a.submitted_dao}”, but the proposal document says{" "}
                <strong className="font-semibold">{a.dao || a.dao_id}</strong>.
                The document wins; the label is recorded, never believed.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <VerdictBadge verdict={a.verdict} size="lg" />
            <div className="text-right">
              <div className="tabular font-display text-5xl leading-none text-white">
                {a.overall_score}
              </div>
              <div className="label mt-1">of 100</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-ink-700/50 pt-5">
          <a
            href={a.source_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-ink-600/60 px-4 py-2 text-sm font-semibold text-ink-200 transition-colors hover:border-royal-400/60 hover:text-white"
          >
            Read the original proposal ↗
          </a>
          <a
            href={explorerAddress(VOTEGUARD)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-ink-600/60 px-4 py-2 text-sm font-semibold text-ink-200 transition-colors hover:border-royal-400/60 hover:text-white"
          >
            View the contract ↗
          </a>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-8">
          {/* ── dimensions ────────────────────────────────────────────── */}
          <section className="card rounded-xl p-6">
            <h2 className="font-display text-xl text-ink-100">
              The five dimensions
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
              Each score is a pure function of the agreed feature vector. The
              quote beneath a dimension is the fragment the model copied out of
              the proposal, checked verbatim by every validator against its own
              copy of the text.
            </p>
            <div className="mt-4">
              {a.dimensions.map((d) => (
                <DimensionBar
                  key={d.key}
                  name={titleCase(d.key)}
                  label={d.label}
                  score={d.score}
                  weight={d.weight}
                  evidence={d.evidence}
                />
              ))}
            </div>
          </section>

          {/* ── excerpt ───────────────────────────────────────────────── */}
          <section className="card rounded-xl p-6">
            <h2 className="font-display text-xl text-ink-100">
              What the validators read
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-400">
              The opening of the proposal as it was fetched, defanged and
              stored. Author:{" "}
              <span className="font-mono text-ink-300">
                {a.author ? shortAddress(a.author) : "—"}
              </span>
            </p>
            <blockquote className="mt-4 border-l-2 border-royal-500/40 pl-4 text-sm leading-relaxed text-ink-300">
              {a.excerpt}
              <span className="text-ink-500">…</span>
            </blockquote>
          </section>

          {/* ── history ───────────────────────────────────────────────── */}
          {others.length ? (
            <section className="card rounded-xl p-6">
              <h2 className="font-display text-xl text-ink-100">
                Earlier readings of this proposal
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
                Two accepted readings of one proposal can differ by a single
                rung on a dimension — the consensus rule allows exactly that
                much, and this is where it becomes visible rather than merely
                documented.
              </p>
              <ul className="mt-4 divide-y divide-ink-700/50">
                {others.map((h) => (
                  <li key={h.assessment_id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <Link
                        href={`/proposal/${h.assessment_id}`}
                        className="font-display text-[15px] text-ink-200 hover:text-white"
                      >
                        Reading #{h.seq}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {whenUtc(h.analyzed_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular font-display text-xl text-ink-200">
                        {h.overall_score}
                      </span>
                      <VerdictBadge verdict={h.verdict} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* ── sidebar ─────────────────────────────────────────────────── */}
        <aside className="space-y-6">
          <EvidencePanel
            assessmentId={a.assessment_id}
            evidence={a.evidence}
            contentHash={a.content_hash}
            verified={verified?.verified ?? null}
            differences={verified?.differences ?? []}
          />

          {a.flags.length ? (
            <section className="card rounded-lg p-5">
              <h2 className="font-display text-lg text-ink-100">Findings</h2>
              <p className="mt-1 text-[13px] text-ink-400">
                Every one is a pure function of the vector beside it.
              </p>
              <div className="mt-3">
                <FlagList flags={a.flags} />
              </div>
            </section>
          ) : null}

          <section className="card rounded-lg p-5">
            <h2 className="font-display text-lg text-ink-100">Record</h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {[
                ["Assessment", `#${a.assessment_id} · reading ${a.seq}`],
                ["Analysed", `${whenUtc(a.analyzed_at)} (${ago(a.age_seconds)})`],
                ["Rubric", a.rubric_version],
                ["Submitted by", shortAddress(a.analyst)],
                ["Length band", a.bands?.length ?? "—"],
                [
                  "Largest amount",
                  a.bands?.largest_amount === "none"
                    ? "no funds requested"
                    : `${a.bands?.largest_amount ?? "—"}${a.bands?.amount_unit ? ` ${a.bands.amount_unit}` : ""}`,
                ],
                ["Source anchor", a.anchor || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-500">{k}</dt>
                  <dd className="truncate text-right font-mono text-[12px] text-ink-200" title={String(v)}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card rounded-lg p-5">
            <h2 className="font-display text-lg text-ink-100">
              Check it yourself
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
              Anyone can replay the arithmetic against the stored evidence:
            </p>
            <pre className="mt-3 overflow-x-auto rounded bg-ink-900/70 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink-200">
{`genlayer call ${VOTEGUARD.slice(0, 10)}… \\
  verify_assessment --args ${a.assessment_id}`}
            </pre>
          </section>
        </aside>
      </div>
    </>
  );
}
