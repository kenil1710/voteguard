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
# REFUSAL IS NEVER CONFISCATION. `fund` and `queue_payout` are payable and
# neither raises: a rejected queue credits the sender in full, claimable with
# claim_refund. `release` is NOT payable and DOES revert, deliberately — that is
# the whole point of require_recommended, and a caller that wanted a boolean has
# preflight() for free.

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone

import json
import typing

MAX_URL = 400
MAX_MEMO = 200
MAX_QUEUED = 400

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
    proposal_url: str
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
    # --- what the oracle said at release
    verdict: str
    score: u32
    assessment_id: u32
    reason: str


class GovernanceConsumer(gl.Contract):
    owner: Address
    oracle: Address
    mode: str
    min_score: u32
    max_age: u64

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
    total_refused: u256

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
        self.total_refused = u256(0)

    # --- internals

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR + " owner only")

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

    def _view(self, p: Payout, now: int) -> dict:
        return {
            "payout_id": int(p.payout_id),
            "proposal_url": str(p.proposal_url),
            "memo": str(p.memo),
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
            "verdict": str(p.verdict),
            "score": int(p.score),
            "assessment_id": int(p.assessment_id),
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
                     amount_wei: int) -> typing.Any:
        """Promise `amount_wei` to `recipient` if VoteGuard recommends the
        proposal at `proposal_url`.

        Payable so a caller can fund the payout in the same transaction, and it
        never raises: every refusal credits the full deposit back."""
        value = int(gl.message.value)
        now = self._now()
        # On the books before anything can refuse, because a refusal credits a
        # refund out of this same balance.
        self.balance_wei = u256(int(self.balance_wei) + value)

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

        p = self.payouts.append_new_get()
        p.payout_id = u32(len(self.payouts) - 1)
        p.proposal_url = url
        p.memo = _clean(memo, MAX_MEMO)
        p.recipient = to
        p.amount_wei = u256(amount)
        p.proposer = gl.message.sender_address
        p.status = STATUS_QUEUED
        p.queued_at = u64(now)
        # --- terms frozen here, and read from the RECORD at release
        p.oracle = self.oracle
        p.mode = str(self.mode)
        p.min_score = u32(int(self.min_score))
        p.max_age = u64(int(self.max_age))

        self.committed_wei = u256(int(self.committed_wei) + amount)
        self.total_queued = u256(int(self.total_queued) + 1)
        out = self._view(p, now)
        out["status_code"] = "OK"
        out["uncommitted_wei"] = self._free()
        return out

    @gl.public.write
    def release(self, payout_id: int) -> typing.Any:
        """Pay, or refuse and say exactly why. Permissionless — the oracle
        decides, not the caller, so anybody may press the button.

        REVERTS when the proposal does not clear the bar. That is the point:
        a treasury that returned False here would let a careless integrator
        continue as though nothing had happened."""
        p = self._get(payout_id)
        if p is None:
            raise gl.vm.UserError(ERR + " no such payout")
        if str(p.status) != STATUS_QUEUED:
            raise gl.vm.UserError(ERR + " payout is already "
                                  + str(p.status).lower())

        # every term read from the RECORD, never from the live config
        s = self._summary(p.oracle, str(p.proposal_url))
        now = self._now()
        known = bool(s.get("known"))
        verdict = str(s.get("verdict", "UNKNOWN"))
        score = _as_int(s.get("score"), 0)
        age = _as_int(s.get("age_seconds"), 0)

        problem = ""
        if not known:
            problem = "no assessment on record for that proposal"
        elif not _accepts(str(p.mode), verdict):
            problem = ("verdict is " + verdict + "; this payout requires "
                       + str(p.mode))
        elif score < int(p.min_score):
            problem = ("score " + str(score) + " is below the required "
                       + str(int(p.min_score)))
        elif age > int(p.max_age):
            problem = ("assessment is " + str(age) + "s old, older than the "
                       + str(int(p.max_age)) + "s this payout allows")

        if problem != "":
            self.total_refused = u256(int(self.total_refused) + 1)
            raise gl.vm.UserError(
                ERR + " refused: " + problem + " (" + _short(str(p.memo), 60)
                + ")")

        amount = int(p.amount_wei)
        p.status = STATUS_RELEASED
        p.settled_at = u64(now)
        p.verdict = verdict
        p.score = u32(score)
        p.assessment_id = u32(_as_int(s.get("assessment_id"), 0))
        p.reason = _clean(s.get("title"), 120)
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
            "total_refused": int(self.total_refused),
            "oracle_rubric": rubric,
            "note": "terms are snapshotted into each payout when it is queued; "
                    "set_terms moves the defaults for payouts queued after it",
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
