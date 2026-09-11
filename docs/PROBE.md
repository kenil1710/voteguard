# Probe findings — Studionet, captured 2026-09-06

Throwaway contracts [`contracts/_render_probe.py`](../contracts/_render_probe.py),
[`contracts/_judge_probe.py`](../contracts/_judge_probe.py),
[`contracts/_judge_probe2.py`](../contracts/_judge_probe2.py) and
[`contracts/_bal_probe.py`](../contracts/_bal_probe.py). Every fetch, every
consensus rule and every storage decision in VoteGuard is written against what
is measured below, never against an assumption about how a governance platform
or the GenVM runner behaves.

The probes ran **before** a line of the contract was written, and kept running
whenever a live deployment disagreed with them. Six of the nine findings changed
the architecture; two of them were found only because a probe contradicted a
result the probe itself had produced an hour earlier.

Probe deployments on Studionet:
`0x8c1Ad89e6617c19A075EEB41DeECD1414525AB1a`,
`0x236A2354A63674e6579C1301Fd96B0A0644c67b2`,
`0xc6cF8Ff315099F96D41830D8C369638a2e3EE313`,
`0x6a3ADfe31D3a5B42aabD318DF332be5aBBe63915`,
`0x3b4E4F96193Db479c1dc945B84572C5137C36980`,
`0xf6eFc32c3c12D9CdaE7e79e9a51CDD6f44EfB3B4`,
`0x6bEc8c862312dd995E6Af782A647468B3434eBa9`,
`0xC26c6Db23A6Be4F85410C9cB0A75046114ab83d0`.

---

## 1. The URL in the brief returns 200 and contains nothing

The brief asks for `snapshot.org/#/aave.eth/proposal/0x…`. From validator
egress:

| URL | Status | Bytes |
|---|---|---|
| `snapshot.org/#/aave.eth/proposal/0x12d0…` | **200** | **1,363** |
| `snapshot.org/#/aavedao.eth/proposal/0x12d0…` | **200** | **1,363** |
| `snapshot.box/#/s:aavedao.eth/proposal/0x12d0…` | **200** | **1,363** |

The three bodies are **byte-identical**, and none of them contains the word
"Aave". Snapshot is a hash-routed single-page application: everything after the
`#` never leaves the browser, so the server sees `GET /` for every proposal that
has ever existed and answers with the same application shell.

This is the most dangerous shape a data source can have. It is not a 403 that
announces itself, nor a 404 that can be handled — it is a **success that looks
like success** and carries no information. A contract that fetched the submitted
URL would score an empty page, store a confident-looking assessment, and be
wrong about every proposal in exactly the same way.

**So no submitted URL is ever fetched.** Every URL is parsed into a platform and
an identifier, and the identifier builds a request against a document endpoint
that actually carries the proposal. `preview_url` shows both strings side by
side, because the difference between them is the whole first design decision.

`web.render(mode="text")` *can* see through the SPA — it returned 8,545
characters of real proposal — but the rendered text carries live vote totals and
relative timestamps (`100 votes · Ended 10m ago`, `4d ago`). Those move between
two fetches seconds apart, so rendering the page would import a consensus
problem to solve a fetching problem that the GraphQL hub does not have.

---

## 2. What each platform actually answers, from validator egress

| Endpoint | Status | Bytes | Verdict |
|---|---|---|---|
| `hub.snapshot.org/graphql?query=…` | 200 | 10,580 | **the Snapshot source** |
| `www.tally.xyz/gov/uniswap/proposal/86` | 200 | 225,556 | **the Tally source** |
| `forum.arbitrum.foundation/t/…/31003.json` | 200 | 85,708 | **the Discourse source** |
| `governance.aave.com/t/…/25170.json` | 200 | 50,231 | Discourse, second host |
| `api.tally.xyz/query` | **401** | 85 | `{"message":"api key required"}` |

**Tally is not blocked.** Its public page reaches validators intact — 225,556
bytes, byte-for-byte the same length a laptop sees. What is unavailable is
`api.tally.xyz`, which returns 401 without a key, and a contract cannot hold a
key: it would be readable by anyone who can read the chain. So Tally is read
from the page's own `__NEXT_DATA__` payload, where
`props.pageProps.proposal.metadata.description` carries the full proposal text.

`web.render` on Tally returns only **2,124 characters** — the description sits
behind a tab that never expands — so the rendered form is strictly worse than
the raw HTML here, the opposite of the Snapshot case.

Snapshot's GraphQL hub also carries `ipfs`, the content CID of the signed
proposal. It is stored beside every Snapshot assessment as an immutable anchor.

---

## 3. Discourse ignores the slug entirely

