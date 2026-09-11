# Design notes

Decisions that are not obvious from the code, and the measurements behind them.
The probe findings themselves live in [`docs/PROBE.md`](../docs/PROBE.md).

---

## 1. Why the submitted URL is never fetched

`snapshot.org/#/<space>/proposal/<0x…>` answers **200 with 1,363 bytes** of
empty application shell, identically for every proposal that has ever existed
(PROBE §1). Fetching what the user typed would produce a confident assessment of
nothing.

Every URL is therefore parsed into `{platform, key, fetch}`, and only `fetch` is
ever requested. `preview_url` returns both so the difference is visible before
anyone pays.

A consequence worth stating: **the space in a Snapshot URL is not trusted.** The
brief's own example names `aave.eth`, which Aave no longer governs from, and the
proposal still resolves — Snapshot ids are globally unique. The authoritative
space comes back from the API and is what gets stored.

---

## 2. The canonical key, and why it is not the URL

| Platform | Key |
|---|---|
| Snapshot | `snapshot:<0x… proposal id>` |
| Tally | `tally:<org>:<n>` |
| Discourse | `discourse:<host>:<topic id>` |

Discourse resolves a topic by id and **ignores the slug completely** — measured,
byte-identical (PROBE §3). Keying on the URL would let one proposal be filed
under unlimited flattering names. The slug never reaches the key, the fetch URL
or the content hash, and the stored title always comes from the document.

---

## 3. What the validators agree on

Twenty-four fields. Nineteen are parsed from the proposal text by ordinary
Python; five are the model's ladder levels.

* **The nineteen parsed fields: exact equality, no tolerance.** They are
  computed from a body that is signed and pinned, so a disagreement there means
  one node read a different document and the round must not settle.
* **The five model fields: three independent checks.** The leader's quote must
  verify verbatim against the text *this* node fetched; the level must sit
  inside the bounds *this* node computed; and the level must be within one rung
  of *this* node's own reading. Abstention on either side hands the dimension to
  the parser, whose answer is a pure function of fields already agreed.

**The one-rung tolerance is real and is published.** Two accepted readings of one
proposal can differ by a rung on a dimension. It is in `get_config`, on `/docs`,
and `get_assessment_history` is where it becomes observable.

It is also not a shortcut. Every stricter rule was measured and **every one of
them settled zero rounds out of three to five** (PROBE §5), including collapsing
the whole thing to a single three-valued verdict. Narrowing the axis to
something a node can actually verify is what makes an on-chain model oracle
settle at all.

---

## 4. The parser sets the bounds; the model picks inside them

Each dimension computes a floor and a ceiling from parsed evidence alone, and
the model's level is clamped into that range.

Where the evidence is decisive the two collapse and **the model has no influence
whatsoever** — a proposal that requests no money cannot be anything but
CONSERVATIVE on budget, which is also exactly what the brief asks for when it
says budget is "only scored if the proposal involves funds".

The ceilings were deliberately loosened after a first pass made them too strong.
A malicious proposal is *well formatted*: it will have a milestone table and
name a multisig. So a ceiling now requires **two independent safeguards**, and
never caps a dimension better than the third rung. The model can always raise an
alarm the parser cannot see.

---

## 5. Scores are banded by rung, not blended

`ORD_BANDS = ((85,100), (60,84), (30,59), (0,29))`. The rung owns the band; the
parsed evidence positions the dimension inside it.

The first version was a weighted blend of rung and evidence, and the corpus
showed why that fails: a 433-character Optimism election notice whose clarity
was VAGUE scored 70 overall and came back RECOMMEND, because "has a link and a
heading" outvoted "a voter cannot tell what this is". Nothing may drag a
dimension out of the rung the reading put it in.

---

## 6. Abstention can never look like excellence

A dimension the model declined to rate is floored at rung 1. The only reading
available for it is structural, and "well formatted" is not the same finding as
"a reader judged this trivial to execute". Three or more abstentions also forfeit
a RECOMMEND outright and drop `confidence` to LOW.

Without that floor the corpus scored an election notice DISTRIBUTED and ALIGNED
at 100 each, purely for containing a link.

---

## 7. Both contracts track their own balance in storage

**This runner has no balance accessor at all** — `gl.contract_balance`,
`gl.balance`, `gl.get_balance` and `gl.message.balance` are every one of them an
`AttributeError` (PROBE §6). Reading one does not return a wrong number; it takes
the whole call down.

The first live deployment had `get_stats`, `get_terms`, `withdraw_fees` and the
treasury's `fund()` all dead for this reason, and the first diagnosis ("a view
cannot read it") was wrong — it fails in writes too.

`balance_wei` is now storage. Every wei in and every wei out passes through it,
the offline suite asserts `balance_wei == total_fees_wei + refunds_owed` across
a lifecycle, and an AST guard fails the build if any source or artifact reaches
for `gl.*balance` again.

---

## 8. Refusal is never confiscation

No payable method raises. `analyze_proposal` and the consumer's `fund` /
`queue_payout` route every rejection through `_reject`, which credits the full
deposit back, claimable with `claim_refund` — which is never gated on pause.

An AST test asserts this over both sources **and both deployed artifacts**,
because the artifact is what actually runs.

`release` on the consumer is deliberately the exception: it is not payable and
it *does* revert, because reverting is the entire point of a hard gate. A caller
that wants a boolean has `preflight` — or, for one already-queued payout with
its authorisation checks included, `preflight_payout` — for free.

The authorisation gate added in §14 keeps this shape: an unauthorised
`queue_payout` is a *rejection with a full refund*, not a revert. Refusing to
let somebody spend the treasury is not a reason to keep the deposit they
attached.

---

## 9. What the owner can and cannot do

