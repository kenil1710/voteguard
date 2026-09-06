/**
 * Deploys the VoteGuard BUILD ARTIFACTS — never the readable sources.
 *
 *   node test/deploy.mjs --network=studionet
 *   node test/deploy.mjs --network=bradbury --keystore=mywallet
 *
 * What is on chain is then byte-identical to what deployments.json records a
 * checksum for, which is the only way `python3 tools/verify_onchain.py` can be
 * a meaningful check rather than a formality.
 *
 * Both contracts go out together and the consumer is constructed with the
 * VoteGuard address, because GovernanceConsumer PINS its oracle at construction
 * and has no setter. Deploying them separately would mean either guessing the
 * address in advance or shipping a treasury wired to nothing.
 *
 * WHO SIGNS: without --keystore the plaintext `client` account in
 * .accounts.json signs, which is right for gasless Studionet and wrong for
 * Bradbury. --keystore=<name> unlocks a real GenLayer CLI wallet instead. The
 * signer becomes the OWNER — the account that can pause, price and sweep the
 * contract — so use the funded wallet, not a throwaway.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, argOf, outcomeOf, contractAddressOf, fundOnStudio, retry, sleep } from "./harness.mjs";
import { resolveSigner } from "./keystore.mjs";

const networkName = argOf("network", "studionet");
const chain = CHAINS[networkName];
if (!chain) throw new Error(`unknown network ${networkName}`);
const only = argOf("only", null); // "voteguard" | "consumer"
const oracleArg = argOf("oracle", null);

const VG = new URL("../build/VoteGuard.min.py", import.meta.url);
const GC = new URL("../build/GovernanceConsumer.min.py", import.meta.url);

// The MEASURED ceiling. Sentinel's test/size_gate.py recorded 53,000 accepted
// and 53,500 refused on Bradbury with BlockPubdataLimitReached. Refusing here
// beats discovering it after a four-minute wait.
const BRADBURY_CEILING = 53_000;

const signer = resolveSigner(process.argv, new URL("./.accounts.json", import.meta.url));
const account = createAccount(signer.key);
const wallet = createClient({ chain, account });
const read = createClient({ chain });

console.log(`\nVoteGuard deploy → ${networkName}`);
console.log(`  signer     ${signer.label}`);

if (chain.isStudio) {
  await fundOnStudio(chain, account.address, 100n * 10n ** 18n);
} else {
  const balance = await read.getBalance({ address: account.address });
  const gen = Number(balance) / 1e18;
  console.log(`  balance    ${gen.toFixed(4)} GEN`);
  if (gen < 0.3) {
    console.error(`\nRefusing to start below 0.3 GEN — fund ${account.address}.`);
    process.exit(1);
  }
}

async function deploy(label, url, args) {
  const code = readFileSync(url);
  console.log(`\n  ${label}  ${code.length.toLocaleString()} bytes`);
  if (!chain.isStudio && code.length > BRADBURY_CEILING) {
    console.error(`  ${label} is ${code.length} bytes; Bradbury's measured ceiling is ${BRADBURY_CEILING}.`);
    console.error(`  Re-measure with: python3 test/size_gate.py <size>`);
    process.exit(1);
  }
  const hash = await retry(() => wallet.deployContract({ code, args, leaderOnly: false }),
    { label: `deploy ${label}` });
  console.log(`  tx         ${hash}`);
  const tx = await retry(
    () => wallet.waitForTransactionReceipt({
      hash, status: "ACCEPTED", interval: chain.isStudio ? 1000 : 5000,
      retries: chain.isStudio ? 240 : 200,
    }),
    { label: `settle ${label}` },
  );
  const out = outcomeOf(tx);
  const address = contractAddressOf(tx);
  if (!out.ok || !address) {
    console.error(`  FAILED  ${out.status} ${out.revertReason || out.stderr.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`  address    ${address}`);
  return { address, hash, bytes: code.length };
}

const result = {};
let oracle = oracleArg;

if (only !== "consumer") {
  result.VoteGuard = await deploy("VoteGuard", VG, []);
  oracle = result.VoteGuard.address;
  // The CLI hardcodes value:0n on writes, so a non-zero fee makes
  // analyze_proposal uncallable from the command line. Demo deployments run at
  // zero and say so; the fee path is exercised by the offline suite, which can
  // attach value.
  if (argOf("fee", "0") === "0") {
    const zeroed = await retry(
      () => wallet.writeContract({ address: oracle, functionName: "set_fee", args: [0], value: 0n }),
      { label: "set_fee" },
    );
    await sleep(chain.isStudio ? 2000 : 8000);
    console.log(`  fee        set to 0 (tx ${zeroed.slice(0, 18)}…)`);
  }
}

if (only !== "voteguard") {
  if (!oracle) throw new Error("consumer needs --oracle=0x… when VoteGuard is not deployed in the same run");
  result.GovernanceConsumer = await deploy("GovernanceConsumer", GC, [oracle]);
}

// Record it, without clobbering the rest of the file.
const path = new URL("../deployments.json", import.meta.url);
const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { project: "VoteGuard" };
doc.deployments = doc.deployments ?? {};
const slot = (doc.deployments[networkName] = doc.deployments[networkName] ?? {});
slot.network = networkName;
slot.rpc = chain.rpcUrls.default.http[0];
slot.owner = account.address;
slot.deployed_at = new Date().toISOString();
for (const [name, info] of Object.entries(result)) {
  slot[name] = { address: info.address, deploy_tx: info.hash, artifact_bytes: info.bytes };
}
writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");

console.log(`\nrecorded in deployments.json under "${networkName}"`);
for (const [name, info] of Object.entries(result)) console.log(`  ${name.padEnd(20)} ${info.address}`);
console.log();
