/**
 * Every read the site makes, in one file, with one cache policy.
 *
 * `unstable_cache` rather than `fetch` caching, because genlayer-js does not go
 * through `fetch` in a way Next can key on. Sixty seconds is chosen against the
 * contract's own 900-second per-proposal cooldown: nothing can change faster
 * than that, so a shorter window would only add RPC traffic.
 *
 * EVERY READ FAILS SOFT. A dead RPC must render an empty state, not a 500 —
 * the pages are the public face of an oracle, and "the explorer is having a bad
 * afternoon" is not the same claim as "there are no assessments".
 */
import { unstable_cache } from "next/cache";
import { reader, VOTEGUARD, CONSUMER, configured } from "./genlayer";
import type {
  Assessment,
  Config,
  DaoView,
  Preview,
  ProposalRow,
  Stats,
} from "./types";

type Args = (string | number | boolean)[];

async function read<T>(functionName: string, args: Args, fallback: T): Promise<T> {
  if (!configured) return fallback;
  try {
    const out = await reader().readContract({
      address: VOTEGUARD,
      functionName,
      args,
    });
    return (out ?? fallback) as T;
  } catch (err) {
    console.error(`[voteguard] ${functionName} failed:`, String(err).slice(0, 200));
    return fallback;
  }
}

const cached = <A extends Args, T>(
  key: string,
  fn: (...a: A) => Promise<T>,
  revalidate = 60,
) => unstable_cache(fn as (...a: unknown[]) => Promise<T>, [key], { revalidate, tags: [key] }) as (...a: A) => Promise<T>;

export const getStats = cached("stats", () =>
  read<Stats | null>("get_stats", [], null),
);

export const getConfig = cached(
  "config",
  () => read<Config | null>("get_config", [], null),
  300,
);

export const getRecent = cached("recent", async (count: number) => {
  const out = await read<{ assessments?: Assessment[] } | null>(
    "get_recent_assessments",
    [count],
    null,
  );
  return out?.assessments ?? [];
});

/**
 * Rows arrive with their AGE already computed.
 *
 * The clock is read here, where the data is fetched, and not in a component.
 * Calling Date.now() during render makes the output depend on when React
 * happened to re-run — which is both a lint error and, on a page that
 * revalidates, a real source of hydration drift.
 */
export const getProposals = cached("proposals", async (offset: number, count: number) => {
  const out = await read<{ proposals?: ProposalRow[]; total?: number } | null>(
    "get_proposals",
    [offset, count],
    null,
  );
  const now = Math.floor(Date.now() / 1000);
  const rows = (out?.proposals ?? []).map((r) => ({
    ...r,
    age_seconds: Math.max(0, now - Number(r.analyzed_at ?? now)),
  }));
  return { rows, total: Number(out?.total ?? 0), now };
});

export const getAssessment = cached("assessment", (id: number) =>
  read<Assessment | null>("get_assessment", [id], null),
);

export const getAssessmentByUrl = cached("assessment-url", (url: string) =>
  read<Assessment | null>("get_assessment_by_url", [url], null),
);

export const getHistory = cached("history", (url: string, count: number) =>
  read<{
    found: boolean;
    total_analyses?: number;
    assessments?: {
      assessment_id: number;
      seq: number;
      overall_score: number;
      verdict: string;
      labels: string[];
      content_hash: string;
      analyzed_at: number;
    }[];
  } | null>("get_assessment_history", [url, count], null),
);

export const getDao = cached("dao", async (name: string, count: number) => {
  const out = await read<DaoView | null>("get_assessments_by_dao", [name, count], null);
  if (!out) return null;
  const now = Math.floor(Date.now() / 1000);
  return {
    ...out,
    last_analyzed_age: out.last_analyzed
      ? Math.max(0, now - Number(out.last_analyzed))
      : 0,
  };
});

export const verifyAssessment = cached("verify", (id: number) =>
  read<{
    verified: boolean;
    differences?: string[];
    recomputed?: Record<string, unknown>;
    evidence?: string;
  } | null>("verify_assessment", [id], null),
);

/** Not cached: the analyse page previews a URL the visitor just typed. */
export async function previewUrl(url: string): Promise<Preview> {
  return read<Preview>("preview_url", [url], {
    ok: false,
    reason: "the oracle is unreachable right now",
  });
}

export async function getConsumerTerms() {
  if (!CONSUMER) return null;
  try {
    return (await reader().readContract({
      address: CONSUMER,
      functionName: "get_terms",
      args: [],
    })) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The DAO index, derived from the proposal page rather than from a view of its
 * own. The contract deliberately does not carry a second list of DAOs — every
 * proposal row already names one, and a second copy in storage could only ever
 * disagree with the first.
 */
export const getDaoIndex = cached("dao-index", async () => {
  const { rows } = await getProposals(0, 100);
  const byId = new Map<
    string,
    { dao_id: string; dao: string; count: number; total: number; verdicts: Record<string, number> }
  >();
  for (const r of rows) {
    const entry =
      byId.get(r.dao_id) ??
      { dao_id: r.dao_id, dao: r.dao || r.dao_id, count: 0, total: 0, verdicts: {} };
    entry.count += 1;
    entry.total += Number(r.overall_score ?? 0);
    entry.verdicts[r.verdict] = (entry.verdicts[r.verdict] ?? 0) + 1;
    byId.set(r.dao_id, entry);
  }
  return [...byId.values()]
    .map((d) => ({ ...d, average: d.count ? Math.round(d.total / d.count) : 0 }))
    .sort((a, b) => b.count - a.count || a.dao_id.localeCompare(b.dao_id));
});
