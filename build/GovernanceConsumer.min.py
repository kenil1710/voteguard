# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import typing
aK = 400
aW = 200
aQ = 400
Y = 50
aR = 80
aq = 70
aw = 30 * 86400
T = 1
X = 365 * 86400
J = ("RECOMMEND", "RECOMMEND_OR_CAUTION")
R = "[EXPECTED]"
M = "QUEUED"
ax = "RELEASED"
ar = "CANCELLED"
def aY(s: str) -> str:
 return " ".join(str(s).split())
def aj(s: str, n: int) -> str:
 s = str(s)
 return s[:n] if len(s) > n else s
def F(s: typing.Any, n: int) -> str:
 af = []
 for ch in str(s):
  af.append(ch if 32 <= ord(ch) < 127 else " ")
 return aY(aY("".join(af))[:n])
def f(v: typing.Any, aX: int) -> int:
 if isinstance(v, bool) or not isinstance(v, int):
  return aX
 return int(v)
def aG(H: str, y: str) -> bool:
 if str(y) == "RECOMMEND":
  return True
 return str(H) == "RECOMMEND_OR_CAUTION" and str(y) == "CAUTION"
@gl.contract_interface
class IVoteGuard:
 class View:
  def get_risk_summary(self, o: str) -> typing.Any: ...
  def require_recommended(self, a: int) -> typing.Any: ...
  def get_config(self) -> typing.Any: ...
  def get_assessment(self, a: int) -> typing.Any: ...
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
 b: u32
 o: str
 I: str
 ak: str
 u: Address
 k: u256
 at: Address
 G: str
 al: u64
 ac: u64
 h: Address
 H: str
 g: u32
 t: u64
 a: u32
 e: str
 aa: str
 am: u32
 y: str
 E: u32
 N: u32
 an: str
