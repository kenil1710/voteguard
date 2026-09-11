# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# GovernanceConsumer — a DAO treasury that will not pay out on a proposal
# VoteGuard did not recommend.
#
# This is the composability half of the project, and it exists to make one claim
# concrete: an on-chain risk assessment is only worth something if a CONTRACT
# can act on it without a human in the loop. So this is a real treasury. It
# holds GEN, it queues payouts against a proposal URL, and `release` reads
# VoteGuard across the call boundary and either pays or refuses.
#
# THE ORACLE IS PINNED AT CONSTRUCTION AND CAN NEVER BE MOVED. There is no
# set_oracle. A treasury whose owner can repoint it at a friendlier oracle after
# the money is queued has not delegated the decision, it has delayed it — and
# every guarantee below would be a guarantee about whichever contract the owner
# felt like naming at release time.
#
# EVERY TERM IS SNAPSHOTTED WHEN THE PAYOUT IS QUEUED. The required verdict, the
# minimum score, the maximum staleness and the oracle address are all copied
# into the record at queue time, and `release` reads the record's copy. The
# owner can move the DEFAULTS for payouts queued afterwards and says so in the
# return value; a payout already queued settles on the terms it was queued
# under. This is the PredictStake lesson applied to governance: a beneficiary
# who accepted a set of conditions cannot have them changed underneath them.
#
# QUEUEING IS AUTHORISED; RELEASING IS NOT. Spending existing treasury funds is
# a privileged act, so `queue_payout` is gated on the owner or an explicitly
# whitelisted DAO address. Pressing the button on a payout that is already
# authorised is NOT privileged — `release` stays permissionless, because the
# oracle decides and a treasury whose owner can sit on a valid payout has only
# moved the discretion somewhere less visible.
#
# EVERY PAYMENT TERM IS BOUND TO THE ASSESSMENT IT WAS AUTHORISED AGAINST. A
# queue names an assessment id, and the contract checks ACROSS THE BOUNDARY that
# the id really is an assessment of the proposal being funded before it records
# the recipient, the amount and the purpose against it. A payout for one
# proposal can never be settled on another proposal's analysis.
#
# THE EVIDENCE DIGEST IS PINNED AT QUEUE TIME. VoteGuard's content_hash — the
# hash of the canonical proposal key and the parsed feature vector — is copied
# into the record when the payout is queued, and `release` refuses unless the
# assessment governing that proposal STILL hashes to it. This closes the replay
# the reviewer named: analyse, queue against a good result, re-analyse into a
# different one, then release on the stale authorisation. A re-analysis that
# reaches the same evidence digest is not a change and still releases; one that
# reaches a different digest invalidates the authorisation and the payout has to
# be queued again, against the assessment that actually holds.
#
# REFUSAL IS NEVER CONFISCATION. `fund` and `queue_payout` are payable and
# neither raises: a rejected queue — including a queue from an unauthorised
# caller, or against the wrong assessment — credits the sender in full,
# claimable with claim_refund. `release` is NOT payable and DOES revert,
# deliberately — that is the whole point of require_recommended, and a caller
# that wanted a boolean has preflight() and preflight_payout() for free.
#
# AN INVALIDATED PAYOUT IS NOT A FROZEN ONE. If a re-analysis strands a queued
# payout, cancel_payout still frees the commitment for the queuer or the owner,
# so no amount of oracle churn can lock treasury funds permanently.

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone

import json
import typing

MAX_URL = 400
MAX_MEMO = 200
MAX_QUEUED = 400
MAX_QUEUERS = 50
MAX_DIGEST = 80

# Defaults for payouts queued from here on. Each is copied into the record.
DEFAULT_MIN_SCORE = 70
DEFAULT_MAX_AGE = 30 * 86400      # an assessment older than this is stale
MIN_ALLOWED_SCORE = 1             # zero would mean "any assessment at all"
MAX_ALLOWED_AGE = 365 * 86400

# The verdicts this treasury will accept, weakest last. RECOMMEND is the only
# safe default; CAUTION is offered because some treasuries genuinely do want to
# fund a flagged proposal and should have to say so explicitly.
ACCEPTED_MODES = ("RECOMMEND", "RECOMMEND_OR_CAUTION")

ERR = "[EXPECTED]"

STATUS_QUEUED = "QUEUED"
STATUS_RELEASED = "RELEASED"
STATUS_CANCELLED = "CANCELLED"


def _flat(s: str) -> str:
    return " ".join(str(s).split())


def _short(s: str, n: int) -> str:
    s = str(s)
    return s[:n] if len(s) > n else s


def _clean(s: typing.Any, n: int) -> str:
    out = []
    for ch in str(s):
        out.append(ch if 32 <= ord(ch) < 127 else " ")
    return _flat(_flat("".join(out))[:n])


def _as_int(v: typing.Any, fallback: int) -> int:
    if isinstance(v, bool) or not isinstance(v, int):
        return fallback
    return int(v)


def _accepts(mode: str, verdict: str) -> bool:
    """The one definition of 'good enough'. preflight and release both call it,
    so what the preview promises and what the payout enforces cannot drift."""
    if str(verdict) == "RECOMMEND":
        return True
    return str(mode) == "RECOMMEND_OR_CAUTION" and str(verdict) == "CAUTION"


