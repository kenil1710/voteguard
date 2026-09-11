/**
 * The LIVE suite. Real network, real validators, real model, real proposals.
 *
 *   node test/deploy.mjs --network=studionet
 *   node test/e2e.mjs --network=studionet --voteguard=0x… --consumer=0x…
 *
 * or, letting it read deployments.json:
 *
 *   node test/e2e.mjs --network=studionet
 *
 * What the offline suite CANNOT prove, and this can:
 *
 *   1. that five independent validators, each fetching a live governance
 *      platform and each running a model, land on the same assessment. The
 *      probe measured the naive version of this failing sixteen rounds in a row
 *      (docs/PROBE.md §6); this is the version that settles.
 *   2. that Snapshot, Tally and Discourse are all readable from validator
 *      egress today, not merely on the day the fixtures were captured.
 *   3. that the stored record recomputes from its own evidence ON CHAIN.
 *   4. that GovernanceConsumer reads VoteGuard across the contract boundary and
 *      refuses to pay when the verdict says so.
 *
 * It needs a FRESH VoteGuard: it asserts on assessment ids starting at 1 and on
 * a clean stats block, so a second run against the same address fails on the
 * proposal cooldown. Deploy first.
 */
import { existsSync, readFileSync } from "node:fs";
import { connect, argOf, sleep } from "./harness.mjs";

const networkName = argOf("network", "studionet");

function fromDeployments(key) {
  const path = new URL("../deployments.json", import.meta.url);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  return doc?.deployments?.[networkName]?.[key]?.address ?? null;
}

const VOTEGUARD = argOf("voteguard", null) ?? fromDeployments("VoteGuard");
const CONSUMER = argOf("consumer", null) ?? fromDeployments("GovernanceConsumer");
if (!VOTEGUARD) throw new Error("no VoteGuard address — pass --voteguard=0x… or run deploy.mjs first");

