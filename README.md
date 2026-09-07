# VoteGuard

**Every proposal deserves a second opinion.**

An on-chain risk oracle for DAO governance proposals, built on GenLayer. Submit
the URL of any Snapshot, Tally or Discourse-forum proposal; five validators
independently fetch it, apply one fixed rubric, and agree on an assessment
across five dimensions. The result lands on chain with the evidence it was
derived from, so anybody can replay the arithmetic — and any contract can check
the verdict before it executes.

```
                       feasibility   25%   TRIVIAL · STRAIGHTFORWARD · COMPLEX · IMPRACTICAL
                       budget        25%   CONSERVATIVE · REASONABLE · AGGRESSIVE · EXCESSIVE
  proposal URL  ─────▶ centralization 20%  DISTRIBUTED · MODERATE · CONCENTRATED · DANGEROUS  ─────▶  RECOMMEND
                       clarity       15%   CLEAR · ADEQUATE · VAGUE · AMBIGUOUS                        CAUTION
                       alignment     15%   ALIGNED · NEUTRAL · QUESTIONABLE · MISALIGNED               OPPOSE
```

---

## The problem the first probe found

The brief asked for `snapshot.org/#/aave.eth/proposal/0x…`. From validator
egress that URL returns **HTTP 200 and 1,363 bytes** — an empty application
shell, byte-identical for every proposal that has ever existed, because
everything after the `#` never leaves the browser.

That is the most dangerous shape a data source can have: not a 403 that
announces itself, but a **success that carries no information**. A contract that
fetched what the user typed would score an empty page, store a confident-looking
assessment, and be wrong about every proposal in exactly the same way.

So **no submitted URL is ever fetched.** Every URL is parsed into a platform and
an identifier, and the identifier builds a request against an endpoint that
actually carries the proposal. `preview_url` shows both strings, for free,
before anyone pays.

Nine more findings are in [`docs/PROBE.md`](docs/PROBE.md). Six of them changed
the architecture.

---

## How it scores

**Nineteen features are parsed** from the proposal text by ordinary Python —
length, section headers, the largest requested amount and its unit, whether
payment is tranched, whether there is a clawback clause, whether a multisig or
council is named, whether anyone gets sole discretion, whether there is a
revocation path, whether voting parameters are touched, whether placeholders
remain. The body is signed and pinned, so two validators reach the same numbers
with certainty rather than with probability.

**The model contributes five** — one ladder level per dimension — and is fenced
three ways, each checkable by a machine:

1. It picks a **ladder level**, not a score. Every level is an explicit
   condition rather than an adjective.
2. Every level arrives with a **verbatim quote**, and every validator checks that
   28+ consecutive characters of it really occur in the proposal *it* fetched. A
   level whose evidence is not in the text is discarded.
3. The level is **clamped** into a floor and ceiling the parser computed
   independently. Where the evidence is decisive the range collapses and the
   model has no influence at all.

**The verdict is arithmetic, never opinion.** Any dimension at its worst rung
forfeits a RECOMMEND; two of them is an OPPOSE whatever the average says; three
model abstentions forfeit it too.

### Why the fences exist

Five validators asked for five free ordinals settled **zero rounds out of
three**. Collapsing everything to a single three-valued verdict settled **zero
out of four**. Taking a median of three samples per node settled **zero out of
four**. An explicit ladder alone settled **zero out of five**.

The ladder *plus* a normalised quote gate *plus* parser bounds is what makes it
settle — measured, in [`docs/PROBE.md`](docs/PROBE.md) §5.

---

## Composability

```solidity
is_recommended(id)        // soft gate — an unanalysed proposal is NOT recommended
require_recommended(id)   // hard gate — REVERTS unless the verdict is RECOMMEND
get_risk_summary(url)     // verdict, score, worst dimension, flags
```

[`GovernanceConsumer`](contracts/GovernanceConsumer.py) is a working DAO treasury
built on those: it queues payouts against a proposal URL and releases them only
if VoteGuard recommends the proposal. Its oracle is **pinned at construction
with no setter**, and every payout **snapshots** the verdict mode, score floor
and staleness window it was queued under — so moving the defaults can never
reach money already promised.