| URL | Status | Bytes |
|---|---|---|
| `/t/constitutional-aip-fast-feed/31003.json` | 200 | 85,708 |
| `/t/totally-made-up-slug/31003.json` | 200 | **85,708** |
| `/t/31003.json` | 200 | **85,708** |

All three are the same bytes. Discourse resolves a topic by its numeric id and
treats the slug as decoration.

That is a **spoofing surface**, not a curiosity. If the contract keyed records
on the submitted URL, one proposal could be filed under an unlimited number of
distinct-looking names — including flattering ones — and a reader skimming a
list would see `…/t/routine-parameter-update/31003` next to a clean assessment
of a topic actually titled *"Transfer 6,000 ETH from the treasury"*.

So the slug never reaches the storage key, the fetch URL or the content hash,
and **the stored title always comes from the fetched document**. The offline
suite asserts this against both captured bodies.

The same reasoning applies to Snapshot from the opposite direction: the brief's
own example names `aave.eth`, a space Aave no longer governs from — it moved to
`aavedao.eth` — and yet the proposal id in that URL resolves perfectly, because
Snapshot ids are globally unique. The space in the URL is not trusted and does
not reach the key; it is read back from the API answer.

---

## 4. A `0x…` string argument is silently coerced to an integer

This one invalidated sixteen consecutive measurements before it was found.

`probe_judge(pid: str, …)` was called with the proposal id
`0x12d0143db33efe0754cab4d89ba9ba7ae23e7e1b77817ba7fc79a35c382280ec`. Inside the
contract, `pid` arrived as:

```
8509275162333195176330195402896210387928812071102999247335611068528940187884
```

The client encoded the hex-looking string as a **bigint**, despite the parameter
being declared `str`. The GraphQL hub answered `{"data":{"proposal":null}}` with
a 200, the leader returned an error object, and every validator voted DISAGREE
because there was no vector to compare against.

**Sixteen rounds of "the model cannot agree with itself" were sixteen rounds of a
broken fetch.** The lesson is not about the CLI: it is that a consensus failure
and an input-encoding failure look identical from the outside, and the only way
to tell them apart is to make the leader report what it actually received.
`probe_build` did that in one transaction.

VoteGuard is unaffected in production because its public methods take **URLs**,
which carry `/` and `:` and cannot be coerced. No public method takes a bare hex
string, and the offline suite asserts it.

---

## 5. The consensus experiment, re-run correctly

With the fetch fixed, three comparison rules were measured on the same real
proposal (Aave's *Deploy V4 on Arc*, 9,836 characters), five validators per
round:

| Rule | What is compared | Rounds settled |
|---|---|---|
| five free ordinals, no ladder | exact equality on 5 × 0–3 | **0 / 3** |
| one derived verdict | RECOMMEND / CAUTION / OPPOSE | **0 / 4** |
| five ordinals, median of 3 samples per node | exact equality | **0 / 4** |
| five ordinals with an explicit ladder | exact equality | **0 / 5** |

Every rule failed, and typically with **no validator agreeing at all** — not a
near miss. Collapsing five dimensions to a single three-valued verdict did not
help, which rules out "too many fields" as the explanation.

Sampling the leader's own vector across rounds (a probe whose validator accepts
unconditionally, so a different node leads each time) showed why: nodes were
returning genuinely different readings, and the quote gate was rejecting most of
them for reasons that had nothing to do with honesty — the model reads
`**Summary**` and quotes `Summary`, and a raw substring test calls that a
hallucination.

**Three changes, each measured, made it settle:**

1. **An explicit ladder** — every level is a checkable condition, not an
   adjective. A judge becomes a classifier.
2. **A normalised, windowed quote gate** — both sides stripped of markdown, and
   a match is any 28+ character contiguous run. Still impossible to fake by
   paraphrase; no longer defeated by formatting.
3. **Parser bounds** — nineteen features parsed from the immutable proposal text
   compute a floor and a ceiling, and the model's level is clamped into them.
   Where the evidence is decisive the range collapses to one value and the model
   has no influence at all.

The shipped rule compares the nineteen parsed fields **exactly**, and the five
model fields by three independent checks: the quote verifies verbatim against
the text *this* node fetched, the level sits inside the bounds *this* node
computed, and the level is within one rung of *this* node's own reading.

On the first live run against the real contract:

```
analyze_proposal → validator_votes_name: [AGREE, DISAGREE, DISAGREE, AGREE, AGREE]
                   status_name: 'ACCEPTED'
```

and on the live suite, all three platforms settled — Snapshot in 6s, Discourse
in 7s, Tally in 18s — with **5/5 dimensions carrying a verified quote**.

The one-rung tolerance is real and is stated in `get_config`, in the docs page
and in the contract's own comments. Two accepted readings of one proposal can
differ by a rung on a dimension. `get_assessment_history` is where that becomes
visible rather than merely disclosed.

---

## 6. This runner has no contract-balance accessor. At all.

