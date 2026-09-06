/**
 * Seeds a deployment with REAL governance proposals, one per platform.
 *
 *   node test/seed.mjs --network=bradbury --keystore=mywallet
 *   node test/seed.mjs --network=studionet
 *
 * Every URL below is a proposal a real DAO actually voted on, chosen so the set
 * spans all three document shapes the contract knows how to read and a range of
 * proposal kinds — a protocol deployment, a constitutional amendment, an
 * on-chain treasury rebalance, a service-provider RFP and an election notice.
 *
 * The per-wallet rate limit is 300 seconds, so a single signer cannot seed the
 * whole set in one go. This paces itself against the contract's own limit and
 * reports what each proposal scored, so the run doubles as evidence: the
 * assessments it produces are the ones on the explorer.
 */
import { existsSync, readFileSync } from "node:fs";
import { connect, argOf, sleep } from "./harness.mjs";

const networkName = argOf("network", "studionet");
const only = Number(argOf("count", "0"));

function fromDeployments(key) {
  const path = new URL("../deployments.json", import.meta.url);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  return doc?.deployments?.[networkName]?.[key]?.address ?? null;
}

const ADDRESS = argOf("voteguard", null) ?? fromDeployments("VoteGuard");
if (!ADDRESS) throw new Error("no VoteGuard address — pass --voteguard=0x… or deploy first");

// One signer per proposal: the contract rate-limits a wallet to one request
// every 300 seconds, and waiting that out five times would take half an hour.
const ROLES = ["client", "operator", "operator2", "watcher", "watcher2", "resolver"];

const PROPOSALS = [
  {
    url: "https://snapshot.org/#/aavedao.eth/proposal/0x12d0143db33efe0754cab4d89ba9ba7ae23e7e1b77817ba7fc79a35c382280ec",
    dao: "Aave DAO",
    what: "Snapshot · deploy Aave V4 on Arc",
  },
  {
    url: "https://forum.arbitrum.foundation/t/constitutional-aip-fast-feed/31003",
    dao: "Arbitrum DAO",
    what: "Discourse · constitutional AIP",
  },
  {
    url: "https://www.tally.xyz/gov/uniswap/proposal/86",
    dao: "Uniswap",
    what: "Tally · approved budgets rebalancing",
  },
  {
    url: "https://snapshot.org/#/ens.eth/proposal/0x943e585d1a4996525c5c7d229401d604ea56fe08c2c9c615c44f048ba42487b7",
    dao: "ENS",
    what: "Snapshot · SPP3 marketplace RFP",
  },
  {
    url: "https://snapshot.org/#/uniswapgovernance.eth/proposal/0x5ae3426216321df66a67eb677874b725f80e51888ad2da72b382b21669c554ee",
    dao: "Uniswap",
    what: "Snapshot · Four for V4 temp check",
  },
  {
    url: "https://snapshot.org/#/lido-snapshot.eth/proposal/0x7b07bc31f0b38b69a117473031bc126becc70b9fa37246b53d9fe5a841c814f5",
    dao: "Lido",
    what: "Snapshot · 0x02 CSM module launch",
  },
];

const wanted = only > 0 ? PROPOSALS.slice(0, only) : PROPOSALS;

console.log(`\nVoteGuard seed → ${networkName}`);
console.log(`  contract   ${ADDRESS}`);
console.log(`  proposals  ${wanted.length}\n`);

let ok = 0;
let failed = 0;
const results = [];

for (let i = 0; i < wanted.length; i++) {
  const p = wanted[i];
  const role = ROLES[i % ROLES.length];
  const client = connect({ networkName, address: ADDRESS, role });

  // A wallet reused within 300s is rate-limited, and that is a REFUSAL with a
  // refund rather than a failure — but it wastes a transaction, so pace it.
  if (i >= ROLES.length) await sleep(310_000);

  process.stdout.write(`  [${i + 1}/${wanted.length}] ${p.what}\n`);
  const started = Date.now();
  const out = await client.send("analyze_proposal", [p.url, p.dao], 0n);
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  if (!out.ok) {
    failed++;
    console.log(`        FAILED after ${secs}s — ${out.status} ${String(out.revertReason || out.failure || "").slice(0, 110)}\n`);
    continue;
  }

  const record = await client.call("get_assessment_by_url", [p.url]).catch(() => null);
  if (!record?.found) {
    // A rejection is a SUCCESSFUL transaction whose return says REJECTED, so
    // "the tx worked" and "the proposal was assessed" are different questions.
    const text = typeof out.returned === "string" ? out.returned : JSON.stringify(out.returned ?? "");
    failed++;
    console.log(`        NOT STORED after ${secs}s — ${text.slice(0, 130)}\n`);
    continue;
  }

  ok++;
  results.push({ ...p, record, hash: out.hash, secs });
  const labels = (record.labels ?? []).join(" · ");
  console.log(`        ${record.verdict}  ${record.overall_score}/100  (${secs}s)  tx ${out.hash}`);
  console.log(`        ${record.title}`);
  console.log(`        ${labels}`);
  console.log(`        confidence ${record.confidence} · ${(record.flags ?? []).length} findings · #${record.assessment_id}\n`);
}

console.log("──────────────────────────────────────────────────────────────");
console.log(`${ok} assessed, ${failed} failed\n`);

if (results.length) {
  console.log("Assessments on chain:");
  for (const r of results) {
    console.log(`  #${r.record.assessment_id}  ${r.record.verdict.padEnd(9)} ${String(r.record.overall_score).padStart(3)}/100  ${r.record.title.slice(0, 54)}`);
    console.log(`        tx ${r.hash}`);
  }
  console.log();
}
process.exit(failed && !ok ? 1 : 0);
