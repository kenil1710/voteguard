"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProposalRow } from "@/lib/types";
import { ago, PLATFORM_LABEL, verdictStyle } from "@/lib/format";
import { FlagList, PlatformTag, VerdictBadge } from "./ui";

type Sort = "recent" | "riskiest" | "safest";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Newest" },
  { key: "riskiest", label: "Riskiest" },
  { key: "safest", label: "Highest scoring" },
];

/**
 * Filtering and sorting happen HERE, not in the contract.
 *
 * The contract deliberately carries no leaderboard: get_proposals already
 * returns every tracked proposal with its score, verdict, flags and DAO, so a
 * second ordered copy in storage could only ever go stale or disagree. It also
 * buys the reader more than a fixed top-K would — filtering by flag is
 * something a stored leaderboard could never have offered.
 */
export function ProposalBrowser({ rows }: { rows: ProposalRow[] }) {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<string>("ALL");
  const [platform, setPlatform] = useState<string>("ALL");
  const [dao, setDao] = useState<string>("ALL");
  const [sort, setSort] = useState<Sort>("recent");

  const daos = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) set.set(r.dao_id, r.dao || r.dao_id);
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (verdict !== "ALL" && r.verdict !== verdict) return false;
      if (platform !== "ALL" && r.platform !== platform) return false;
      if (dao !== "ALL" && r.dao_id !== dao) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.dao ?? "").toLowerCase().includes(q) ||
        (r.dao_id ?? "").toLowerCase().includes(q) ||
        (r.flags ?? []).some((f) => f.toLowerCase().includes(q.replace(/ /g, "_")))
      );
    });
    out.sort((a, b) => {
      if (sort === "riskiest") return a.overall_score - b.overall_score;
      if (sort === "safest") return b.overall_score - a.overall_score;
      return b.analyzed_at - a.analyzed_at;
    });
    return out;
  }, [rows, query, verdict, platform, dao, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { RECOMMEND: 0, CAUTION: 0, OPPOSE: 0 };
    for (const r of rows) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
    return c;
  }, [rows]);

  const selectClass =
    "rounded-md border border-ink-600/60 bg-ink-900/80 px-3 py-2 text-sm text-ink-200 focus:border-royal-400";

  return (
    <>
      <div className="card mb-6 rounded-lg p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,1fr)]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, DAO or finding…"
            aria-label="Search proposals"
            className="rounded-md border border-ink-600/60 bg-ink-900/80 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-royal-400"
          />
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            aria-label="Filter by verdict"
            className={selectClass}
          >
            <option value="ALL">All verdicts</option>
            {(["RECOMMEND", "CAUTION", "OPPOSE"] as const).map((v) => (
              <option key={v} value={v}>
                {verdictStyle(v).label} ({counts[v] ?? 0})
              </option>
            ))}
          </select>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label="Filter by platform"
            className={selectClass}
          >
            <option value="ALL">All platforms</option>
            {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={dao}
            onChange={(e) => setDao(e.target.value)}
            aria-label="Filter by DAO"
            className={selectClass}
          >
            <option value="ALL">All DAOs</option>
            {daos.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort"
            className={selectClass}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mb-4 text-sm text-ink-400">
        {filtered.length} of {rows.length} shown
      </p>

      {filtered.length === 0 ? (
        <div className="card rounded-lg px-6 py-12 text-center">
          <p className="text-sm text-ink-400">
            Nothing matches those filters.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li key={r.assessment_id}>
              <Link
                href={`/proposal/${r.assessment_id}`}
                className="card card-hover block rounded-lg p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dao/${encodeURIComponent(r.dao_id)}`}
                        className="label transition-colors hover:text-royal-300"
                      >
                        {r.dao || r.dao_id}
                      </Link>
                      <PlatformTag platform={r.platform} />
                    </div>
                    <h2 className="mt-1.5 font-display text-[19px] leading-snug text-ink-100">
                      {r.title}
                    </h2>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-xs text-ink-500">
                        #{r.assessment_id} · {ago(r.age_seconds ?? 0)}
                      </span>
                      <FlagList flags={r.flags ?? []} max={4} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <div className="tabular font-display text-3xl leading-none text-ink-100">
                        {r.overall_score}
                      </div>
                      <div className="label mt-1">of 100</div>
                    </div>
                    <VerdictBadge verdict={r.verdict} />
                  </div>
                </div>
                {r.labels?.length ? (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700/40 pt-3 text-[11px] uppercase tracking-wider text-ink-500">
                    {r.labels.map((l, i) => (
                      <span key={`${l}-${i}`}>{l}</span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
