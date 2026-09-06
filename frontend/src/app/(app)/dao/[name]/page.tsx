import type { Metadata } from "next";
import Link from "next/link";
import { Empty, FlagList, PlatformTag, Stat, VerdictBadge } from "@/components/ui";
import { getDao } from "@/lib/contract";
import { ago, scoreHue, titleCase, whenUtc } from "@/lib/format";

export const revalidate = 60;

type Params = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  const dao = decodeURIComponent(name);
  return {
    title: `${dao} — governance risk profile`,
    description: `Every proposal VoteGuard has assessed for ${dao}, with averages and risk trend.`,
  };
}

export default async function DaoPage({ params }: Params) {
  const { name } = await params;
  const query = decodeURIComponent(name);
  const dao = await getDao(query, 50);

  if (!dao) {
    return (
      <Empty title="The oracle is unreachable">
        This page reads the contract directly. Try again in a moment.
      </Empty>
    );
  }
  if (!dao.found) {
    return (
      <Empty title={`Nothing assessed for “${query}”`}>
        {dao.reason ?? "No proposals have been analysed for that DAO yet."}{" "}
        <Link href="/analyze" className="font-semibold text-royal-300 hover:text-royal-200">
          Analyse one →
        </Link>
      </Empty>
    );
  }

  const rows = dao.assessments ?? [];
  const verdicts = dao.verdicts ?? {};
  const total = Object.values(verdicts).reduce((a, b) => a + Number(b), 0) || 1;
  const avg = dao.average_scores ?? {};

  // The trend, oldest first, so a rising line reads as improving.
  const trend = [...rows]
    .sort((a, b) => a.analyzed_at - b.analyzed_at)
    .map((r) => ({ id: r.assessment_id, score: r.overall_score, verdict: r.verdict }));

  return (
    <>
      <nav className="mb-6 text-sm text-ink-400">
        <Link href="/proposals" className="hover:text-ink-200">
          Proposals
        </Link>
        <span className="mx-2 text-ink-600">/</span>
        <span className="text-ink-500">{dao.dao}</span>
      </nav>

      <header className="mb-8">
        <div className="label mb-2">DAO profile</div>
        <h1 className="font-display text-4xl tracking-tight text-white">{dao.dao}</h1>
        <p className="mt-2 font-mono text-sm text-ink-400">{dao.dao_id}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Proposals" value={dao.proposals_tracked} sub={`${dao.total_analyses} analyses`} />
        <Stat
          label="Average score"
          value={<span style={{ color: scoreHue(Number(avg.overall ?? 0)) }}>{avg.overall ?? 0}</span>}
          sub="across every assessment"
        />
        <Stat
          label="Recommended"
          value={Number(verdicts.RECOMMEND ?? 0)}
          sub={`${Math.round((Number(verdicts.RECOMMEND ?? 0) / total) * 100)}% of assessments`}
        />
        <Stat label="Last assessed" value={dao.last_analyzed ? ago(dao.last_analyzed_age ?? 0) : "—"} sub={whenUtc(dao.last_analyzed)} />
      </div>

      {/* ── averages by dimension ─────────────────────────────────────── */}
      <section className="card mt-8 rounded-xl p-6">
        <h2 className="font-display text-xl text-ink-100">Average by dimension</h2>
        <p className="mt-1.5 text-[13px] text-ink-400">
          Where this DAO&rsquo;s proposals are consistently strong, and where they are not.
        </p>
        <div className="mt-5 space-y-4">
          {["feasibility", "budget_risk", "centralization_risk", "clarity", "alignment"].map((k) => {
            const v = Number(avg[k] ?? 0);
            return (
              <div key={k}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-ink-200">{titleCase(k)}</span>
                  <span className="tabular font-display text-lg text-ink-100">{v}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, v)}%`, background: scoreHue(v) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── trend ─────────────────────────────────────────────────────── */}
      {trend.length > 1 ? (
        <section className="card mt-8 rounded-xl p-6">
          <h2 className="font-display text-xl text-ink-100">Risk trend</h2>
          <p className="mt-1.5 text-[13px] text-ink-400">
            Overall score by assessment, oldest first.
          </p>
          <div className="mt-6 flex h-32 items-end gap-1.5">
            {trend.map((t) => (
              <Link
                key={t.id}
                href={`/proposal/${t.id}`}
                className="group relative flex-1 rounded-t transition-opacity hover:opacity-80"
                style={{
                  height: `${Math.max(6, t.score)}%`,
                  background: scoreHue(t.score),
                }}
                title={`#${t.id} — ${t.score}/100 (${t.verdict})`}
              >
                <span className="sr-only">
                  Assessment {t.id}: {t.score} of 100, {t.verdict}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-500">
            <span>oldest</span>
            <span>newest</span>
          </div>
        </section>
      ) : null}

      {/* ── proposals ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 font-display text-xl text-ink-100">
          Assessed proposals
        </h2>
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.assessment_id}>
              <Link href={`/proposal/${a.assessment_id}`} className="card card-hover block rounded-lg p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <PlatformTag platform={a.platform} />
                    <h3 className="mt-1.5 font-display text-[18px] leading-snug text-ink-100">
                      {a.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-xs text-ink-500">
                        #{a.assessment_id} · {ago(a.age_seconds)}
                      </span>
                      <FlagList flags={a.flags ?? []} max={3} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="tabular font-display text-2xl text-ink-100">
                      {a.overall_score}
                    </span>
                    <VerdictBadge verdict={a.verdict} size="sm" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
