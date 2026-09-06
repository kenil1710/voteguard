# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import typing
ao = 400
au = 200
ar = 400
T = 70
W = 30 * 86400
G = 1
J = 365 * 86400
w = ("RECOMMEND", "RECOMMEND_OR_CAUTION")
M = "[EXPECTED]"
F = "QUEUED"
X = "RELEASED"
U = "CANCELLED"
def ay(s: str) -> str:
 return " ".join(str(s).split())
def ah(s: str, n: int) -> str:
 s = str(s)
 return s[:n] if len(s) > n else s
def ai(s: typing.Any, n: int) -> str:
 N = []
 for ch in str(s):
  N.append(ch if 32 <= ord(ch) < 127 else " ")
 return ay(ay("".join(N))[:n])
def j(v: typing.Any, av: int) -> int:
 if isinstance(v, bool) or not isinstance(v, int):
  return av
 return int(v)
def aj(u: str, k: str) -> bool:
 if str(k) == "RECOMMEND":
  return True
 return str(u) == "RECOMMEND_OR_CAUTION" and str(k) == "CAUTION"
@gl.contract_interface
class IVoteGuard:
 class View:
  def get_risk_summary(self, e: str) -> typing.Any: ...
  def require_recommended(self, r: int) -> typing.Any: ...
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
 g: u32
 e: str
 ak: str
 D: Address
 x: u256
 V: Address
 E: str
 O: u64
 L: u64
 l: Address
 u: str
 c: u32
 h: u64
 k: str
 q: u32
 r: u32
 P: str