`contracts/_bal_probe.py` asked directly:

```
gl.contract_balance   → AttributeError: module 'genlayer.gl' has no attribute 'contract_balance'
gl.balance            → AttributeError
gl.get_balance        → AttributeError
gl.message.balance    → AttributeError: 'MessageType' object has no attribute 'balance'
```

`dir(gl)` carries nothing balance-shaped. `gl.message` exposes exactly
`chain_id, contract_address, count, index, origin_address, sender_address, value`.

This was found the expensive way. The first live deployment had `get_stats`,
`get_terms`, `withdraw_fees` and the treasury's `fund()` **all dead**, and the
first diagnosis — "a view cannot read the balance" — was wrong: it fails in
writes too. Reading it is not a wrong number, it is an `AttributeError` that
takes the whole call down.

Both contracts now track `balance_wei` in storage. Every wei in and every wei
out passes through one field, and the offline suite asserts the invariant that
`balance_wei == total_fees_wei + refunds_owed` across a full lifecycle. An AST
guard fails the build if any source or artifact ever reaches for `gl.*balance`
again.

This is strictly better than the API that does not exist: the balance is now
explicit, auditable and reconstructible from the record.

---

## 7. `_clean_text` must be idempotent, or the round hangs

`_coherent` rejects any string that is not already its own cleaned form —
otherwise a leader could offer text the contract would never have produced.

The first version truncated *after* collapsing whitespace:

```python
return _flat("".join(out))[:n]
```

A 400-character excerpt cut at a word boundary ends in a space, and `_flat`
strips it — so cleaning a stored 400-character excerpt returned 399 characters,
the coherence gate rejected the leader, and **every proposal whose excerpt
happened to cut mid-space would have hung forever**, for a reason no reader
could see. The offline suite found it before a network did: leader and validator
agreed on every number and still could not settle.

The fix is one extra `_flat` after the truncation. The test that caught it now
asserts idempotence directly.

---

## 8. The quote gate must check the text the model was SHOWN

`_judge` shows the model `_sanitize(_short(body, JUDGE_CHARS))` — capped, then
stripped of anything that could forge the fence. The first version verified the
returned quote against the **raw** body.

`_sanitize` only ever removes characters, so a fragment copied faithfully out of
what the model was given can fail to be a substring of what it was not given. An
honest reading was thrown away as a hallucination.

`_judge_text()` now produces the text once and both the prompt and the gate use
it. Again caught offline, by two nodes that agreed on everything and still could
not settle.

---

## 9. Three false positives that the amount scanner had to be built around

`_scan_amounts` reads the largest stated quantity. Run over a corpus of 24 real
proposals from eight major DAOs, the first version produced:

| Proposal | Reported | Actually |
|---|---|---|
| Balancer BIP-926 | **13,156,000,000,000** | `6e13156b-f5d5-…`, a uuid in a link — `13156` read as a number and the `b` after it as "billion" |
| Optimism Special Voting Cycle **#9b** | **9,000,000,000** | the `9b` in the title, on a 450-character election notice |
| Lido 0x02 CSM | **2,048 ETH** | a validator's maximum effective balance under EIP-7251 — a protocol constant nobody is being asked to pay |

Three rules, one per failure:

1. **A digit run that continues an alphanumeric token is an identifier**, not a
   quantity — uuids, EIP numbers, hex blobs.
2. **A multiplier alone is not money.** `k`/`m`/`b` scales a quantity; it cannot
   establish that the quantity is one. A currency symbol or a ticker must be
   present.
3. **The quantity must sit within 160 characters of a funding phrase.**

The same corpus also killed the first `FUND_WORDS` table, which contained
`"request"`, `"treasury"` and `"budget"` and therefore fired on **twenty of the
twenty-four** proposals — including Aave's *Deploy V4 on Arc*, which asks for
nothing and was scored EXCESSIVE on budget as a result. Every governance
proposal mentions the treasury; almost none of them is asking for it.

**VoteGuard does not price tokens, and does not claim to.** Converting `2,000
ETH` and `2,000 USDC` to a common unit needs a price feed, and a price is
exactly the class of field that moves between two fetches — a price oracle
inside a consensus round would make every token-denominated proposal
unsettleable for a reason unrelated to the proposal. The contract reports the
largest stated quantity **with its unit** and leaves proportionality to the
model, where being approximately right is allowed.

---

## 10. The deploy ceiling, re-measured rather than inherited

`test/size_gate.py` deploys a comment-padded contract to an exact byte size and
reads a value back. A size that deploys and answers is a size that works;
anything else is the ceiling. Measured on Bradbury, 2026-09-06:

| Bytes | Outcome |
|---|---|
| **52,804** | **ACCEPTED** — `0x96967A9187008F49C0F9DE06646E7a915ea7EB4d` |
| 53,200 | **REFUSED** — `BlockPubdataLimitReached` |