---

## Verification

Every assessment recomputes from its own stored evidence, on chain:

```bash
genlayer call <VoteGuard> verify_assessment --args 1
# → { verified: true, differences: [], recomputed: {...} }
```

`evidence` is the exact 24-field vector the validators agreed on. The rubric is
a set of module constants no owner can move. Anyone can replay the arithmetic
years later and get the same five numbers, the same labels, the same findings
and the same verdict.

---

## What it does not do

* **It does not price tokens.** The amount is the largest stated quantity near a
  funding phrase, reported with its unit — "1M–10M ARB", never a dollar value.
  A price feed inside a consensus round would make every token-denominated
  proposal unsettleable for a reason unrelated to the proposal.
* **It reads one document.** No discussion threads, no vote history, no linked
  specifications.
* **It never reads votes.** Vote counts, quorum and state are excluded from the
  request the validators make, not merely ignored afterwards.
* **It is not advice.** It is a structured second opinion with its reasoning
  attached. Read the proposal.

---

## Repository

```
contracts/
  VoteGuard.py             the oracle
  GovernanceConsumer.py    a treasury that will not pay out on a bad proposal
  NOTES.md                 design decisions and the measurements behind them
  _render_probe.py         throwaway: what can a validator actually fetch?
  _judge_probe*.py         throwaway: can five nodes agree about a model's reading?
  _bal_probe.py            throwaway: what does this runner expose for a balance?
build/                     the deployed artifacts, plus the pre-mangle source for diffing
docs/PROBE.md              ten findings, six of which changed the architecture
test/
  test_logic.py            315 offline tests, stdlib only
  e2e.mjs                  the live suite — real network, real validators, real proposals
  fixtures.json            verbatim bodies captured from all three platforms
  size_gate.py             measures the deploy ceiling by proving it
tools/build.sh             minify → mangle → checksum
frontend/                  Next.js site
```

## Running it

```bash
python3 test/test_logic.py                       # 315 offline tests, no network
bash tools/build.sh                              # build the artifacts
node test/deploy.mjs --network=studionet         # deploy
node test/e2e.mjs --network=studionet            # the live suite
python3 tools/verify_onchain.py <addr> build/VoteGuard.min.py
```

## Deployments

**Bradbury testnet** — both contracts byte-verified against the artifacts in
`build/`:

| | Address |
|---|---|
| VoteGuard | [`0xE6c5C4E2…06fa3`](https://explorer-bradbury.genlayer.com/address/0xE6c5C4E24529fd445AEb8083729Ca89773806fa3) |
| GovernanceConsumer | [`0x7f5d0a39…E061b`](https://explorer-bradbury.genlayer.com/address/0x7f5d0a398ea506BcfACE622a7139a4c0190E061b) |

Three real governance proposals are assessed on that deployment, each of which
recomputes from its own stored evidence on chain:

| # | Platform | Proposal | Verdict |
|---|---|---|---|
| 1 | Snapshot | Aave — *[ARFC] Deploy Aave V4 on Arc* | RECOMMEND 70/100 |
| 2 | Discourse | Arbitrum — *[Constitutional] AIP Fast Feed* | CAUTION 50/100 |
| 3 | Snapshot | ENS — *[7.1] [Social] SPP3: Marketplace RFP* | RECOMMEND 80/100 |

```bash
genlayer call 0xE6c5C4E24529fd445AEb8083729Ca89773806fa3 verify_assessment --args 3
# → verified: true, differences: []
```

The Tally path is **not** exercised on Bradbury. It is proven on Studionet — the
live suite assessed `tally.xyz/gov/uniswap/proposal/86` as one of its 97 passing
checks — but every Bradbury attempt hit the node's gas-rate limit, and the
225 KB page is the heaviest of the three fetches. Recorded as not done rather
than described as done.

Site: **https://voteguard-sigma.vercel.app**

See [`deployments.json`](deployments.json) for checksums, transaction hashes and
the measured size ceiling.