class GovernanceConsumer(gl.Contract):
 R: Address
 l: Address
 u: str
 c: u32
 h: u64
 t: DynArray[Payout]
 a: u256
 b: u256
 A: TreeMap[Address, u256]
 f: u256
 B: u256
 o: u256
 z: u256
 def __init__(self, l: str):
  self.R = gl.message.sender_address
  self.l = Address(str(l))
  self.u = w[0]
  self.c = u32(T)
  self.h = u64(W)
  self.a = u256(0)
  self.b = u256(0)
  self.f = u256(0)
  self.B = u256(0)
  self.o = u256(0)
  self.z = u256(0)
 def aa(self) -> int:
  return int(datetime.now(timezone.utc).timestamp())
 def K(self) -> None:
  if gl.message.sender_address != self.R:
   raise gl.vm.UserError(M + " owner only")
 def az(self, ae: Address, d: int) -> None:
  if d <= 0:
   return
  self.A[ae] = u256(int(self.A.get(ae) or 0) + d)
  self.f = u256(int(self.f) + d)
 def C(self, P: str) -> dict:
  self.az(gl.message.sender_address, int(gl.message.value))
  return {"status": "REJECTED", "reason": ah(P, 200),
  "refund_wei": int(gl.message.value)}
 def S(self) -> int:
  ab = (int(self.a) - int(self.b)
  - int(self.f))
  return ab if ab > 0 else 0
 def al(self, l: Address, ap: str) -> dict:
  try:
   aD = IVoteGuard(l).view().get_risk_summary(str(ap))
  except Exception:
   return {"known": False, "verdict": "UNREACHABLE"}
  if not isinstance(aD, dict):
   return {"known": False, "verdict": "UNREADABLE"}
  return aD
 def af(self, p: Payout, now: int) -> dict:
  return {
  "payout_id": int(p.g),
  "proposal_url": str(p.e),
  "memo": str(p.ak),
  "recipient": str(p.D.as_hex),
  "amount_wei": int(p.x),
  "proposer": str(p.V.as_hex),
  "status": str(p.E),
  "queued_at": int(p.O),
  "settled_at": int(p.L),
  "age_seconds": now - int(p.O),
  "terms": {"oracle": str(p.l.as_hex), "mode": str(p.u),
  "min_score": int(p.c),
  "max_age_seconds": int(p.h)},
  "verdict": str(p.k),
  "score": int(p.q),
  "assessment_id": int(p.r),
  "reason": str(p.P),
  }
 def aw(self, g: int) -> typing.Any:
  i = j(g, -1)
  if i < 0 or i >= len(self.t):
   return None
  return self.t[i]
 @gl.public.write.payable
 def fund(self) -> typing.Any:
  self.a = u256(int(self.a) + int(gl.message.value))
  return {"status": "OK", "added_wei": int(gl.message.value),
  "balance_wei": int(self.a),
  "uncommitted_wei": self.S()}
 @gl.public.view
 def preflight(self, e: str) -> typing.Any:
  s = self.al(self.l, e)
  now = self.aa()
  ag = bool(s.get("known"))
  k = str(s.get("verdict", "UNKNOWN"))
  q = j(s.get("score"), 0)
  Q = j(s.get("age_seconds"), 0)
  H = []
  if not ag:
   H.append("no assessment on record")
  else:
   if not aj(str(self.u), k):
    H.append("verdict is " + k + ", this treasury "
                               "requires " + str(self.u))
   if q < int(self.c):
    H.append("score " + str(q) + " is below the required "
    + str(int(self.c)))
   if Q > int(self.h):
    H.append("assessment is " + str(Q) + "s old, older "
                               "than the " + str(int(self.h)) + "s limit")
  return {
  "would_release": len(H) == 0,
  "proposal_url": ah(str(e), ao),
  "known": ag, "verdict": k, "score": q,
  "age_seconds": Q,
  "worst_dimension": str(s.get("worst_dimension", "")),
  "worst_label": str(s.get("worst_label", "")),
  "flags": s.get("flags") if isinstance(s.get("flags"), list) else [],
  "title": str(s.get("title", "")),
  "dao": str(s.get("dao", "")),
  "blockers": H,
  "terms": {"oracle": str(self.l.as_hex), "mode": str(self.u),
  "min_score": int(self.c),
  "max_age_seconds": int(self.h)},
  }
 @gl.public.view
 def strict_release(self, r: int) -> typing.Any:
  return IVoteGuard(self.l).view().require_recommended(
  j(r, -1))
 @gl.public.write.payable
 def queue_payout(self, e: str, ak: str, D: str,
 x: int) -> typing.Any:
  value = int(gl.message.value)
  now = self.aa()
  self.a = u256(int(self.a) + value)
  ap = ai(e, ao)
  if ap == "" or ap.find(" ") >= 0:
   return self.C("proposal url is empty or malformed")
  if not ap.lower().startswith("https://"):
   return self.C("proposal url must start with https://")
  try:
   to = Address(str(D))
  except Exception:
   return self.C("recipient is not an address")
  if to == Address("0x" + "0" * 40):
   return self.C("recipient cannot be the zero address")
  d = j(x, -1)
  if d <= 0:
   return self.C("amount must be positive")
  if len(self.t) >= ar:
   return self.C("queue is full")
  if d > self.S():
   return self.C(
   "treasury holds " + str(int(self.a))
   + " wei, of which " + str(int(self.b))
   + " is already committed and " + str(int(self.f))
   + " is owed as refunds")
  p = self.t.append_new_get()
  p.g = u32(len(self.t) - 1)
  p.e = ap
  p.ak = ai(ak, au)
  p.D = to
  p.x = u256(d)
  p.V = gl.message.sender_address
  p.E = F
  p.O = u64(now)
  p.l = self.l
  p.u = str(self.u)
  p.c = u32(int(self.c))
  p.h = u64(int(self.h))
  self.b = u256(int(self.b) + d)
  self.B = u256(int(self.B) + 1)
  N = self.af(p, now)
  N["status_code"] = "OK"
  N["uncommitted_wei"] = self.S()
  return N
 @gl.public.write
 def release(self, g: int) -> typing.Any:
  p = self.aw(g)
  if p is None:
   raise gl.vm.UserError(M + " no such payout")
  if str(p.E) != F:
   raise gl.vm.UserError(M + " payout is already "
   + str(p.E).lower())
  s = self.al(p.l, str(p.e))
  now = self.aa()
  ag = bool(s.get("known"))
  k = str(s.get("verdict", "UNKNOWN"))
  q = j(s.get("score"), 0)
  Q = j(s.get("age_seconds"), 0)
  I = ""
  if not ag:
   I = "no assessment on record for that proposal"
  elif not aj(str(p.u), k):
   I = ("verdict is " + k + "; this payout requires "
   + str(p.u))
  elif q < int(p.c):
   I = ("score " + str(q) + " is below the required "
   + str(int(p.c)))
  elif Q > int(p.h):
   I = ("assessment is " + str(Q) + "s old, older than the "
   + str(int(p.h)) + "s this payout allows")
  if I != "":
   self.z = u256(int(self.z) + 1)
   raise gl.vm.UserError(
   M + " refused: " + I + " (" + ah(str(p.ak), 60)
   + ")")
  d = int(p.x)
  p.E = X
  p.L = u64(now)
  p.k = k
  p.q = u32(q)
  p.r = u32(j(s.get("assessment_id"), 0))
  p.P = ai(s.get("title"), 120)
  self.b = u256(int(self.b) - d)
  self.a = u256(int(self.a) - d)
  self.o = u256(int(self.o) + d)
  _Payee(p.D).emit(value=u256(d))
  N = self.af(p, now)
  N["status_code"] = "RELEASED"
  return N
 @gl.public.write
 def cancel_payout(self, g: int) -> typing.Any:
  p = self.aw(g)
  if p is None:
   raise gl.vm.UserError(M + " no such payout")
  if str(p.E) != F:
   raise gl.vm.UserError(M + " payout is already "
   + str(p.E).lower())
  am = gl.message.sender_address
  if am != p.V and am != self.R:
   raise gl.vm.UserError(M + " only the queuer or the owner may "
                                        "cancel")
  p.E = U
  p.L = u64(self.aa())
  p.P = "cancelled by " + str(am.as_hex)
  self.b = u256(int(self.b) - int(p.x))
  return {"status": "OK", "payout_id": int(p.g),
  "uncommitted_wei": self.S()}
 @gl.public.write
 def claim_refund(self) -> typing.Any:
  ae = gl.message.sender_address
  d = int(self.A.get(ae) or 0)
  if d <= 0:
   return {"status": "NOTHING_OWED", "refund_wei": 0}
  self.A[ae] = u256(0)
  self.f = u256(int(self.f) - d)
  self.a = u256(int(self.a) - d)
  _Payee(ae).emit(value=u256(d))
  return {"status": "OK", "refund_wei": d}
 @gl.public.view
 def get_payout(self, g: int) -> typing.Any:
  p = self.aw(g)
  if p is None:
   return {"found": False, "payout_id": j(g, -1)}
  N = self.af(p, self.aa())
  N["found"] = True
  return N
 @gl.public.view
 def get_payouts(self, aA: int, aC: int) -> typing.Any:
  Y = j(aA, 0)
  if Y < 0:
   Y = 0
  n = j(aC, 0)
  if n <= 0 or n > 100:
   n = 100
  now = self.aa()
  ax = []
  for i in range(Y, min(Y + n, len(self.t))):
   ax.append(self.af(self.t[i], now))
  return {"total": len(self.t), "offset": Y,
  "returned": len(ax), "payouts": ax}
 @gl.public.view
 def get_terms(self) -> typing.Any:
  an = {}
  try:
   aq = IVoteGuard(self.l).view().get_config()
   if isinstance(aq, dict):
    an = {"rubric_version": aq.get("rubric_version"),
    "verdicts": aq.get("verdicts"),
    "verdict_thresholds": aq.get("verdict_thresholds"),
    "fee_wei": aq.get("fee_wei"),
    "paused": aq.get("paused")}
  except Exception:
   an = {"error": "oracle unreachable"}
  return {
  "owner": str(self.R.as_hex),
  "oracle": str(self.l.as_hex),
  "oracle_is_immutable": True,
  "mode": str(self.u),
  "accepted_modes": list(w),
  "min_score": int(self.c),
  "max_age_seconds": int(self.h),
  "balance_wei": int(self.a),
  "committed_wei": int(self.b),
  "uncommitted_wei": self.S(),
  "refunds_owed_wei": int(self.f),
  "queued": len(self.t),
  "total_queued": int(self.B),
  "total_released_wei": int(self.o),
  "total_refused": int(self.z),
  "oracle_rubric": an,
  "note": "terms are snapshotted into each payout when it is queued; "
                    "set_terms moves the defaults for payouts queued after it",
  }
 @gl.public.view
 def refund_of(self, ae: str) -> typing.Any:
  ac = Address(str(ae))
  return {"address": str(ac.as_hex),
  "refund_wei": int(self.A.get(ac) or 0)}
 @gl.public.write
 def set_terms(self, u: str, c: int, h: int) -> typing.Any:
  self.K()
  m = str(u)
  if m not in w:
   raise gl.vm.UserError(M + " mode must be one of "
   + ",".join(w))
  q = j(c, -1)
  if q < G or q > 100:
   raise gl.vm.UserError(M + " min_score must be between "
   + str(G) + " and 100")
  Q = j(h, -1)
  if Q <= 0 or Q > J:
   raise gl.vm.UserError(M + " max_age must be between 1 and "
   + str(J) + " seconds")
  aH = {"mode": str(self.u), "min_score": int(self.c),
  "max_age_seconds": int(self.h)}
  self.u = m
  self.c = u32(q)
  self.h = u64(Q)
  return {"status": "OK", "was": aH,
  "now": {"mode": m, "min_score": q, "max_age_seconds": Q},
  "applies_to": "payouts queued after this call; the "
  + str(len(self.t))
  + " already queued keep their own terms"}
 @gl.public.write
 def transfer_ownership(self, at: str) -> typing.Any:
  self.K()
  ac = Address(str(at))
  if ac == Address("0x" + "0" * 40):
   raise gl.vm.UserError(M + " owner cannot be zero")
  self.R = ac
  return {"status": "OK", "owner": str(ac.as_hex)}
 @gl.public.write
 def withdraw_uncommitted(self, d: int) -> typing.Any:
  self.K()
  ad = j(d, -1)
  ab = self.S()
  if ad <= 0 or ad > ab:
   raise gl.vm.UserError(
   M + " uncommitted balance is " + str(ab) + " wei (holds "
   + str(int(self.a)) + ", committed "
   + str(int(self.b)) + ", owes "
   + str(int(self.f)) + ")")
  self.a = u256(int(self.a) - ad)
  _Payee(self.R).emit(value=u256(ad))
  return {"status": "OK", "withdrawn_wei": ad,
  "uncommitted_wei": ab - ad}
