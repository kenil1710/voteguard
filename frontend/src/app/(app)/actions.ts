"use server";

import { revalidateTag } from "next/cache";
import { getAssessmentByUrlFresh } from "@/lib/contract";

/**
 * Read-your-own-writes after a submission.
 *
 * Every contract read is wrapped in `unstable_cache` with a 60-second window
 * and one tag per key (see lib/contract.ts). `router.refresh()` alone clears
 * only the CLIENT cache — the server would keep serving the pre-submission
 * snapshot for up to a minute, so somebody who had just paid for an assessment
 * would land on a proposal list that did not contain it and reasonably conclude
 * the transaction had failed.
 *
 * `{ expire: 0 }` rather than a profile: this is the case the Next docs name
 * for it — the caller needs the data gone immediately, and `updateTag` is the
 * newer read-your-own-writes API but is scoped to the `use cache` directive
 * rather than to `unstable_cache` tags.
 *
 * `assessment` and `verify` are keyed per id and an earlier version of this
 * list left them out, reasoning that a brand-new id could not already be
 * cached. That was wrong, and it is how /proposal/4 kept reporting "No
 * assessment #4" after the record existed: `read()` FAILS SOFT to null, so
 * somebody who opens an id before it is minted caches the NOT-FOUND answer
 * under those tags. Guessing the next id and looking it up is exactly what a
 * person does while waiting for their own submission to land.
 */
const STALE_AFTER_ANALYSIS = [
  "stats",
  "recent",
  "proposals",
  "assessment",
  "assessment-url",
  "verify",
  "history",
  "dao",
  "dao-index",
];

export async function refreshAfterAnalysis(): Promise<void> {
  for (const tag of STALE_AFTER_ANALYSIS) revalidateTag(tag, { expire: 0 });
}

export type Confirmation = {
  assessmentId: number | null;
  analyzedAt: number | null;
  verdict: string | null;
  title: string | null;
};

/**
 * Ask the CONTRACT whether a submission actually stored anything.
 *
 * This exists because a settled receipt is not an answer. Bradbury does not
 * return a readable `consensus_data` payload, so "the contract said REJECTED"
 * and "the contract's reply could not be read" arrive as the same thing — and
 * a caller that treats the second as success reports an assessment that was
 * never written. That is the exact shape of the failure this whole project is
 * built around: a success that carries no information.
 *
 * The contract's own state is the authority, so this is what the UI believes.
 * The read is uncached and runs on the server, like every other read the site
 * makes.
 */
export async function confirmAnalysis(url: string): Promise<Confirmation> {
  const record = await getAssessmentByUrlFresh(url);
  if (!record?.found) {
    return { assessmentId: null, analyzedAt: null, verdict: null, title: null };
  }
  return {
    assessmentId: Number(record.assessment_id) || null,
    analyzedAt: Number(record.analyzed_at) || null,
    verdict: record.verdict ?? null,
    title: record.title ?? null,
  };
}