Sentinel had recorded 53,000 accepted on the same network. The gap between the
two runs is exactly the kind of drift that turns an inherited constant into a
four-minute deploy that ends in a rejection, which is why this was re-measured
for this project rather than assumed to still hold.

`VoteGuard.min.py` ships at **52,582 bytes**, and the offline suite gates on a
52,700-byte budget — under the largest proven size, with room for a change,
because an artifact that fits by zero bytes is an artifact nobody can edit.

Getting under that ceiling cost real functionality, and the trade-offs are
recorded rather than hidden: the in-contract governance log came out (every
owner action is already a signed transaction on a public explorer), the stored
leaderboard came out (`get_proposals` already returns every row with its score,
so ordering is the caller's to do — and filtering by flag, which the frontend
now offers, is something a fixed top-K could never have supported), and the
corpus-wide flag counter came out in favour of putting `flags` on every row.

---

## 11. `genlayer call` is not a reliable witness; the pinned client is

Measured 2026-09-11, while auditing the redeployed treasury. The globally
installed CLI, `genlayer 0.40.0-rc.3`, fails **every** read on Bradbury:

```
$ genlayer call <GovernanceConsumer> get_terms
ValueError: call to private method `Contract.__handle_undefined_method__`
            call to private method `Contract.__receive__`
```

The first instinct is that the new deployment is broken. It is not, and the
control proves it: the **same error comes back from VoteGuard**, whose code has
not changed since the day it answered `get_config` for this same audit, and
which `tools/verify_onchain.py` still confirms is byte-identical to
`build/VoteGuard.min.py`. A failure that reproduces on an untouched contract is
not a property of the contract under test.

The same two reads succeed immediately through **genlayer-js 1.1.8**, which
`test/package.json` pins:

```
ORACLE   get_config : OK  rubric_version 1.0.0
CONSUMER get_terms  : OK  queue_is_permissioned true, release_is_permissionless true
```

So the runner resolves these methods perfectly well; the release-candidate CLI
encodes the call in a way this runner rejects. `tools/audit.sh --network=…`
therefore reads through `test/gl_read.mjs` and the pinned library, not through
whatever `genlayer` happens to be on PATH — an audit that shells out to an
unpinned binary reports the binary's health, not the deployment's, and would
have reported a perfectly good treasury as dead on arrival.

The lesson generalises past this one CLI: **a verification tool needs a control
as much as the thing it verifies does.** One unchanged contract in the same
audit run is enough to tell a chain problem from a client problem.

---

## Reproducing this

```bash
genlayer network set studionet
genlayer deploy --contract contracts/_render_probe.py
P=<address>
V=0x12d0143db33efe0754cab4d89ba9ba7ae23e7e1b77817ba7fc79a35c382280ec

# 1. the brief's URL, and the endpoints that actually carry a proposal
genlayer write $P probe_statuses --args "[\"https://snapshot.org/#/aave.eth/proposal/$V\",
  \"https://www.tally.xyz/gov/uniswap/proposal/86\",
  \"https://forum.arbitrum.foundation/t/constitutional-aip-fast-feed/31003.json\",
  \"https://api.tally.xyz/query\"]"
genlayer call $P get_statuses

# 2. can a headless browser see through the SPA, and at what cost
genlayer write $P probe_render --args "[\"https://snapshot.org/#/aavedao.eth/proposal/$V\"]" "6s"

# 3. THE consensus question, per platform
genlayer write $P probe_projection --args "snapshot" "https://hub.snapshot.org/graphql?query=…"

# 4. the model, and whether five nodes agree about it — pass a URL, never a
#    bare 0x id (see finding 4)
genlayer deploy --contract contracts/_judge_probe2.py
J=<address>
genlayer write $J probe_judge3 --args "https://snapshot.org/#/x/proposal/$V" "full" 1
genlayer write $J probe_quotes  --args "https://snapshot.org/#/x/proposal/$V"

# 5. what the runner exposes for a contract's own balance (spoiler: nothing)
genlayer deploy --contract contracts/_bal_probe.py
genlayer write <address> probe && genlayer call <address> get

# 6. finding 11 — the CLI fails where the pinned client succeeds. Run BOTH
#    against the unchanged oracle, not only against the contract you suspect.
genlayer call 0xE6c5C4E24529fd445AEb8083729Ca89773806fa3 get_config     # fails
(cd test && node gl_read.mjs 0xE6c5C4E24529fd445AEb8083729Ca89773806fa3 get_config)  # works
```

The probe contracts are kept in the repository deliberately. They are not part
of VoteGuard and are not deployed with it, but they are the evidence for why the
contract fetches what it fetches, compares what it compares, and stores its own
balance.