class GovernanceConsumer(gl.Contract):
 U: Address
 h: Address
 H: str
 g: u32
 t: u64
 z: TreeMap[Address, bool]
 x: DynArray[Address]
 B: DynArray[Payout]
 c: u256
 d: u256
 O: TreeMap[Address, u256]
 q: u256
 P: u256
 A: u256
 def __init__(self, h: str):
  self.U = gl.message.sender_address
  self.h = Address(str(h))
  self.H = J[0]
  self.g = u32(aq)
  self.t = u64(aw)
  self.c = u256(0)
  self.d = u256(0)
  self.q = u256(0)
  self.P = u256(0)
  self.A = u256(0)
 def aA(self) -> int:
  return int(datetime.now(timezone.utc).timestamp())
 def K(self) -> None:
  if gl.message.sender_address != self.U:
   raise gl.vm.UserError(R + " owner only")
 def ba(self, Q: Address) -> bool:
  for i in range(len(self.x)):
   if self.x[i] == Q:
    return True
  return False
 def aS(self, Q: Address) -> bool:
  if Q == self.U:
   return True
  return bool(self.z.get(Q) or False)
 def bb(self, Q: Address, j: int) -> None:
  if j <= 0:
   return
  self.O[Q] = u256(int(self.O.get(Q) or 0) + j)
  self.q = u256(int(self.q) + j)
 def w(self, an: str) -> dict:
  self.bb(gl.message.sender_address, int(gl.message.value))
  return {"status": "REJECTED", "reason": aj(an, 200),
  "refund_wei": int(gl.message.value)}
 def ao(self) -> int:
  aB = (int(self.c) - int(self.d)
  - int(self.q))
  return aB if aB > 0 else 0
 def au(self, h: Address, aH: str) -> dict:
  try:
   L = IVoteGuard(h).view().get_risk_summary(str(aH))
  except Exception:
   return {"known": False, "verdict": "UNREACHABLE"}
  if not isinstance(L, dict):
   return {"known": False, "verdict": "UNREADABLE"}
  return L
 def Z(self, h: Address, a: int) -> dict:
  try:
   L = IVoteGuard(h).view().get_assessment(
   f(a, -1))
  except Exception:
   return {"found": False, "reason": "oracle unreachable"}
  if not isinstance(L, dict):
   return {"found": False, "reason": "oracle returned an unreadable "
                                              "shape"}
  return L
 def ad(self, aD: dict) -> str:
  return F(aD.get("content_hash"), aR)
 def aF(self, p: Payout, now: int) -> dict:
  return {
  "payout_id": int(p.b),
  "proposal_url": str(p.o),
  "proposal_key": str(p.I),
  "memo": str(p.ak),
  "purpose": str(p.ak),
  "recipient": str(p.u.as_hex),
  "amount_wei": int(p.k),
  "proposer": str(p.at.as_hex),
  "status": str(p.G),
  "queued_at": int(p.al),
  "settled_at": int(p.ac),
  "age_seconds": now - int(p.al),
  "terms": {"oracle": str(p.h.as_hex), "mode": str(p.H),
  "min_score": int(p.g),
  "max_age_seconds": int(p.t)},
  "authorization": {
  "assessment_id": int(p.a),
  "evidence_digest": str(p.e),
  "proposal_key": str(p.I),
  "verdict_at_queue": str(p.aa),
  "score_at_queue": int(p.am),
  "recipient": str(p.u.as_hex),
  "amount_wei": int(p.k),
  "purpose": str(p.ak),
  },
  "assessment_id": int(p.a),
  "evidence_digest": str(p.e),
  "verdict": str(p.y),
  "score": int(p.E),
  "settled_assessment_id": int(p.N),
  "reason": str(p.an),
  }
 def aT(self, b: int) -> typing.Any:
  i = f(b, -1)
  if i < 0 or i >= len(self.B):
   return None
  return self.B[i]
 @gl.public.write.payable
 def fund(self) -> typing.Any:
  self.c = u256(int(self.c) + int(gl.message.value))
  return {"status": "OK", "added_wei": int(gl.message.value),
  "balance_wei": int(self.c),
  "uncommitted_wei": self.ao()}
 @gl.public.view
 def preflight(self, o: str) -> typing.Any:
  s = self.au(self.h, o)
  now = self.aA()
  aZ = bool(s.get("known"))
  y = str(s.get("verdict", "UNKNOWN"))
  E = f(s.get("score"), 0)
  ag = f(s.get("age_seconds"), 0)
  V = []
  if not aZ:
   V.append("no assessment on record")
  else:
   if not aG(str(self.H), y):
    V.append("verdict is " + y + ", this treasury "
                               "requires " + str(self.H))
   if E < int(self.g):
    V.append("score " + str(E) + " is below the required "
    + str(int(self.g)))
   if ag > int(self.t):
    V.append("assessment is " + str(ag) + "s old, older "
                               "than the " + str(int(self.t)) + "s limit")
  return {
  "would_release": len(V) == 0,
  "proposal_url": aj(str(o), aK),
  "known": aZ, "verdict": y, "score": E,
  "age_seconds": ag,
  "worst_dimension": str(s.get("worst_dimension", "")),
  "worst_label": str(s.get("worst_label", "")),
  "flags": s.get("flags") if isinstance(s.get("flags"), list) else [],
  "title": str(s.get("title", "")),
  "dao": str(s.get("dao", "")),
  "blockers": V,
  "terms": {"oracle": str(self.h.as_hex), "mode": str(self.H),
  "min_score": int(self.g),
  "max_age_seconds": int(self.t)},
  }
 @gl.public.view
 def strict_release(self, a: int) -> typing.Any:
  return IVoteGuard(self.h).view().require_recommended(
  f(a, -1))
 @gl.public.write.payable
 def queue_payout(self, o: str, ak: str, u: str,
 k: int, a: int) -> typing.Any:
  value = int(gl.message.value)
  now = self.aA()
  self.c = u256(int(self.c) + value)
  W = gl.message.sender_address
  if not self.aS(W):
   return self.w(
   "only the owner or an authorised queuer may queue a payout; "
   + str(W.as_hex) + " is neither")
  aH = F(o, aK)
  if aH == "" or aH.find(" ") >= 0:
   return self.w("proposal url is empty or malformed")
  if not aH.lower().startswith("https://"):
   return self.w("proposal url must start with https://")
  try:
   to = Address(str(u))
  except Exception:
   return self.w("recipient is not an address")
  if to == Address("0x" + "0" * 40):
   return self.w("recipient cannot be the zero address")
  j = f(k, -1)
  if j <= 0:
   return self.w("amount must be positive")
  aL = F(ak, aW)
  if aL == "":
   return self.w("purpose is required; it is bound to the "
                                "assessment and cannot be blank")
  if len(self.B) >= aQ:
   return self.w("queue is full")
  if j > self.ao():
   return self.w(
   "treasury holds " + str(int(self.c))
   + " wei, of which " + str(int(self.d))
   + " is already committed and " + str(int(self.q))
   + " is owed as refunds")
  aM = f(a, -1)
  if aM < 0:
   return self.w("assessment_id is required and must be a "
                                "non-negative integer")
  aD = self.Z(self.h, aM)
  if not bool(aD.get("found")):
   return self.w(
   "assessment " + str(aM) + " is not readable: "
   + F(aD.get("reason", "unknown"), 120))
  s = self.au(self.h, aH)
  ap = F(s.get("proposal_key"), 120)
  if ap == "":
   return self.w("that url does not resolve to a proposal the "
                                "oracle recognises")
  aC = F(aD.get("proposal_key"), 120)
  if aC == "" or aC != ap:
   return self.w(
   "assessment " + str(aM) + " is of a different proposal ("
   + aj(aC, 60) + ", not " + aj(ap, 60)
   + "); a payout cannot be authorised by another proposal's "
                  "assessment")
  aU = self.ad(aD)
  if aU == "":
   return self.w("assessment " + str(aM) + " carries no "
                                "evidence digest to pin")
  p = self.B.append_new_get()
  p.b = u32(len(self.B) - 1)
  p.o = aH
  p.I = ap
  p.ak = aL
  p.u = to
  p.k = u256(j)
  p.at = W
  p.G = M
  p.al = u64(now)
  p.h = self.h
  p.H = str(self.H)
  p.g = u32(int(self.g))
  p.t = u64(int(self.t))
  p.a = u32(aM)
  p.e = aU
  p.aa = F(aD.get("verdict"), 20)
  p.am = u32(f(aD.get("overall_score"), 0))
  self.d = u256(int(self.d) + j)
  self.P = u256(int(self.P) + 1)
  af = self.aF(p, now)
  af["status_code"] = "OK"
  af["uncommitted_wei"] = self.ao()
  return af
 def ah(self, p: Payout) -> dict:
  C = ""
  S = self.Z(p.h, int(p.a))
  if not bool(S.get("found")):
   C = ("the pinned assessment " + str(int(p.a))
   + " can no longer be read: "
   + F(S.get("reason", "unknown"), 120))
   return {"ok": False, "problem": C, "verdict": "UNKNOWN",
   "score": 0, "age_seconds": 0,
   "assessment_id": int(p.a),
   "current_digest": "", "head_assessment_id": 0}
  ay = F(S.get("proposal_key"), 120)
  ai = self.ad(S)
  y = F(S.get("verdict"), 20)
  E = f(S.get("overall_score"), 0)
  ag = f(S.get("age_seconds"), 0)
  s = self.au(p.h, str(p.o))
  ab = f(s.get("assessment_id"), -1)
  D = ai
  if ab >= 0 and ab != int(p.a):
   be = self.Z(p.h, ab)
   D = self.ad(be) if bool(be.get("found")) \
   else ""
  if ay != str(p.I):
   C = ("assessment " + str(int(p.a))
   + " is an analysis of " + ay + ", not of "
   + str(p.I))
  elif ai != str(p.e):
   C = ("the evidence digest of assessment "
   + str(int(p.a)) + " is no longer the "
   + str(p.e) + " this payout was authorised "
                       "against")
  elif not bool(s.get("known")):
   C = "no assessment on record for that proposal"
  elif D != str(p.e):
   C = ("the proposal was re-analysed as assessment "
   + str(ab) + " with a different evidence digest ("
   + (D if D != ""
   else "unreadable") + " vs the pinned "
   + str(p.e)
   + "); re-queue against the assessment that holds now")
  elif not aG(str(p.H), y):
   C = ("verdict is " + y + "; this payout requires "
   + str(p.H))
  elif E < int(p.g):
   C = ("score " + str(E) + " is below the required "
   + str(int(p.g)))
  elif ag > int(p.t):
   C = ("assessment is " + str(ag) + "s old, older than the "
   + str(int(p.t)) + "s this payout allows")
  return {"ok": C == "", "problem": C, "verdict": y,
  "score": E, "age_seconds": ag,
  "assessment_id": int(p.a),
  "title": F(S.get("title"), 120),
  "current_digest": D,
  "head_assessment_id": ab}
 @gl.public.view
 def preflight_payout(self, b: int) -> typing.Any:
  p = self.aT(b)
  if p is None:
   return {"found": False, "would_release": False,
   "payout_id": f(b, -1),
   "blocker": "no such payout"}
  if str(p.G) != M:
   return {"found": True, "would_release": False,
   "payout_id": int(p.b), "status": str(p.G),
   "blocker": "payout is already " + str(p.G).lower()}
  L = self.ah(p)
  return {
  "found": True, "payout_id": int(p.b),
  "status": str(p.G),
  "would_release": bool(L["ok"]),
  "blocker": str(L["problem"]),
  "verdict": str(L["verdict"]), "score": int(L["score"]),
  "age_seconds": int(L["age_seconds"]),
  "pinned_assessment_id": int(p.a),
  "pinned_evidence_digest": str(p.e),
  "current_evidence_digest": str(L["current_digest"]),
  "head_assessment_id": int(L["head_assessment_id"]),
  "evidence_unchanged": str(L["current_digest"])
  == str(p.e),
  "recipient": str(p.u.as_hex),
  "amount_wei": int(p.k),
  "purpose": str(p.ak),
  }
 @gl.public.write
 def release(self, b: int, u: str, k: int,
 a: int) -> typing.Any:
  p = self.aT(b)
  if p is None:
   raise gl.vm.UserError(R + " no such payout")
  if str(p.G) != M:
   raise gl.vm.UserError(R + " payout is already "
   + str(p.G).lower())
  try:
   to = Address(str(u))
  except Exception:
   raise gl.vm.UserError(R + " recipient is not an address")
  if to != p.u:
   raise gl.vm.UserError(
   R + " payment terms do not match: payout "
   + str(int(p.b)) + " pays "
   + str(p.u.as_hex) + ", not " + str(to.as_hex))
  ae = f(k, -1)
  if ae != int(p.k):
   raise gl.vm.UserError(
   R + " payment terms do not match: payout "
   + str(int(p.b)) + " is for " + str(int(p.k))
   + " wei, not " + str(ae))
  aN = f(a, -1)
  if aN != int(p.a):
   raise gl.vm.UserError(
   R + " payment terms do not match: payout "
   + str(int(p.b)) + " was authorised by assessment "
   + str(int(p.a)) + ", not " + str(aN))
  L = self.ah(p)
  now = self.aA()
  if not bool(L["ok"]):
   raise gl.vm.UserError(
   R + " refused: " + str(L["problem"]) + " ("
   + aj(str(p.ak), 60) + ")")
  j = int(p.k)
  p.G = ax
  p.ac = u64(now)
  p.y = str(L["verdict"])
  p.E = u32(int(L["score"]))
  p.N = u32(int(L["assessment_id"]))
  p.an = F(L.get("title"), 120)
  self.d = u256(int(self.d) - j)
  self.c = u256(int(self.c) - j)
  self.A = u256(int(self.A) + j)
  _Payee(p.u).emit(value=u256(j))
  af = self.aF(p, now)
  af["status_code"] = "RELEASED"
  return af
 @gl.public.write
 def cancel_payout(self, b: int) -> typing.Any:
  p = self.aT(b)
  if p is None:
   raise gl.vm.UserError(R + " no such payout")
  if str(p.G) != M:
   raise gl.vm.UserError(R + " payout is already "
   + str(p.G).lower())
  W = gl.message.sender_address
  if W != p.at and W != self.U:
   raise gl.vm.UserError(R + " only the queuer or the owner may "
                                        "cancel")
  p.G = ar
  p.ac = u64(self.aA())
  p.an = "cancelled by " + str(W.as_hex)
  self.d = u256(int(self.d) - int(p.k))
  return {"status": "OK", "payout_id": int(p.b),
  "uncommitted_wei": self.ao()}
 @gl.public.write
 def claim_refund(self) -> typing.Any:
  Q = gl.message.sender_address
  j = int(self.O.get(Q) or 0)
  if j <= 0:
   return {"status": "NOTHING_OWED", "refund_wei": 0}
  self.O[Q] = u256(0)
  self.q = u256(int(self.q) - j)
  self.c = u256(int(self.c) - j)
  _Payee(Q).emit(value=u256(j))
  return {"status": "OK", "refund_wei": j}
 @gl.public.view
 def get_payout(self, b: int) -> typing.Any:
  p = self.aT(b)
  if p is None:
   return {"found": False, "payout_id": f(b, -1)}
  af = self.aF(p, self.aA())
  af["found"] = True
  return af
 @gl.public.view
 def get_payouts(self, bf: int, bh: int) -> typing.Any:
  az = f(bf, 0)
  if az < 0:
   az = 0
  n = f(bh, 0)
  if n <= 0 or n > 100:
   n = 100
  now = self.aA()
  av = []
  for i in range(az, min(az + n, len(self.B))):
   av.append(self.aF(self.B[i], now))
  return {"total": len(self.B), "offset": az,
  "returned": len(av), "payouts": av}
 @gl.public.view
 def get_terms(self) -> typing.Any:
  z = []
  for i in range(len(self.x)):
   r = self.x[i]
   if bool(self.z.get(r) or False):
    z.append(str(r.as_hex))
  aI = {}
  try:
   aO = IVoteGuard(self.h).view().get_config()
   if isinstance(aO, dict):
    aI = {"rubric_version": aO.get("rubric_version"),
    "verdicts": aO.get("verdicts"),
    "verdict_thresholds": aO.get("verdict_thresholds"),
    "fee_wei": aO.get("fee_wei"),
    "paused": aO.get("paused")}
  except Exception:
   aI = {"error": "oracle unreachable"}
  return {
  "owner": str(self.U.as_hex),
  "oracle": str(self.h.as_hex),
  "oracle_is_immutable": True,
  "mode": str(self.H),
  "accepted_modes": list(J),
  "min_score": int(self.g),
  "max_age_seconds": int(self.t),
  "balance_wei": int(self.c),
  "committed_wei": int(self.d),
  "uncommitted_wei": self.ao(),
  "refunds_owed_wei": int(self.q),
  "queued": len(self.B),
  "total_queued": int(self.P),
  "total_released_wei": int(self.A),
  "authorized_queuers": z,
  "queue_is_permissioned": True,
  "release_is_permissionless": True,
  "oracle_rubric": aI,
  "note": "terms are snapshotted into each payout when it is queued; "
                    "set_terms moves the defaults for payouts queued after it",
  "authorization_note": "queue_payout is owner-or-whitelist and binds "
                                  "recipient, amount and purpose to one "
                                  "assessment id, pinning its evidence digest; "
                                  "release refuses if that digest has changed",
  }
 @gl.public.view
 def refund_of(self, Q: str) -> typing.Any:
  r = Address(str(Q))
  return {"address": str(r.as_hex),
  "refund_wei": int(self.O.get(r) or 0)}
 @gl.public.write
 def set_terms(self, H: str, g: int, t: int) -> typing.Any:
  self.K()
  m = str(H)
  if m not in J:
   raise gl.vm.UserError(R + " mode must be one of "
   + ",".join(J))
  E = f(g, -1)
  if E < T or E > 100:
   raise gl.vm.UserError(R + " min_score must be between "
   + str(T) + " and 100")
  ag = f(t, -1)
  if ag <= 0 or ag > X:
   raise gl.vm.UserError(R + " max_age must be between 1 and "
   + str(X) + " seconds")
  bj = {"mode": str(self.H), "min_score": int(self.g),
  "max_age_seconds": int(self.t)}
  self.H = m
  self.g = u32(E)
  self.t = u64(ag)
  return {"status": "OK", "was": bj,
  "now": {"mode": m, "min_score": E, "max_age_seconds": ag},
  "applies_to": "payouts queued after this call; the "
  + str(len(self.B))
  + " already queued keep their own terms"}
 @gl.public.write
 def authorize_queuer(self, Q: str) -> typing.Any:
  self.K()
  r = Address(str(Q))
  if r == Address("0x" + "0" * 40):
   raise gl.vm.UserError(R + " queuer cannot be the zero address")
  aP = bool(self.z.get(r) or False)
  if not aP:
   if len(self.x) >= Y:
    raise gl.vm.UserError(R + " the whitelist is full at "
    + str(Y))
   if not self.ba(r):
    self.x.append(r)
  self.z[r] = True
  return {"status": "OK", "queuer": str(r.as_hex), "authorized": True,
  "was_already_authorized": aP,
  "note": "may queue payouts; release stays permissionless and "
                        "payouts already queued are unaffected by this call"}
 @gl.public.write
 def revoke_queuer(self, Q: str) -> typing.Any:
  self.K()
  r = Address(str(Q))
  bk = bool(self.z.get(r) or False)
  self.z[r] = False
  return {"status": "OK", "queuer": str(r.as_hex), "authorized": False,
  "was_authorized": bk,
  "applies_to": "future queue_payout calls only; the "
  + str(len(self.B))
  + " payouts already queued keep their "
                                "authorisation and stay releasable"}
 @gl.public.view
 def can_queue(self, Q: str) -> typing.Any:
  r = Address(str(Q))
  aJ = r == self.U
  return {"address": str(r.as_hex), "can_queue":
  aJ or bool(self.z.get(r) or False),
  "is_owner": aJ,
  "is_whitelisted": bool(self.z.get(r) or False)}
 @gl.public.view
 def get_queuers(self) -> typing.Any:
  av = []
  for i in range(len(self.x)):
   r = self.x[i]
   if bool(self.z.get(r) or False):
    av.append(str(r.as_hex))
  return {"owner": str(self.U.as_hex),
  "authorized_queuers": av, "count": len(av),
  "max_queuers": Y,
  "note": "the owner may always queue and is not listed here"}
 @gl.public.write
 def transfer_ownership(self, aV: str) -> typing.Any:
  self.K()
  r = Address(str(aV))
  if r == Address("0x" + "0" * 40):
   raise gl.vm.UserError(R + " owner cannot be zero")
  self.U = r
  return {"status": "OK", "owner": str(r.as_hex)}
 @gl.public.write
 def withdraw_uncommitted(self, j: int) -> typing.Any:
  self.K()
  ae = f(j, -1)
  aB = self.ao()
  if ae <= 0 or ae > aB:
   raise gl.vm.UserError(
   R + " uncommitted balance is " + str(aB) + " wei (holds "
   + str(int(self.c)) + ", committed "
   + str(int(self.d)) + ", owes "
   + str(int(self.q)) + ")")
  self.c = u256(int(self.c) - ae)
  _Payee(self.U).emit(value=u256(ae))
  return {"status": "OK", "withdrawn_wei": ae,
  "uncommitted_wei": aB - ae}
