"use server";

import { revalidateTag } from "next/cache";

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
 * The assessment's own id is deliberately not in the list. It has never been
 * cached under any key, because it did not exist until this transaction.
 */
const STALE_AFTER_ANALYSIS = [
  "stats",
  "recent",
  "proposals",
  "assessment-url",
  "history",
  "dao",
  "dao-index",
];

export async function refreshAfterAnalysis(): Promise<void> {
  for (const tag of STALE_AFTER_ANALYSIS) revalidateTag(tag, { expire: 0 });
}