@gl.contract_interface
class IVoteGuard:
    """VoteGuard's public surface, as this consumer uses it. Type stubs only —
    at runtime this is what the handle resolves to.

    `require_recommended` is deliberately NOT used by `release`. It reverts with
    VoteGuard's own message, which is the right primitive for a caller that
    wants one line of integration — and it is exactly what `strict_release`
    below demonstrates. `release` reads the record instead, because it has to
    apply THIS treasury's snapshotted terms (a score floor, a staleness window,
    and possibly a CAUTION tolerance) on top of the verdict."""

    class View:
        def get_risk_summary(self, proposal_url: str) -> typing.Any: ...

        def require_recommended(self, assessment_id: int) -> typing.Any: ...

        def get_config(self) -> typing.Any: ...

        # The full record for ONE id, which is the only read that carries the
        # content_hash this treasury pins. get_risk_summary answers about a URL
        # and always describes the LATEST analysis of it, so it can tell you
        # what the oracle thinks now but never what it thought when the money
        # was authorised.
        def get_assessment(self, assessment_id: int) -> typing.Any: ...

    class Write:
        pass


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class Payout:
    payout_id: u32
    # --- the payment terms, bound to the assessment below at queue time
    proposal_url: str
    proposal_key: str
    memo: str
    recipient: Address
    amount_wei: u256
    proposer: Address
    status: str
    queued_at: u64
    settled_at: u64
    # --- terms, frozen at queue time
    oracle: Address
    mode: str
    min_score: u32
    max_age: u64
    # --- the AUTHORISATION, pinned at queue time. `evidence_digest` is
    # VoteGuard's content_hash for `assessment_id`; release refuses unless the
    # assessment governing this proposal still hashes to it.
    assessment_id: u32
    evidence_digest: str
    queued_verdict: str
    queued_score: u32
    # --- what the oracle said at release
    verdict: str
    score: u32
    settled_assessment_id: u32
    reason: str


