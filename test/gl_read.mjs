/**
 * One read from a deployed contract, printed as JSON.
 *
 *   node test/gl_read.mjs --network=bradbury <address> <method> [json-arg ...]
 *
 * This exists because `genlayer call` cannot be relied on for the audit. The
 * globally installed CLI (0.40.0-rc.3 at the time of writing) fails method
 * resolution on EVERY contract on Bradbury — including VoteGuard, whose code
 * has not changed since it last answered — with
 *
 *   ValueError: call to private method `Contract.__handle_undefined_method__`
 *
 * The contracts are fine: the same reads succeed through genlayer-js 1.1.8,
 * which this repository pins in test/package.json. An audit that shells out to
 * whatever `genlayer` happens to be on PATH reports the CLI's health, not the
 * deployment's, and that is exactly the confusion this file removes.
 *
 * Exit 0 and print the result on success; exit 1 and print the error on
 * failure, so a shell can branch on it.
 */
import { createClient } from "genlayer-js";
import { CHAINS, argOf } from "./harness.mjs";

const networkName = argOf("network", "bradbury");
const chain = CHAINS[networkName];
if (!chain) {
  console.error(`unknown network ${networkName}`);
  process.exit(1);
}

const rest = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [address, functionName, ...rawArgs] = rest;
if (!address || !functionName) {
  console.error("usage: node test/gl_read.mjs [--network=name] <address> <method> [args...]");
  process.exit(1);
}

// Arguments arrive as strings. Anything that parses as JSON is passed as that
// value (so numbers stay numbers); anything else is passed verbatim, which is
// what an 0x address needs.
const args = rawArgs.map((a) => {
  try { return JSON.parse(a); } catch { return a; }
});

try {
  const out = await createClient({ chain }).readContract({ address, functionName, args });
  console.log(typeof out === "object" ? JSON.stringify(out, null, 1) : String(out));
} catch (e) {
  console.error(String(e?.shortMessage ?? e).split("\n")[0].slice(0, 200));
  process.exit(1);
}