Can: set the fee within `0..MAX_FEE_WEI`, pause new analysis, transfer
ownership, withdraw `balance_wei - refunds_owed`. On the treasury: move the
DEFAULT terms, and add or remove a whitelisted queuer (§14).

Cannot: move a weight, a threshold, a ladder or a bucket boundary — they are
module constants; write or alter any stored assessment; block a read, a
verification, a refund or `settle_stalled`; reach a wei of `refunds_owed`. On
the treasury: reach a wei of `committed_wei`, change the terms or the
authorisation of a payout already queued, or stop anyone releasing one — not by
revoking the queuer who queued it, and not by declining to press the button.

Two AST tests enforce the first two: no `_only_owner`-gated method may write a
verdict, score, feed or refund field, and no function anywhere may assign to a
rubric constant.

There is no governance log in the contract. Every owner action is already a
signed transaction on a public explorer with its arguments in the calldata, and
a second in-contract copy of those facts costs 640 bytes of a 52.8 KB budget.

---

## 10. `settle_stalled`

A consensus round that never settles applies no state, so the ordinary case
needs nothing. This exists for the other one: a round that set `pending` and
then died between the write and the delete. Without it that proposal would be
unanalysable forever.

Permissionless, and it works while paused — an owner who could keep a proposal
locked by declining to unstick it would be an owner who can censor the oracle.

---

## 11. `_clean_text` is idempotent on purpose

`_coherent` rejects any string that is not already its own cleaned form.
Truncating after collapsing whitespace can leave a trailing space that a second
clean would strip, so a 400-character excerpt cleaned to 399 and **every
proposal whose excerpt cut at a word boundary would have hung forever**. The
second `_flat` is the fix; an offline test asserts the property directly.

---

## 12. The quote gate checks the text the model was SHOWN

`_judge_text()` produces the capped, defanged slice once, and both the prompt and
the gate use it. Verifying against the raw body instead throws away honest
readings, because `_sanitize` only ever removes characters.

The gate accepts any **28+ character contiguous run**. That cannot be produced
by paraphrase and cannot be invented, but it survives the model tidying
punctuation or joining a clause across a line break — which the first,
whole-quote version did not, and which cost most of the model's contribution on
a typical round.

---

## 13. VoteGuard does not price tokens

`_scan_amounts` reports the largest stated quantity near a funding phrase,
**with its unit**. Converting `2,000 ETH` and `2,000 USDC` to a common unit needs
a price, and a price is exactly the class of field that moves between two
fetches — a price oracle inside a consensus round would make every
token-denominated proposal unsettleable for a reason unrelated to the proposal.

Three parsing rules exist because of three real false positives in a 24-proposal
corpus (PROBE §9), and the funding-phrase table was rewritten after the first
version fired on twenty of those twenty-four.

---

## 14. The treasury path: who may spend, and against what

Reviewer finding, on `GovernanceConsumer`: *"authorize who may queue spending
from existing treasury funds, bind each recipient, amount, and purpose to the
proposal actually assessed, and pin the assessment or immutable evidence digest
used for release so later re-analysis cannot change the authorization."*

Three separate things, and they fail in three different ways.

**Who may spend.** `queue_payout` moves existing treasury funds into a
commitment, which is a privileged act, so it is gated on the owner or an address
the owner has whitelisted with `authorize_queuer`. `release` is deliberately NOT
gated. Pressing the button on a payout the oracle has already approved is not
discretion, and a treasury whose owner can sit on a valid payout has moved the
discretion somewhere less visible rather than removing it. Revoking a queuer
says so in its return value: it reaches future queues only, and the payouts that
address already queued stay releasable by anyone.

**Bound to the proposal assessed.** A queue names an `assessment_id`. The
contract fetches that assessment across the boundary and compares its
`proposal_key` with the key the submitted URL resolves to — the ORACLE's
canonicalisation of both, because this treasury does not parse URLs and must not
start; a second parser is a second answer. Only then are the recipient, the
amount and the purpose recorded against it. A good assessment of the wrong
proposal cannot authorise this payout, and a blank purpose cannot be bound at
all.

**Pinned evidence.** The assessment's `content_hash` — §2's hash of the
canonical key and the parsed feature vector — is copied into the record at queue
time, and `release` refuses unless the assessment governing that proposal still
hashes to it. This closes the replay: analyse, queue against a good result,
re-analyse into a different one, release on the stale authorisation. The test
that matters is the one where the *re-analysis still says RECOMMEND* and the
release still fails; a verdict check would pass it, and only the digest catches
it.

The digest is the authority, not the id. A re-run that lands on the identical
feature vector has changed nothing that was authorised and still releases;
anything else invalidates the authorisation, and the way forward is a new queue
against the assessment that holds now, granted by somebody who may grant one.

**Release states its terms.** `release(payout_id, recipient, amount_wei,
assessment_id)` — the last three are not inputs to the decision, the record
holds all three and the record is the authority. They are an assertion, so a
caller whose idea of the payout has drifted gets a revert instead of a surprise
transfer.

**And none of it can freeze money.** If a re-analysis strands a payout, the
commitment is still recoverable: `cancel_payout` frees it for the queuer or the
owner. Pinning buys safety, not a lock.

---

## 15. Known limits

* **One document.** Discussion threads, vote history and linked specifications
  are not read. A proposal is judged on its own terms.
* **English.** The ladder is written in English and the quote gate compares
  ASCII after normalisation.
* **A one-rung spread.** See §3. Bounded, published, and visible in the history.
* **The corpus is Snapshot-heavy.** The rubric was calibrated against 24 real
  proposals from eight DAOs, all fetched from Snapshot; the Tally and Discourse
  paths were verified live but contributed fewer calibration samples.
* **No cross-proposal reasoning.** Two proposals that only conflict with each
  other will each read as fine.