class GovernanceConsumer(gl.Contract):
    owner: Address
    oracle: Address
    mode: str
    min_score: u32
    max_age: u64

    # Who may spend from the treasury. The owner always may; these are the DAO
    # addresses the owner has additionally whitelisted. The list exists so the
    # whitelist can be ENUMERATED rather than only probed one address at a
    # time — a permission nobody can list is a permission nobody audits.
    queuers: TreeMap[Address, bool]
    queuer_list: DynArray[Address]

    payouts: DynArray[Payout]
    # Tracked in STORAGE. This runner exposes no balance accessor at all —
    # `gl.contract_balance` is an AttributeError, and so is every other
    # spelling (measured: contracts/_bal_probe.py). Every wei in and every wei
    # out passes through this one field.
    balance_wei: u256
    committed_wei: u256
    refund_wei: TreeMap[Address, u256]
    refunds_owed: u256

    total_queued: u256
    total_released_wei: u256

    def __init__(self, oracle: str):
        self.owner = gl.message.sender_address
        # Pinned here, for the life of the contract. There is no setter.
        self.oracle = Address(str(oracle))
        self.mode = ACCEPTED_MODES[0]
        self.min_score = u32(DEFAULT_MIN_SCORE)
        self.max_age = u64(DEFAULT_MAX_AGE)
        self.balance_wei = u256(0)
        self.committed_wei = u256(0)
        self.refunds_owed = u256(0)
        self.total_queued = u256(0)
        self.total_released_wei = u256(0)

    # --- internals

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR + " owner only")

    def _listed(self, who: Address) -> bool:
        for i in range(len(self.queuer_list)):
            if self.queuer_list[i] == who:
                return True
        return False

    def _may_queue(self, who: Address) -> bool:
        """Who is allowed to promise treasury money.

        The owner always is. Everyone else has to have been whitelisted, and
        the whitelist is a TreeMap with a SCALAR value type — a missing key
        answers False, not None, so this is a presence check that cannot be
        written as `is not None` by accident."""
        if who == self.owner:
            return True
        return bool(self.queuers.get(who) or False)

    def _credit(self, who: Address, amount: int) -> None:
        if amount <= 0:
            return
        self.refund_wei[who] = u256(int(self.refund_wei.get(who) or 0) + amount)
        self.refunds_owed = u256(int(self.refunds_owed) + amount)

    def _reject(self, reason: str) -> dict:
        self._credit(gl.message.sender_address, int(gl.message.value))
        return {"status": "REJECTED", "reason": _short(reason, 200),
                "refund_wei": int(gl.message.value)}

    def _free(self) -> int:
        """Balance not already promised to a queued payout or owed as a refund.
        Everything that spends money asks this first, and so does every view
        that reports it — the figure comes from storage, so a read is a read."""
        free = (int(self.balance_wei) - int(self.committed_wei)
                - int(self.refunds_owed))
        return free if free > 0 else 0

    def _summary(self, oracle: Address, url: str) -> dict:
        """Read VoteGuard across the call boundary. A dead or wrong-shaped
        oracle answers `known: False`, which REFUSES the payout — an oracle that
        cannot be reached must never read as an approval."""
        try:
            got = IVoteGuard(oracle).view().get_risk_summary(str(url))
        except Exception:
            return {"known": False, "verdict": "UNREACHABLE"}
        if not isinstance(got, dict):
            return {"known": False, "verdict": "UNREADABLE"}
        return got

    def _assessment(self, oracle: Address, assessment_id: int) -> dict:
        """One assessment BY ID, read across the call boundary.

        This is the read that carries content_hash, and it is the only one that
        can answer 'what did the oracle say when this money was authorised' —
        get_risk_summary is keyed on a URL and therefore always describes the
        newest analysis of it. An unreachable or wrong-shaped oracle answers
        `found: False`, which refuses; an oracle that cannot be read must never
        read as an approval."""
        try:
            got = IVoteGuard(oracle).view().get_assessment(
                _as_int(assessment_id, -1))
        except Exception:
            return {"found": False, "reason": "oracle unreachable"}
        if not isinstance(got, dict):
            return {"found": False, "reason": "oracle returned an unreadable "
                                              "shape"}
        return got

    def _digest_of(self, rec: dict) -> str:
        return _clean(rec.get("content_hash"), MAX_DIGEST)

    def _view(self, p: Payout, now: int) -> dict:
        return {
            "payout_id": int(p.payout_id),
            "proposal_url": str(p.proposal_url),
            "proposal_key": str(p.proposal_key),
            "memo": str(p.memo),
            # The same string under the name the reviewer used for it. A memo
            # that decides whether money moves is a purpose, not a note.
            "purpose": str(p.memo),
            "recipient": str(p.recipient.as_hex),
            "amount_wei": int(p.amount_wei),
            "proposer": str(p.proposer.as_hex),
            "status": str(p.status),
            "queued_at": int(p.queued_at),
            "settled_at": int(p.settled_at),
            "age_seconds": now - int(p.queued_at),
            "terms": {"oracle": str(p.oracle.as_hex), "mode": str(p.mode),
                      "min_score": int(p.min_score),
                      "max_age_seconds": int(p.max_age)},
            # The authorisation this payout was granted under, and the only
            # thing release will settle against.
            "authorization": {
                "assessment_id": int(p.assessment_id),
                "evidence_digest": str(p.evidence_digest),
                "proposal_key": str(p.proposal_key),
                "verdict_at_queue": str(p.queued_verdict),
                "score_at_queue": int(p.queued_score),
                "recipient": str(p.recipient.as_hex),
                "amount_wei": int(p.amount_wei),
                "purpose": str(p.memo),
            },
            "assessment_id": int(p.assessment_id),
            "evidence_digest": str(p.evidence_digest),
            "verdict": str(p.verdict),
            "score": int(p.score),
            "settled_assessment_id": int(p.settled_assessment_id),
            "reason": str(p.reason),
        }

    def _get(self, payout_id: int) -> typing.Any:
        i = _as_int(payout_id, -1)
        if i < 0 or i >= len(self.payouts):
            return None
        return self.payouts[i]

    # --- funding

    @gl.public.write.payable
    def fund(self) -> typing.Any:
        """Top the treasury up. Anyone may."""
        self.balance_wei = u256(int(self.balance_wei) + int(gl.message.value))
        return {"status": "OK", "added_wei": int(gl.message.value),
                "balance_wei": int(self.balance_wei),
                "uncommitted_wei": self._free()}

    # --- the composability primitive, in its two shapes

    @gl.public.view
    def preflight(self, proposal_url: str) -> typing.Any:
        """What release() WOULD do, for free, under the CURRENT defaults.

        A caller that wants a boolean uses this. A caller that wants its own
        transaction to fail uses strict_release. Both read the same oracle and
        the same _accepts rule, so the preview cannot promise what the payout
        would refuse."""
        s = self._summary(self.oracle, proposal_url)
        now = self._now()
        known = bool(s.get("known"))
        verdict = str(s.get("verdict", "UNKNOWN"))
        score = _as_int(s.get("score"), 0)
        age = _as_int(s.get("age_seconds"), 0)
        reasons = []
        if not known:
            reasons.append("no assessment on record")
        else:
            if not _accepts(str(self.mode), verdict):
                reasons.append("verdict is " + verdict + ", this treasury "
                               "requires " + str(self.mode))
            if score < int(self.min_score):
                reasons.append("score " + str(score) + " is below the required "
                               + str(int(self.min_score)))
            if age > int(self.max_age):
                reasons.append("assessment is " + str(age) + "s old, older "
                               "than the " + str(int(self.max_age)) + "s limit")
        return {
            "would_release": len(reasons) == 0,
            "proposal_url": _short(str(proposal_url), MAX_URL),
            "known": known, "verdict": verdict, "score": score,
            "age_seconds": age,
            "worst_dimension": str(s.get("worst_dimension", "")),
            "worst_label": str(s.get("worst_label", "")),
            "flags": s.get("flags") if isinstance(s.get("flags"), list) else [],
            "title": str(s.get("title", "")),
            "dao": str(s.get("dao", "")),
            "blockers": reasons,
            "terms": {"oracle": str(self.oracle.as_hex), "mode": str(self.mode),
                      "min_score": int(self.min_score),
                      "max_age_seconds": int(self.max_age)},
        }

    @gl.public.view
    def strict_release(self, assessment_id: int) -> typing.Any:
        """The one-line integration: REVERTS unless VoteGuard says RECOMMEND.

        This is `require_recommended` reached across the contract boundary, and
        it is the whole composability claim in a single call — a treasury does
        not have to remember to check a boolean, because the transaction simply
        fails. It applies VoteGuard's verdict and nothing of this treasury's
        own terms, which is why the queued-payout path does not use it."""
        return IVoteGuard(self.oracle).view().require_recommended(
            _as_int(assessment_id, -1))

    # --- the treasury

    @gl.public.write.payable
    def queue_payout(self, proposal_url: str, memo: str, recipient: str,
                     amount_wei: int, assessment_id: int) -> typing.Any:
        """Authorise `amount_wei` to `recipient`, for `memo`, on the strength of
        VoteGuard assessment `assessment_id` of the proposal at `proposal_url`.

        Three things have to be true before a promise is recorded, and all
        three are the reviewer's:

        1. THE CALLER MAY SPEND. Queueing moves existing treasury funds into a
           commitment, so it is owner-or-whitelist. Anyone may still `fund`,
           and anyone may still `release` what is already authorised.
        2. THE TERMS ARE BOUND TO THE ASSESSMENT. `assessment_id` is fetched
           from the oracle and its proposal_key is compared with the key the
           submitted URL resolves to. A payout can therefore never be queued
           against a different proposal's analysis, however good that analysis
           was.
        3. THE EVIDENCE IS PINNED. The assessment's content_hash is copied into
           the record, and release will not settle against anything else.

        Payable so a caller can fund the payout in the same transaction, and it
        never raises: every refusal above credits the full deposit back."""
        value = int(gl.message.value)
        now = self._now()
        # On the books before anything can refuse, because a refusal credits a
        # refund out of this same balance.
        self.balance_wei = u256(int(self.balance_wei) + value)

        sender = gl.message.sender_address
        # FIRST, before anything else is even parsed: an unauthorised caller
        # learns nothing about the treasury's state beyond the refusal, and
        # gets every wei back.
        if not self._may_queue(sender):
            return self._reject(
                "only the owner or an authorised queuer may queue a payout; "
                + str(sender.as_hex) + " is neither")

        url = _clean(proposal_url, MAX_URL)
        if url == "" or url.find(" ") >= 0:
            return self._reject("proposal url is empty or malformed")
        if not url.lower().startswith("https://"):
            return self._reject("proposal url must start with https://")
        try:
            to = Address(str(recipient))
        except Exception:
            return self._reject("recipient is not an address")
        if to == Address("0x" + "0" * 40):
            return self._reject("recipient cannot be the zero address")
        amount = _as_int(amount_wei, -1)
        if amount <= 0:
            return self._reject("amount must be positive")
        purpose = _clean(memo, MAX_MEMO)
        if purpose == "":
            # The purpose is part of the authorisation, not decoration, so an
            # empty one is not a thing this treasury will bind money to.
            return self._reject("purpose is required; it is bound to the "
                                "assessment and cannot be blank")
        if len(self.payouts) >= MAX_QUEUED:
            return self._reject("queue is full")
        # The deposit is already booked above, so funding and queueing in one
        # transaction works — and committing more than the treasury actually
        # holds does not.
        if amount > self._free():
            return self._reject(
                "treasury holds " + str(int(self.balance_wei))
                + " wei, of which " + str(int(self.committed_wei))
                + " is already committed and " + str(int(self.refunds_owed))
                + " is owed as refunds")

        # --- the binding. Two reads across the boundary, and the payout is
        # only recorded if they agree with each other.
        aid = _as_int(assessment_id, -1)
        if aid < 0:
            return self._reject("assessment_id is required and must be a "
                                "non-negative integer")
        rec = self._assessment(self.oracle, aid)
        if not bool(rec.get("found")):
            return self._reject(
                "assessment " + str(aid) + " is not readable: "
                + _clean(rec.get("reason", "unknown"), 120))
        # Which proposal does the SUBMITTED url name? The oracle canonicalises
        # it; this treasury does not parse URLs and must not start, because a
        # second parser is a second answer.
        s = self._summary(self.oracle, url)
        url_key = _clean(s.get("proposal_key"), 120)
        if url_key == "":
            return self._reject("that url does not resolve to a proposal the "
                                "oracle recognises")
        rec_key = _clean(rec.get("proposal_key"), 120)
        if rec_key == "" or rec_key != url_key:
            # The phrase first, the keys after: _reject truncates at 200 and a
            # reason whose point falls off the end is not a reason.
            return self._reject(
                "assessment " + str(aid) + " is of a different proposal ("
                + _short(rec_key, 60) + ", not " + _short(url_key, 60)
                + "); a payout cannot be authorised by another proposal's "
                  "assessment")
        digest = self._digest_of(rec)
        if digest == "":
            return self._reject("assessment " + str(aid) + " carries no "
                                "evidence digest to pin")

        p = self.payouts.append_new_get()
        p.payout_id = u32(len(self.payouts) - 1)
        p.proposal_url = url
        p.proposal_key = url_key
        p.memo = purpose
        p.recipient = to
        p.amount_wei = u256(amount)
        p.proposer = sender
        p.status = STATUS_QUEUED
        p.queued_at = u64(now)
        # --- terms frozen here, and read from the RECORD at release
        p.oracle = self.oracle
        p.mode = str(self.mode)
        p.min_score = u32(int(self.min_score))
        p.max_age = u64(int(self.max_age))
        # --- the authorisation, pinned here, and checked at release
        p.assessment_id = u32(aid)
        p.evidence_digest = digest
        p.queued_verdict = _clean(rec.get("verdict"), 20)
        p.queued_score = u32(_as_int(rec.get("overall_score"), 0))

        self.committed_wei = u256(int(self.committed_wei) + amount)
        self.total_queued = u256(int(self.total_queued) + 1)
        out = self._view(p, now)
        out["status_code"] = "OK"
        out["uncommitted_wei"] = self._free()
        return out

    def _settle_check(self, p: Payout) -> dict:
        """Everything release() needs to know, computed without moving money.

        release() and preflight_payout() both call this and nothing else, so
        what the preview reports and what the payout enforces cannot drift —
        the same reason `_accepts` exists.

        The authorisation is checked BEFORE the verdict, deliberately. A payout
        settled against the wrong assessment is wrong even when that assessment
        says RECOMMEND, and reporting 'score too low' for a proposal whose
        analysis was replaced underneath it would describe the wrong failure."""
        blocked = ""
        # 1. The record the money was authorised against, fetched BY ID.
        pinned = self._assessment(p.oracle, int(p.assessment_id))
        if not bool(pinned.get("found")):
            blocked = ("the pinned assessment " + str(int(p.assessment_id))
                       + " can no longer be read: "
                       + _clean(pinned.get("reason", "unknown"), 120))
            return {"ok": False, "problem": blocked, "verdict": "UNKNOWN",
                    "score": 0, "age_seconds": 0,
                    "assessment_id": int(p.assessment_id),
                    "current_digest": "", "head_assessment_id": 0}
        pinned_key = _clean(pinned.get("proposal_key"), 120)
        pinned_digest = self._digest_of(pinned)
        verdict = _clean(pinned.get("verdict"), 20)
        score = _as_int(pinned.get("overall_score"), 0)
        age = _as_int(pinned.get("age_seconds"), 0)

        # 2. What the oracle says about this proposal NOW. `head` is the latest
        #    analysis of the same proposal; if it is a DIFFERENT record than
        #    the pinned one, the pinned digest has to survive the comparison.
        s = self._summary(p.oracle, str(p.proposal_url))
        head_id = _as_int(s.get("assessment_id"), -1)
        current_digest = pinned_digest
        if head_id >= 0 and head_id != int(p.assessment_id):
            head = self._assessment(p.oracle, head_id)
            current_digest = self._digest_of(head) if bool(head.get("found")) \
                else ""

        if pinned_key != str(p.proposal_key):
            blocked = ("assessment " + str(int(p.assessment_id))
                       + " is an analysis of " + pinned_key + ", not of "
                       + str(p.proposal_key))
        elif pinned_digest != str(p.evidence_digest):
            blocked = ("the evidence digest of assessment "
                       + str(int(p.assessment_id)) + " is no longer the "
                       + str(p.evidence_digest) + " this payout was authorised "
                       "against")
        elif not bool(s.get("known")):
            blocked = "no assessment on record for that proposal"
        elif current_digest != str(p.evidence_digest):
            # The replay the reviewer named, refused. A re-analysis that lands
            # on the SAME evidence digest is not a change and falls through
            # this branch; one that lands anywhere else invalidates the
            # authorisation and the payout has to be queued again.
            blocked = ("the proposal was re-analysed as assessment "
                       + str(head_id) + " with a different evidence digest ("
                       + (current_digest if current_digest != ""
                          else "unreadable") + " vs the pinned "
                       + str(p.evidence_digest)
                       + "); re-queue against the assessment that holds now")
        elif not _accepts(str(p.mode), verdict):
            blocked = ("verdict is " + verdict + "; this payout requires "
                       + str(p.mode))
        elif score < int(p.min_score):
            blocked = ("score " + str(score) + " is below the required "
                       + str(int(p.min_score)))
        elif age > int(p.max_age):
            blocked = ("assessment is " + str(age) + "s old, older than the "
                       + str(int(p.max_age)) + "s this payout allows")

        return {"ok": blocked == "", "problem": blocked, "verdict": verdict,
                "score": score, "age_seconds": age,
                "assessment_id": int(p.assessment_id),
                "title": _clean(pinned.get("title"), 120),
                "current_digest": current_digest,
                "head_assessment_id": head_id}

    @gl.public.view
    def preflight_payout(self, payout_id: int) -> typing.Any:
        """What release() WOULD do for one QUEUED payout, for free and without
        reverting — the authorisation checks included.

        preflight() answers about a URL under the CURRENT defaults; this answers
        about a payout under the terms and the authorisation it was actually
        queued with, which after the reviewer's fixes are different questions."""
        p = self._get(payout_id)
        if p is None:
            return {"found": False, "would_release": False,
                    "payout_id": _as_int(payout_id, -1),
                    "blocker": "no such payout"}
        if str(p.status) != STATUS_QUEUED:
            return {"found": True, "would_release": False,
                    "payout_id": int(p.payout_id), "status": str(p.status),
                    "blocker": "payout is already " + str(p.status).lower()}
        got = self._settle_check(p)
        return {
            "found": True, "payout_id": int(p.payout_id),
            "status": str(p.status),
            "would_release": bool(got["ok"]),
            "blocker": str(got["problem"]),
            "verdict": str(got["verdict"]), "score": int(got["score"]),
            "age_seconds": int(got["age_seconds"]),
            "pinned_assessment_id": int(p.assessment_id),
            "pinned_evidence_digest": str(p.evidence_digest),
            "current_evidence_digest": str(got["current_digest"]),
            "head_assessment_id": int(got["head_assessment_id"]),
            "evidence_unchanged": str(got["current_digest"])
                                  == str(p.evidence_digest),
            "recipient": str(p.recipient.as_hex),
            "amount_wei": int(p.amount_wei),
            "purpose": str(p.memo),
        }

    @gl.public.write
    def release(self, payout_id: int, recipient: str, amount_wei: int,
                assessment_id: int) -> typing.Any:
        """Pay, or refuse and say exactly why. Permissionless — the oracle
        decides, not the caller, so anybody may press the button.

        THE CALLER MUST STATE THE TERMS IT BELIEVES IT IS SETTLING. recipient,
        amount and assessment id are not inputs to the decision — the record
        holds all three and the record is the authority — they are an assertion,
        and a caller whose idea of the payout has drifted from the contract's
        gets a revert instead of a surprise transfer. That is the reviewer's
        'release must check these match': the binding made checkable at the
        call site rather than only promised in a comment.

        REVERTS when the payout does not clear the bar. That is the point:
        a treasury that returned False here would let a careless integrator
        continue as though nothing had happened."""
        p = self._get(payout_id)
        if p is None:
            raise gl.vm.UserError(ERR + " no such payout")
        if str(p.status) != STATUS_QUEUED:
            raise gl.vm.UserError(ERR + " payout is already "
                                  + str(p.status).lower())

        # --- the asserted payment terms, checked against the bound record
        try:
            to = Address(str(recipient))
        except Exception:
            raise gl.vm.UserError(ERR + " recipient is not an address")
        if to != p.recipient:
            raise gl.vm.UserError(
                ERR + " payment terms do not match: payout "
                + str(int(p.payout_id)) + " pays "
                + str(p.recipient.as_hex) + ", not " + str(to.as_hex))
        want = _as_int(amount_wei, -1)
        if want != int(p.amount_wei):
            raise gl.vm.UserError(
                ERR + " payment terms do not match: payout "
                + str(int(p.payout_id)) + " is for " + str(int(p.amount_wei))
                + " wei, not " + str(want))
        claimed = _as_int(assessment_id, -1)
        if claimed != int(p.assessment_id):
            raise gl.vm.UserError(
                ERR + " payment terms do not match: payout "
                + str(int(p.payout_id)) + " was authorised by assessment "
                + str(int(p.assessment_id)) + ", not " + str(claimed))

        # every term and the authorisation read from the RECORD, never from
        # the live config and never from the caller
        got = self._settle_check(p)
        now = self._now()

        if not bool(got["ok"]):
            # No counter here, deliberately. This method reverts on refusal, so
            # anything written on the way to the raise is rolled back with it —
            # a refusal tally incremented here would read zero forever while
            # looking like it counted. Refusals are observable where they can
            # actually be observed: preflight_payout() returns the same blocker
            # without reverting, and the raise itself carries the reason.
            raise gl.vm.UserError(
                ERR + " refused: " + str(got["problem"]) + " ("
                + _short(str(p.memo), 60) + ")")

        amount = int(p.amount_wei)
        p.status = STATUS_RELEASED
        p.settled_at = u64(now)
        p.verdict = str(got["verdict"])
        p.score = u32(int(got["score"]))
        p.settled_assessment_id = u32(int(got["assessment_id"]))
        p.reason = _clean(got.get("title"), 120)
        # The commitment is released BEFORE the transfer, so a re-entrant call
        # sees the payout already settled and its money already uncommitted.
        self.committed_wei = u256(int(self.committed_wei) - amount)
        self.balance_wei = u256(int(self.balance_wei) - amount)
        self.total_released_wei = u256(int(self.total_released_wei) + amount)
        _Payee(p.recipient).emit(value=u256(amount))
        out = self._view(p, now)
        out["status_code"] = "RELEASED"
        return out

    @gl.public.write
    def cancel_payout(self, payout_id: int) -> typing.Any:
        """The queuer or the owner may withdraw a promise that has not been
        released. It frees the commitment; it never moves anyone's money."""
        p = self._get(payout_id)
        if p is None:
            raise gl.vm.UserError(ERR + " no such payout")
        if str(p.status) != STATUS_QUEUED:
            raise gl.vm.UserError(ERR + " payout is already "
                                  + str(p.status).lower())
        sender = gl.message.sender_address
        if sender != p.proposer and sender != self.owner:
            raise gl.vm.UserError(ERR + " only the queuer or the owner may "
                                        "cancel")
        p.status = STATUS_CANCELLED
        p.settled_at = u64(self._now())
        p.reason = "cancelled by " + str(sender.as_hex)
        self.committed_wei = u256(int(self.committed_wei) - int(p.amount_wei))
        return {"status": "OK", "payout_id": int(p.payout_id),
                "uncommitted_wei": self._free()}

    @gl.public.write
    def claim_refund(self) -> typing.Any:
        who = gl.message.sender_address
        amount = int(self.refund_wei.get(who) or 0)
        if amount <= 0:
            return {"status": "NOTHING_OWED", "refund_wei": 0}
        self.refund_wei[who] = u256(0)
        self.refunds_owed = u256(int(self.refunds_owed) - amount)
        self.balance_wei = u256(int(self.balance_wei) - amount)
        _Payee(who).emit(value=u256(amount))
        return {"status": "OK", "refund_wei": amount}

    # --- reads

    @gl.public.view
    def get_payout(self, payout_id: int) -> typing.Any:
        p = self._get(payout_id)
        if p is None:
            return {"found": False, "payout_id": _as_int(payout_id, -1)}
        out = self._view(p, self._now())
        out["found"] = True
        return out

    @gl.public.view
    def get_payouts(self, offset: int, count: int) -> typing.Any:
        start = _as_int(offset, 0)
        if start < 0:
            start = 0
        n = _as_int(count, 0)
        if n <= 0 or n > 100:
            n = 100
        now = self._now()
        rows = []
        for i in range(start, min(start + n, len(self.payouts))):
            rows.append(self._view(self.payouts[i], now))
        return {"total": len(self.payouts), "offset": start,
                "returned": len(rows), "payouts": rows}

    @gl.public.view
    def get_terms(self) -> typing.Any:
        """The live defaults, plus proof the pair is wired to each other.

        `oracle_rubric` is read ACROSS the boundary: if it comes back with a
        version and a weight table, this consumer is pointed at a real VoteGuard
        and not merely at an address that exists."""
        queuers = []
        for i in range(len(self.queuer_list)):
            addr = self.queuer_list[i]
            if bool(self.queuers.get(addr) or False):
                queuers.append(str(addr.as_hex))
        rubric = {}
        try:
            cfg = IVoteGuard(self.oracle).view().get_config()
            if isinstance(cfg, dict):
                rubric = {"rubric_version": cfg.get("rubric_version"),
                          "verdicts": cfg.get("verdicts"),
                          "verdict_thresholds": cfg.get("verdict_thresholds"),
                          "fee_wei": cfg.get("fee_wei"),
                          "paused": cfg.get("paused")}
        except Exception:
            rubric = {"error": "oracle unreachable"}
        return {
            "owner": str(self.owner.as_hex),
            "oracle": str(self.oracle.as_hex),
            "oracle_is_immutable": True,
            "mode": str(self.mode),
            "accepted_modes": list(ACCEPTED_MODES),
            "min_score": int(self.min_score),
            "max_age_seconds": int(self.max_age),
            "balance_wei": int(self.balance_wei),
            "committed_wei": int(self.committed_wei),
            "uncommitted_wei": self._free(),
            "refunds_owed_wei": int(self.refunds_owed),
            "queued": len(self.payouts),
            "total_queued": int(self.total_queued),
            "total_released_wei": int(self.total_released_wei),
            "authorized_queuers": queuers,
            "queue_is_permissioned": True,
            "release_is_permissionless": True,
            "oracle_rubric": rubric,
            "note": "terms are snapshotted into each payout when it is queued; "
                    "set_terms moves the defaults for payouts queued after it",
            "authorization_note": "queue_payout is owner-or-whitelist and binds "
                                  "recipient, amount and purpose to one "
                                  "assessment id, pinning its evidence digest; "
                                  "release refuses if that digest has changed",
        }

    @gl.public.view
    def refund_of(self, who: str) -> typing.Any:
        addr = Address(str(who))
        return {"address": str(addr.as_hex),
                "refund_wei": int(self.refund_wei.get(addr) or 0)}

    # --- governance

    @gl.public.write
    def set_terms(self, mode: str, min_score: int, max_age: int) -> typing.Any:
        """Move the DEFAULTS for payouts queued after this call.

        It cannot reach a payout that is already queued: every one of them
        carries its own copy of these three numbers and `release` reads that
        copy. The return value says so, because a setter whose scope is
        invisible is a setter that will be misread."""
        self._only_owner()
        m = str(mode)
        if m not in ACCEPTED_MODES:
            raise gl.vm.UserError(ERR + " mode must be one of "
                                  + ",".join(ACCEPTED_MODES))
        score = _as_int(min_score, -1)
        if score < MIN_ALLOWED_SCORE or score > 100:
            raise gl.vm.UserError(ERR + " min_score must be between "
                                  + str(MIN_ALLOWED_SCORE) + " and 100")
        age = _as_int(max_age, -1)
        if age <= 0 or age > MAX_ALLOWED_AGE:
            raise gl.vm.UserError(ERR + " max_age must be between 1 and "
                                  + str(MAX_ALLOWED_AGE) + " seconds")
        old = {"mode": str(self.mode), "min_score": int(self.min_score),
               "max_age_seconds": int(self.max_age)}
        self.mode = m
        self.min_score = u32(score)
        self.max_age = u64(age)
        return {"status": "OK", "was": old,
                "now": {"mode": m, "min_score": score, "max_age_seconds": age},
                "applies_to": "payouts queued after this call; the "
                              + str(len(self.payouts))
                              + " already queued keep their own terms"}

    @gl.public.write
    def authorize_queuer(self, who: str) -> typing.Any:
        """Whitelist a DAO address to queue payouts. Owner only.

        It grants the right to PROMISE treasury money, and nothing else: an
        authorised queuer cannot move the terms, cannot withdraw, cannot cancel
        somebody else's payout, and cannot release anything the oracle has not
        already approved."""
        self._only_owner()
        addr = Address(str(who))
        if addr == Address("0x" + "0" * 40):
            raise gl.vm.UserError(ERR + " queuer cannot be the zero address")
        already = bool(self.queuers.get(addr) or False)
        if not already:
            if len(self.queuer_list) >= MAX_QUEUERS:
                raise gl.vm.UserError(ERR + " the whitelist is full at "
                                      + str(MAX_QUEUERS))
            # Appended once, ever. Revoking flips the flag and leaves the entry
            # in place, so re-authorising the same address never grows the
            # list and the list can never outrun its bound.
            if not self._listed(addr):
                self.queuer_list.append(addr)
        self.queuers[addr] = True
        return {"status": "OK", "queuer": str(addr.as_hex), "authorized": True,
                "was_already_authorized": already,
                "note": "may queue payouts; release stays permissionless and "
                        "payouts already queued are unaffected by this call"}

    @gl.public.write
    def revoke_queuer(self, who: str) -> typing.Any:
        """Take the right to queue away again. Owner only.

        It CANNOT reach a payout that is already queued. Those are promises to
        a named recipient bound to a named assessment, and release is
        permissionless — so revoking is a statement about future spending, not
        a lever for stranding money that has already been authorised."""
        self._only_owner()
        addr = Address(str(who))
        had = bool(self.queuers.get(addr) or False)
        self.queuers[addr] = False
        return {"status": "OK", "queuer": str(addr.as_hex), "authorized": False,
                "was_authorized": had,
                "applies_to": "future queue_payout calls only; the "
                              + str(len(self.payouts))
                              + " payouts already queued keep their "
                                "authorisation and stay releasable"}

    @gl.public.view
    def can_queue(self, who: str) -> typing.Any:
        addr = Address(str(who))
        is_owner = addr == self.owner
        return {"address": str(addr.as_hex), "can_queue":
                is_owner or bool(self.queuers.get(addr) or False),
                "is_owner": is_owner,
                "is_whitelisted": bool(self.queuers.get(addr) or False)}

    @gl.public.view
    def get_queuers(self) -> typing.Any:
        """The whole whitelist, enumerable. A permission nobody can list is a
        permission nobody audits."""
        rows = []
        for i in range(len(self.queuer_list)):
            addr = self.queuer_list[i]
            if bool(self.queuers.get(addr) or False):
                rows.append(str(addr.as_hex))
        return {"owner": str(self.owner.as_hex),
                "authorized_queuers": rows, "count": len(rows),
                "max_queuers": MAX_QUEUERS,
                "note": "the owner may always queue and is not listed here"}

    @gl.public.write
    def transfer_ownership(self, new_owner: str) -> typing.Any:
        self._only_owner()
        addr = Address(str(new_owner))
        if addr == Address("0x" + "0" * 40):
            raise gl.vm.UserError(ERR + " owner cannot be zero")
        self.owner = addr
        return {"status": "OK", "owner": str(addr.as_hex)}

    @gl.public.write
    def withdraw_uncommitted(self, amount: int) -> typing.Any:
        """The owner may take back treasury money that is not promised to a
        queued payout and not owed as a refund. Committed funds are a promise to
        a named recipient and the owner cannot reach them — cancel_payout is the
        only way to unwind one, and it is visible on chain."""
        self._only_owner()
        want = _as_int(amount, -1)
        free = self._free()
        if want <= 0 or want > free:
            raise gl.vm.UserError(
                ERR + " uncommitted balance is " + str(free) + " wei (holds "
                + str(int(self.balance_wei)) + ", committed "
                + str(int(self.committed_wei)) + ", owes "
                + str(int(self.refunds_owed)) + ")")
        self.balance_wei = u256(int(self.balance_wei) - want)
        _Payee(self.owner).emit(value=u256(want))
        return {"status": "OK", "withdrawn_wei": want,
                "uncommitted_wei": free - want}
