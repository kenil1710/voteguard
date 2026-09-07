/**
 * The settlement decision table, tested against the case that broke.
 *
 *   node test/wallet_settle.mjs
 *
 * WHAT WENT WRONG. `submitAnalysis` used to read the contract's return value
 * out of the transaction receipt and, when it could not, assume success:
 *
 *     if (!body) return { kind: "ok", hash, assessmentId: null };
 *
 * Bradbury returns no `consensus_data` at all — measured, on the real receipt
 * for tx 0x809cd5fa… and again on a reproduction round: no `leader_receipt`, no
 * `payload`, no `readable`. So that branch was not an edge case on Bradbury, it
 * was EVERY settled submission. A proposal the validators refused rendered as
 * "Assessed on chain", which is the same failure the whole project is built
 * around: a success that carries no information.
 *
 * THE RULE NOW. The receipt is a convenience; the contract's own state is the
 * authority. Every path ends by reading the record back and comparing it to
 * what the URL pointed at before the round.
 *
 * The test compiles src/lib/wallet.ts and drives the real `settle`, so it can
 * only pass if the shipped function behaves.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../frontend/", import.meta.url));
// Emitted UNDER frontend/node_modules so `genlayer-js` still resolves from the
// compiled output, and so the artefacts land somewhere already ignored by git.
const out = join(frontend, "node_modules", ".cache", "voteguard-settle");
mkdirSync(out, { recursive: true });

execFileSync(
  "npx",
  ["tsc", "src/lib/wallet.ts", "src/lib/genlayer.ts", "--outDir", out,
   "--module", "esnext", "--target", "es2022",
   "--moduleResolution", "bundler", "--skipLibCheck"],
  { cwd: frontend, stdio: "pipe" },
);
// tsc emits extensionless relative imports, which Node's ESM loader will not
// resolve. Rewriting the one specifier is cheaper than a bundler.
const emitted = join(out, "wallet.js");
writeFileSync(
  emitted,
  readFileSync(emitted, "utf8").replace('from "./genlayer"', 'from "./genlayer.js"'),
);
const { settle } = await import(emitted);

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A confirm() that answers with a fixed record, and counts its calls. */
function confirmer(assessmentId, analyzedAt = 1788700000) {
  const fn = async () => ({ assessmentId, analyzedAt });
  fn.calls = 0;
  return async () => {
    fn.calls++;
    return { assessmentId, analyzedAt };
  };
}

const HASH = "0xdeadbeef";

// ── 1. THE BUG. No readable payload, and the contract stored nothing. ───────
{
  const r = await settle(HASH, null, {
    previousAssessmentId: null,
    confirm: confirmer(null),
  });
  check("unreadable receipt + nothing stored => rejected", r.kind === "rejected",
    `got ${r.kind}`);
  check("…and says the reason could not be read",
    r.kind === "rejected" && /does not return the contract's reason/.test(r.reason));
  check("…and does not invent an assessment id",
    r.assessmentId === undefined);
}

// ── 2. No readable payload, but the contract DID store one. ────────────────
{
  const r = await settle(HASH, null, {
    previousAssessmentId: null,
    confirm: confirmer(4),
  });
  check("unreadable receipt + record present => ok", r.kind === "ok", `got ${r.kind}`);
  check("…and carries the REAL id read back from the chain", r.assessmentId === 4,
    `got ${r.assessmentId}`);
}

// ── 3. The case that would have silently lied: a re-analysis that was
//       refused, on a URL that already had an assessment. The record exists,
//       so a naive "is there a record?" check reports success. ──────────────
{
  const r = await settle(HASH, null, {
    previousAssessmentId: 1,
    confirm: confirmer(1),
  });
  check("refused re-analysis is NOT reported as success", r.kind === "rejected",
    `got ${r.kind}`);
}
{
  const r = await settle(HASH, null, {
    previousAssessmentId: 1,
    confirm: confirmer(4),
  });
  check("accepted re-analysis IS reported as success", r.kind === "ok", `got ${r.kind}`);
  check("…with the new id, not the old one", r.assessmentId === 4, `got ${r.assessmentId}`);
}

// ── 4. A readable REJECTED payload keeps its own reason. ───────────────────
{
  const body = { status: "REJECTED", reason: "rate limited, retry in 240s", refund_wei: "1000" };
  const r = await settle(HASH, body, {
    previousAssessmentId: null,
    confirm: confirmer(null),
  });
  check("readable rejection => rejected", r.kind === "rejected", `got ${r.kind}`);
  check("…quotes the contract's own reason", r.reason === "rate limited, retry in 240s",
    r.reason);
  check("…carries the refund the contract reported", r.refundWei === "1000", r.refundWei);
}

// ── 5. A readable OK payload is still checked against the chain. The receipt
//       is never the authority, even when it agrees with us. ────────────────
{
  const body = { status: "OK", assessment_id: 9 };
  const r = await settle(HASH, body, {
    previousAssessmentId: null,
    confirm: confirmer(4),
  });
  check("receipt says OK but chain says id 4 => the CHAIN wins",
    r.kind === "ok" && r.assessmentId === 4, `got ${r.kind}/${r.assessmentId}`);
}

// ── 6. A confirm() that throws is not a refusal on its own, but it must not
//       become a success either. ───────────────────────────────────────────
{
  const r = await settle(HASH, null, {
    previousAssessmentId: null,
    confirm: async () => {
      throw new Error("RPC unreachable");
    },
  });
  check("unreachable confirmation never reports success", r.kind === "rejected",
    `got ${r.kind}`);
}

// ── 7. The refund line has to cope with an unknown amount. ─────────────────
{
  const r = await settle(HASH, null, {
    previousAssessmentId: null,
    confirm: confirmer(null),
  });
  check("unknown refund is null, not a fabricated zero", r.refundWei === null,
    String(r.refundWei));
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log();
process.exit(failures.length === 0 ? 0 : 1);