const oracle = connect({ networkName, address: VOTEGUARD, role: "client" });
const oracle2 = connect({ networkName, address: VOTEGUARD, role: "watcher" });
const oracle3 = connect({ networkName, address: VOTEGUARD, role: "watcher2" });
const outsider = connect({ networkName, address: VOTEGUARD, role: "outsider" });
const treasury = CONSUMER ? connect({ networkName, address: CONSUMER, role: "client" }) : null;
const stranger = CONSUMER ? connect({ networkName, address: CONSUMER, role: "resolver" }) : null;

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}${detail ? "  — " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${label}${detail ? "  — " + detail : ""}`);
  }
}


/**
 * Did this call return a REJECTED status object?
 *
 * The receipt spells a returned dict two ways depending on the network and the
 * shape: sometimes `readable` parses as JSON and `out.returned` is an object,
 * sometimes it arrives as the raw calldata rendered to a string with NUL
 * separators between the keys. A check that only handles the object form
 * reports a correctly-refunded rejection as a failure, which is exactly
 * backwards — so both spellings are accepted and the REASON is still asserted.
 */
function saidRejected(out, reasonPattern = null) {
  if (!out?.ok) return false;
  const value = out.returned;
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const rejected =
    (value && typeof value === "object" && value.status === "REJECTED") ||
    /REJECTED/.test(text);
  if (!rejected) return false;
  return reasonPattern ? reasonPattern.test(text) : true;
}

/** A returned field, whichever spelling the receipt used. */
function returnedField(out, key) {
  const value = out?.returned;
  if (value && typeof value === "object" && key in value) return value[key];
  const text = typeof value === "string" ? value : "";
  const m = text.match(new RegExp(`${key}[\\u0000-\\u001f]*([^\\u0000-\\u001f]*)`));
  return m ? m[1] : undefined;
}

function section(title) {
  console.log(`\n${title}`);
}

// --- REAL proposals, one per platform, chosen so the corpus spans the three
// document shapes the contract knows how to read. Every one of these is a
// proposal that a real DAO actually voted on.
const AAVE = "https://snapshot.org/#/aavedao.eth/proposal/0x12d0143db33efe0754cab4d89ba9ba7ae23e7e1b77817ba7fc79a35c382280ec";
const AAVE_ALIAS = "https://snapshot.box/#/s:aave.eth/proposal/0x12d0143db33efe0754cab4d89ba9ba7ae23e7e1b77817ba7fc79a35c382280ec";
const UNISWAP = "https://snapshot.org/#/uniswapgovernance.eth/proposal/0x5ae3426216321df66a67eb677874b725f80e51888ad2da72b382b21669c554ee";
const ARBITRUM_FORUM = "https://forum.arbitrum.foundation/t/constitutional-aip-fast-feed/31003";
const TALLY_UNI = "https://www.tally.xyz/gov/uniswap/proposal/86";

console.log(`\nVoteGuard live suite → ${networkName}`);
console.log(`  VoteGuard          ${VOTEGUARD}`);
console.log(`  GovernanceConsumer ${CONSUMER ?? "(not deployed — consumer checks skipped)"}`);

// ---------------------------------------------------------------------------
section("1. configuration and the reproducibility surface");
// ---------------------------------------------------------------------------
const config = await oracle.call("get_config", []);
check("get_config answers", config && typeof config === "object");
check("rubric version is published", config?.rubric_version === "1.0.0", String(config?.rubric_version));
check("five dimensions, the brief's weights",
  JSON.stringify((config?.dimensions ?? []).map((d) => d.weight)) === "[25,25,20,15,15]",
  JSON.stringify((config?.dimensions ?? []).map((d) => `${d.key}:${d.weight}`)));
check("the brief's bucket names are published",
  (config?.dimensions ?? []).some((d) => d.buckets?.includes("IMPRACTICAL")) &&
  (config?.dimensions ?? []).some((d) => d.buckets?.includes("EXCESSIVE")) &&
  (config?.dimensions ?? []).some((d) => d.buckets?.includes("DANGEROUS")));
check("three platforms are declared",
  JSON.stringify(config?.platforms) === '["snapshot","tally","discourse"]',
  JSON.stringify(config?.platforms));
check("the vector's ceilings are published", Object.keys(config?.vector_ceilings ?? {}).length === 24,
  `${Object.keys(config?.vector_ceilings ?? {}).length} fields`);
check("the model's five fields are named", (config?.model_fields ?? []).length === 5);
check("verdict overrides are published", (config?.verdict_overrides ?? []).length >= 2);
check("the fee is bounded by a constant", Number(config?.max_fee_wei) === 1e17);

// get_stats reads no balance — it cannot, from a view (docs/NOTES.md)
const stats0 = await oracle.call("get_stats", []);
check("get_stats answers from a view", stats0 && typeof stats0 === "object");
check("a fresh contract has analysed nothing", Number(stats0?.total_analyzed) === 0,
  `total_analyzed=${stats0?.total_analyzed}`);

// ---------------------------------------------------------------------------
section("2. the URL parser refuses what it cannot safely fetch");
// ---------------------------------------------------------------------------
for (const [url, why] of [
  ["http://forum.arbitrum.foundation/t/31003", "plain http"],
  ["https://169.254.169.254/t/1", "cloud metadata endpoint"],
  ["https://localhost/t/1", "loopback"],
  ["https://10.0.0.1/t/1", "private range"],
  ["https://snapshot.org@evil.example/t/1", "credentials in the authority"],
  ["https://forum.example.com:8080/t/1", "explicit port"],
  ["https://snapshot.org/#/aave.eth/proposal/0xdead", "malformed proposal id"],
  ["https://example.com/proposals/1", "not a supported shape"],
]) {
  const preview = await oracle.call("preview_url", [url]);
  check(`refuses ${why}`, preview?.ok === false, String(preview?.reason ?? "").slice(0, 70));
}

// ---------------------------------------------------------------------------
section("3. the submitted URL is never the fetched URL");
// ---------------------------------------------------------------------------
const preview = await oracle.call("preview_url", [AAVE]);
check("a snapshot URL previews as snapshot", preview?.platform === "snapshot");
check("the fetch URL is the GraphQL hub, not the SPA",
  String(preview?.fetch_url ?? "").startsWith("https://hub.snapshot.org/graphql?query="),
  String(preview?.fetch_url ?? "").slice(0, 60) + "…");
check("the fetch URL carries no fragment", !String(preview?.fetch_url ?? "").includes("#"));
check("preview is free and says the proposal is unknown", preview?.already_analyzed === false);

const aliasPreview = await oracle.call("preview_url", [AAVE_ALIAS]);
check("a different host and a DEAD space resolve to the same proposal",
  aliasPreview?.proposal_key === preview?.proposal_key,
  `aave.eth alias → ${String(aliasPreview?.proposal_key ?? "").slice(0, 34)}…`);

const forumA = await oracle.call("preview_url", [ARBITRUM_FORUM]);
const forumB = await oracle.call("preview_url", ["https://forum.arbitrum.foundation/t/free-money-for-everyone/31003"]);
check("a Discourse slug cannot change the identity",
  forumA?.proposal_key === forumB?.proposal_key && forumA?.fetch_url === forumB?.fetch_url,
  forumA?.fetch_url);

// ---------------------------------------------------------------------------
section("4. live analysis — three platforms, three real proposals");
// ---------------------------------------------------------------------------
const analysed = [];

async function analyse(client, url, dao, label) {
  // Studionet meters 30 requests per minute and one analysis spends several on
  // polling alone. Pacing here keeps a rate limit from being reported as a
  // contract failure — the harness retries, but the wait shows up as a stall.
  if (analysed.length) await sleep(networkName === "studionet" ? 20_000 : 4_000);
  const started = Date.now();
  const out = await client.send("analyze_proposal", [url, dao], 0n);
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (!out.ok) {
    check(`${label} settles`, false, `${out.status} ${String(out.revertReason || out.failure || "").slice(0, 90)}`);
    return null;
  }
  const votes = out.raw?.eq_outputs ? "" : "";
  check(`${label} settles`, true, `${out.status} in ${seconds}s`);
  const record = await oracle.call("get_assessment_by_url", [url]);
  if (!record?.found) {
    check(`${label} is stored`, false, JSON.stringify(record).slice(0, 120));
    return null;
  }
  analysed.push(record);
  return record;
}

const aave = await analyse(oracle, AAVE, "Aave DAO", "Snapshot / Aave V4 on Arc");
if (aave) {
  check("the title came from the document", aave.title === "[ARFC] Deploy Aave V4 on Arc", aave.title);
  check("the DAO came from the document, not the URL", aave.dao_id === "aavedao.eth", aave.dao_id);
  check("five dimensions were scored", (aave.dimensions ?? []).length === 5);
  check("every dimension carries a bucket label",
    (aave.dimensions ?? []).every((d) => typeof d.label === "string" && d.label.length > 2),
    (aave.dimensions ?? []).map((d) => d.label).join(","));
  check("the verdict is one of three", ["RECOMMEND", "CAUTION", "OPPOSE"].includes(aave.verdict), aave.verdict);
  check("the overall score is a multiple of five and in range",
    aave.overall_score >= 0 && aave.overall_score <= 100 && aave.overall_score % 5 === 0,
    `${aave.overall_score}/100`);
  check("the IPFS anchor was captured", String(aave.anchor ?? "").startsWith("bafk"), aave.anchor);
  check("the evidence vector has 24 fields",
    Object.keys(JSON.parse(aave.evidence ?? "{}")).length === 24,
    `${Object.keys(JSON.parse(aave.evidence ?? "{}")).length} fields`);
  const quoted = (aave.dimensions ?? []).filter((d) => (d.evidence ?? "").length >= 28);
  check("at least one dimension carries a verbatim quote from the proposal",
    quoted.length >= 1, `${quoted.length}/5 dimensions quoted`);
  check("the assessment id starts at 1", aave.assessment_id === 1, String(aave.assessment_id));
}

// A wallet is rate-limited between requests, so each proposal uses its own.
const forum = await analyse(oracle2, ARBITRUM_FORUM, "Arbitrum DAO", "Discourse / Arbitrum AIP Fast Feed");
if (forum) {
  check("the forum title came from the document, not the slug",
    forum.title === "[Constitutional] AIP Fast Feed", forum.title);
  check("the platform is discourse", forum.platform === "discourse");
  check("the forum host is the DAO key", forum.dao_id === "forum.arbitrum.foundation", forum.dao_id);
  check("the cooked HTML was flattened to prose", !String(forum.excerpt ?? "").includes("<"),
    String(forum.excerpt ?? "").slice(0, 60) + "…");
}

const tally = await analyse(oracle3, TALLY_UNI, "Uniswap", "Tally / Uniswap proposal 86");
if (tally) {
  check("the Tally SSR payload yielded a title", String(tally.title ?? "").length > 4, tally.title);
  check("the platform is tally", tally.platform === "tally");
  check("a description was extracted", String(tally.excerpt ?? "").length > 40,
    `${String(tally.excerpt ?? "").length} chars`);
}

check("all three platforms produced an assessment", analysed.length === 3,
  `${analysed.length}/3 — ${analysed.map((a) => a.platform).join(", ")}`);

// ---------------------------------------------------------------------------
section("5. every stored field recomputes from its own evidence, ON CHAIN");
// ---------------------------------------------------------------------------
for (const record of analysed) {
  const v = await oracle.call("verify_assessment", [record.assessment_id]);
  check(`assessment ${record.assessment_id} verifies`, v?.verified === true,
    v?.verified ? `${v.recomputed.verdict} ${v.recomputed.overall}/100`
      : JSON.stringify(v?.differences ?? v).slice(0, 140));
  check(`assessment ${record.assessment_id} rehashes to the stored content hash`,
    v?.recomputed?.content_hash === record.content_hash,
    String(record.content_hash));
}

// ---------------------------------------------------------------------------
section("6. reads agree with each other");
// ---------------------------------------------------------------------------
if (aave) {
  const byId = await oracle.call("get_assessment", [aave.assessment_id]);
  check("by-id and by-url return the same record",
    byId?.content_hash === aave.content_hash && byId?.overall_score === aave.overall_score);
  const alias = await oracle.call("get_assessment_by_url", [AAVE_ALIAS]);
  check("the aave.eth alias finds the aavedao.eth assessment",
    alias?.assessment_id === aave.assessment_id);
  const summary = await oracle.call("get_risk_summary", [AAVE]);
  check("the risk summary agrees with the record",
    summary?.known === true && summary.verdict === aave.verdict && summary.score === aave.overall_score,
    `${summary?.verdict} ${summary?.score}`);
  check("the risk summary names a worst dimension",
    (config?.dimensions ?? []).some((d) => d.key === summary?.worst_dimension),
    `${summary?.worst_dimension} (${summary?.worst_label})`);
  check("is_recommended agrees with the verdict",
    (await oracle.call("is_recommended", [aave.assessment_id])) === (aave.verdict === "RECOMMEND"));
}
const unknown = await oracle.call("get_risk_summary", [UNISWAP]);
check("an unanalysed proposal is not recommended", unknown?.known === false && unknown?.verdict === "UNKNOWN");
check("is_recommended is false for an unknown id",
  (await oracle.call("is_recommended", [99999])) === false);

const stats = await oracle.call("get_stats", []);
check("stats counted every analysis", Number(stats?.total_analyzed) === analysed.length,
  `${stats?.total_analyzed} analysed, ${stats?.proposals_tracked} tracked`);
check("stats counted the platforms",
  Number(stats?.platforms?.snapshot ?? 0) + Number(stats?.platforms?.discourse ?? 0)
  + Number(stats?.platforms?.tally ?? 0) === analysed.length,
  JSON.stringify(stats?.platforms));
check("the verdict tally sums to the analyses",
  Object.values(stats?.verdicts ?? {}).reduce((a, b) => a + Number(b), 0) === analysed.length,
  JSON.stringify(stats?.verdicts));

const recent = await oracle.call("get_recent_assessments", [10]);
check("recent lists newest first",
  (recent?.assessments ?? []).length === analysed.length &&
  (recent.assessments.length < 2 || recent.assessments[0].assessment_id > recent.assessments[1].assessment_id),
  `${recent?.assessments?.length} rows`);

const proposals = await oracle.call("get_proposals", [0, 50]);
check("get_proposals pages every tracked proposal", Number(proposals?.total) === analysed.length);
check("proposal rows carry flags for client-side filtering",
  (proposals?.proposals ?? []).every((p) => Array.isArray(p.flags)));

if (aave) {
  const byDao = await oracle.call("get_assessments_by_dao", ["aave", 10]);
  check("a DAO resolves loosely from a partial name",
    byDao?.found === true && byDao.dao_id === "aavedao.eth",
    `"aave" → ${byDao?.dao_id}`);
  check("the DAO carries average scores", typeof byDao?.average_scores?.overall === "number",
    `avg overall ${byDao?.average_scores?.overall}`);
}

// ---------------------------------------------------------------------------
section("7. rejections refund rather than revert");
// ---------------------------------------------------------------------------
for (const [url, why] of [
  ["not-a-url", "a malformed URL"],
  ["https://169.254.169.254/t/1", "a metadata endpoint"],
  ["https://snapshot.org/#/x/proposal/0xdead", "a malformed proposal id"],
]) {
  const out = await outsider.send("analyze_proposal", [url, "X"], 0n);
  check(`${why} is rejected without reverting`, saidRejected(out),
    saidRejected(out) ? String(returnedField(out, "reason")).slice(0, 60)
      : `${out.status} ${String(out.revertReason ?? "").slice(0, 60)}`);
}

const dup = await oracle.send("analyze_proposal", [AAVE, "Aave DAO"], 0n);
check("a re-analysis inside the cooldown is refused and refunded",
  saidRejected(dup, /analysed|rate limited|in flight/),
  String(returnedField(dup, "reason") ?? dup.revertReason ?? "").slice(0, 70));

// ---------------------------------------------------------------------------
section("8. the owner cannot reach a score");
// ---------------------------------------------------------------------------
const notOwner = await outsider.send("set_fee", [0], 0n);
check("a stranger cannot set the fee", !notOwner.ok || notOwner.reverted,
  String(notOwner.revertReason ?? "").slice(0, 60));
const notOwner2 = await outsider.send("set_paused", [true], 0n);
check("a stranger cannot pause", !notOwner2.ok || notOwner2.reverted);
const overFee = await oracle.send("set_fee", [10n ** 18n], 0n);
check("the owner cannot price above the constant ceiling", !overFee.ok || overFee.reverted,
  String(overFee.revertReason ?? "").slice(0, 60));

const paused = await oracle.send("set_paused", [true], 0n);
check("the owner can pause", paused.ok);
if (paused.ok && aave) {
  const stillReads = await oracle.call("get_assessment", [aave.assessment_id]);
  check("pause never blocks a read", stillReads?.found === true);
  const stillVerifies = await oracle.call("verify_assessment", [aave.assessment_id]);
  check("pause never blocks verification", stillVerifies?.verified === true);
  const blocked = await outsider.send("analyze_proposal", [UNISWAP, "Uniswap"], 0n);
  check("pause refuses new analysis, with a refund",
    saidRejected(blocked, /paused/),
    String(returnedField(blocked, "reason") ?? "").slice(0, 60));
  await oracle.send("set_paused", [false], 0n);
}

// ---------------------------------------------------------------------------
section("9. settle_stalled");
// ---------------------------------------------------------------------------
const nothing = await oracle.send("settle_stalled", [UNISWAP], 0n);
const noopText = typeof nothing.returned === "string"
  ? nothing.returned : JSON.stringify(nothing.returned ?? "");
check("settle_stalled on a proposal with no round in flight is a no-op",
  nothing.ok && /NOTHING_PENDING/.test(noopText),
  nothing.ok ? noopText.slice(0, 60) : String(nothing.revertReason ?? "").slice(0, 60));

// ---------------------------------------------------------------------------
section("10. GovernanceConsumer — the composability claim");
// ---------------------------------------------------------------------------
if (!treasury) {
  console.log("  (skipped — no consumer address)");
} else {
  const terms = await treasury.call("get_terms", []);
  check("the consumer answers get_terms", terms && typeof terms === "object");
  check("the oracle is pinned and says so", terms?.oracle_is_immutable === true);
  check("the consumer points at THIS VoteGuard",
    String(terms?.oracle ?? "").toLowerCase() === VOTEGUARD.toLowerCase(),
    String(terms?.oracle));
  check("the consumer reads the oracle's rubric ACROSS the boundary",
    terms?.oracle_rubric?.rubric_version === "1.0.0",
    JSON.stringify(terms?.oracle_rubric ?? {}).slice(0, 90));

  if (aave) {
    const pre = await treasury.call("preflight", [AAVE]);
    check("preflight knows the assessment", pre?.known === true);
    check("preflight agrees with the oracle's verdict", pre?.verdict === aave.verdict,
      `${pre?.verdict} @ ${pre?.score}`);
    const shouldRelease = aave.verdict === "RECOMMEND" && aave.overall_score >= Number(terms?.min_score ?? 70);
    check("preflight's decision follows the treasury's own terms",
      pre?.would_release === shouldRelease,
      pre?.would_release ? "would release" : `blocked: ${(pre?.blockers ?? []).join("; ").slice(0, 80)}`);

    // A treasury with no money cannot promise any, and refusing to is the
    // correct behaviour — so fund it first, then queue.
    const funded = await treasury.send("fund", [], 10n ** 15n);
    check("the treasury accepts funding", funded.ok,
      String(funded.revertReason ?? "").slice(0, 70));

    // Queueing is PERMISSIONED now, and the signer is the deployer/owner, so
    // it may queue. A stranger must not be able to.
    const canOwner = await treasury.call("can_queue", [terms?.owner ?? ""]);
    check("the owner may queue", canOwner?.can_queue === true);
    const canStranger = await treasury.call("can_queue", ["0x000000000000000000000000000000000000dEaD"]);
    check("an address nobody whitelisted may NOT queue", canStranger?.can_queue === false);

    // Queue a payout BOUND to the assessment that was actually made, and try
    // to release it. A payout can no longer be queued without naming one.
    const q = await treasury.send("queue_payout",
      [AAVE, "grant to the Aave working group", "0x000000000000000000000000000000000000dEaD", 1000,
       aave.assessment_id], 0n);
    // The payout id is read back from the contract rather than out of the
    // return value, because the return spelling varies by network.
    const list = await treasury.call("get_payouts", [0, 20]);
    const mine = (list?.payouts ?? []).find((p) => p.proposal_url === AAVE);
    const queued = q.ok && Boolean(mine);
    check("a payout can be queued against a real proposal", queued,
      queued ? `payout ${mine.payout_id}` : String(q.revertReason ?? "").slice(0, 90));

    if (queued) {
      const id = mine.payout_id;
      const stored = await treasury.call("get_payout", [id]);
      check("the payout snapshotted its oracle",
        String(stored?.terms?.oracle ?? "").toLowerCase() === VOTEGUARD.toLowerCase());
      check("the payout bound recipient, amount and purpose to the assessment",
        Number(stored?.authorization?.assessment_id) === Number(aave.assessment_id)
        && String(stored?.authorization?.recipient ?? "").toLowerCase() === "0x000000000000000000000000000000000000dead"
        && Number(stored?.authorization?.amount_wei) === 1000
        && String(stored?.authorization?.purpose ?? "").length > 0,
        JSON.stringify(stored?.authorization ?? {}).slice(0, 120));
      check("the payout PINNED the assessment's evidence digest",
        String(stored?.authorization?.evidence_digest ?? "") === String(aave.content_hash ?? "x"),
        `${stored?.authorization?.evidence_digest} vs ${aave.content_hash}`);

      // A caller that states the wrong terms gets a revert, not a transfer.
      const wrongPayee = await stranger.send("release",
        [id, "0x000000000000000000000000000000000000bEEF", 1000, aave.assessment_id], 0n);
      check("release REVERTS on a recipient the payout does not name",
        wrongPayee.reverted || !wrongPayee.ok,
        String(wrongPayee.revertReason ?? "").slice(0, 90));
      const wrongAmount = await stranger.send("release", [id, "0x000000000000000000000000000000000000dEaD", 999, aave.assessment_id], 0n);
      check("release REVERTS on an amount the payout does not name",
        wrongAmount.reverted || !wrongAmount.ok,
        String(wrongAmount.revertReason ?? "").slice(0, 90));
      const wrongAssessment = await stranger.send("release",
        [id, "0x000000000000000000000000000000000000dEaD", 1000, Number(aave.assessment_id) + 1], 0n);
      check("release REVERTS on an assessment the payout was not authorised by",
        wrongAssessment.reverted || !wrongAssessment.ok,
        String(wrongAssessment.revertReason ?? "").slice(0, 90));
      const stillQueued = await treasury.call("get_payout", [id]);
      check("three refused releases moved no money", stillQueued?.status === "QUEUED",
        String(stillQueued?.status));
      check("the payout snapshotted its verdict mode and score floor",
        stored?.terms?.mode === terms?.mode && stored?.terms?.min_score === terms?.min_score,
        `${stored?.terms?.mode} / ${stored?.terms?.min_score}`);

      // Moving the defaults must NOT reach a payout already queued.
      const moved = await treasury.send("set_terms", ["RECOMMEND_OR_CAUTION", 99, 3600], 0n);
      check("the owner can move the DEFAULT terms", moved.ok,
        String(moved.revertReason ?? "").slice(0, 60));
      const after = await treasury.call("get_payout", [id]);
      check("a queued payout keeps the terms it was queued under",
        after?.terms?.mode === stored?.terms?.mode && after?.terms?.min_score === stored?.terms?.min_score,
        `still ${after?.terms?.mode} / ${after?.terms?.min_score}`);

      // The free preview of exactly what release will do, authorisation
      // checks included.
      const payPre = await treasury.call("preflight_payout", [id]);
      check("preflight_payout reports the pinned digest is unchanged",
        payPre?.evidence_unchanged === true,
        `${payPre?.pinned_evidence_digest} / ${payPre?.current_evidence_digest}`);

      // The release itself: permissionless, stating the bound terms, and it
      // either pays or reverts.
      const rel = await stranger.send("release",
        [id, "0x000000000000000000000000000000000000dEaD", 1000, aave.assessment_id], 0n);
      if (shouldRelease) {
        check("a stranger can release a recommended payout", rel.ok,
          String(rel.revertReason ?? "").slice(0, 80));
        if (rel.ok) {
          const settled = await treasury.call("get_payout", [id]);
          check("the released payout records the oracle's verdict",
            settled?.status === "RELEASED" && settled?.verdict === aave.verdict,
            `${settled?.status} ${settled?.verdict} @ ${settled?.score}`);
        }
      } else {
        check("a payout on a non-recommended proposal REVERTS", rel.reverted || !rel.ok,
          String(rel.revertReason ?? "").slice(0, 100));
        check("the revert names the verdict that blocked it",
          String(rel.revertReason ?? "").includes(aave.verdict),
          String(rel.revertReason ?? "").slice(0, 100));
        const untouched = await treasury.call("get_payout", [id]);
        check("a refused payout stays queued and moves no money",
          untouched?.status === "QUEUED", String(untouched?.status));
      }
    }

    // strict_release is require_recommended reached across the boundary.
    const strict = await treasury.call("strict_release", [aave.assessment_id]).catch((e) => ({ error: String(e) }));
    if (aave.verdict === "RECOMMEND") {
      check("strict_release returns the record for a recommendation",
        strict?.assessment_id === aave.assessment_id);
    } else {
      check("strict_release refuses a non-recommendation across the boundary",
        Boolean(strict?.error) || strict?.verdict !== "RECOMMEND",
        String(strict?.error ?? "").slice(0, 90));
    }
  }

  // Binding moved the refusal forward: an unanalysed proposal cannot even be
  // queued now, where it used to queue and fail later at release.
  const noAssessment = await treasury.send("queue_payout",
    [UNISWAP, "grant", "0x000000000000000000000000000000000000dEaD", 1000, 999999], 0n);
  check("a payout cannot be queued against an assessment that does not exist",
    !noAssessment.ok || noAssessment.reverted
    || String(noAssessment.returnValue?.status ?? "") === "REJECTED",
    String(noAssessment.revertReason ?? JSON.stringify(noAssessment.returnValue ?? {})).slice(0, 90));

  const unknownPre = await treasury.call("preflight", [UNISWAP]);
  check("an unanalysed proposal would never release",
    unknownPre?.would_release === false && unknownPre?.known === false,
    (unknownPre?.blockers ?? []).join("; "));
}

// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(70)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  · ${f}`);
}
console.log();
process.exit(failed ? 1 : 0);
