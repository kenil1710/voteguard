# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import typing
an = 400
at = 200
aq = 400
S = 70
V = 30 * 86400
F = 1
I = 365 * 86400
w = ("RECOMMEND", "RECOMMEND_OR_CAUTION")
L = "[EXPECTED]"
E = "QUEUED"
W = "RELEASED"
T = "CANCELLED"
def ax(s: str) -> str:
 return " ".join(str(s).split())
def ag(s: str, n: int) -> str:
 s = str(s)
 return s[:n] if len(s) > n else s
def ah(s: typing.Any, n: int) -> str:
 M = []
 for ch in str(s):
  M.append(ch if 32 <= ord(ch) < 127 else " ")
 return ax(ax("".join(M))[:n])
def j(v: typing.Any, au: int) -> int:
 if isinstance(v, bool) or not isinstance(v, int):
  return au
 return int(v)
def ai(u: str, k: str) -> bool:
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
 aj: str
 C: Address
 x: u256
 U: Address
 D: str
 N: u64
 K: u64
 l: Address
 u: str
 c: u32
 h: u64
 k: str
 q: u32
 r: u32
 O: str
class GovernanceConsumer(gl.Contract):
 Q: Address
 l: Address
 u: str
 c: u32
 h: u64
 t: DynArray[Payout]
 a: u256
 b: u256
 z: TreeMap[Address, u256]
 f: u256
 A: u256
 o: u256
 def __init__(self, l: str):
  self.Q = gl.message.sender_address
  self.l = Address(str(l))
  self.u = w[0]
  self.c = u32(S)
  self.h = u64(V)
  self.a = u256(0)
  self.b = u256(0)
  self.f = u256(0)
  self.A = u256(0)
  self.o = u256(0)
 def Z(self) -> int:
  return int(datetime.now(timezone.utc).timestamp())
 def J(self) -> None:
  if gl.message.sender_address != self.Q:
   raise gl.vm.UserError(L + " owner only")
 def ay(self, ad: Address, d: int) -> None:
  if d <= 0:
   return
  self.z[ad] = u256(int(self.z.get(ad) or 0) + d)
  self.f = u256(int(self.f) + d)
 def B(self, O: str) -> dict:
  self.ay(gl.message.sender_address, int(gl.message.value))
  return {"status": "REJECTED", "reason": ag(O, 200),
  "refund_wei": int(gl.message.value)}
 def R(self) -> int:
  aa = (int(self.a) - int(self.b)
  - int(self.f))
  return aa if aa > 0 else 0
 def ak(self, l: Address, ao: str) -> dict:
  try:
   aC = IVoteGuard(l).view().get_risk_summary(str(ao))
  except Exception:
   return {"known": False, "verdict": "UNREACHABLE"}
  if not isinstance(aC, dict):
   return {"known": False, "verdict": "UNREADABLE"}
  return aC
 def ae(self, p: Payout, now: int) -> dict:
  return {
  "payout_id": int(p.g),
  "proposal_url": str(p.e),
  "memo": str(p.aj),
  "recipient": str(p.C.as_hex),
  "amount_wei": int(p.x),
  "proposer": str(p.U.as_hex),
  "status": str(p.D),
  "queued_at": int(p.N),
  "settled_at": int(p.K),
  "age_seconds": now - int(p.N),
  "terms": {"oracle": str(p.l.as_hex), "mode": str(p.u),
  "min_score": int(p.c),
  "max_age_seconds": int(p.h)},
  "verdict": str(p.k),
  "score": int(p.q),
  "assessment_id": int(p.r),
  "reason": str(p.O),
  }
 def av(self, g: int) -> typing.Any:
  i = j(g, -1)
  if i < 0 or i >= len(self.t):
   return None
  return self.t[i]
 @gl.public.write.payable
 def fund(self) -> typing.Any:
  self.a = u256(int(self.a) + int(gl.message.value))
  return {"status": "OK", "added_wei": int(gl.message.value),
  "balance_wei": int(self.a),
  "uncommitted_wei": self.R()}
 @gl.public.view
 def preflight(self, e: str) -> typing.Any:
  s = self.ak(self.l, e)
  now = self.Z()
  af = bool(s.get("known"))
  k = str(s.get("verdict", "UNKNOWN"))
  q = j(s.get("score"), 0)
  P = j(s.get("age_seconds"), 0)
  G = []
  if not af:
   G.append("no assessment on record")
  else:
   if not ai(str(self.u), k):
    G.append("verdict is " + k + ", this treasury "
                               "requires " + str(self.u))
   if q < int(self.c):
    G.append("score " + str(q) + " is below the required "
    + str(int(self.c)))
   if P > int(self.h):
    G.append("assessment is " + str(P) + "s old, older "
                               "than the " + str(int(self.h)) + "s limit")
  return {
  "would_release": len(G) == 0,
  "proposal_url": ag(str(e), an),
  "known": af, "verdict": k, "score": q,
  "age_seconds": P,
  "worst_dimension": str(s.get("worst_dimension", "")),
  "worst_label": str(s.get("worst_label", "")),
  "flags": s.get("flags") if isinstance(s.get("flags"), list) else [],
  "title": str(s.get("title", "")),
  "dao": str(s.get("dao", "")),
  "blockers": G,
  "terms": {"oracle": str(self.l.as_hex), "mode": str(self.u),
  "min_score": int(self.c),
  "max_age_seconds": int(self.h)},
  }
 @gl.public.view
 def strict_release(self, r: int) -> typing.Any:
  return IVoteGuard(self.l).view().require_recommended(
  j(r, -1))
 @gl.public.write.payable
 def queue_payout(self, e: str, aj: str, C: str,
 x: int) -> typing.Any:
  value = int(gl.message.value)
  now = self.Z()
  self.a = u256(int(self.a) + value)
  ao = ah(e, an)
  if ao == "" or ao.find(" ") >= 0:
   return self.B("proposal url is empty or malformed")
  if not ao.lower().startswith("https://"):
   return self.B("proposal url must start with https://")
  try:
   to = Address(str(C))
  except Exception:
   return self.B("recipient is not an address")
  if to == Address("0x" + "0" * 40):
   return self.B("recipient cannot be the zero address")
  d = j(x, -1)
  if d <= 0:
   return self.B("amount must be positive")
  if len(self.t) >= aq:
   return self.B("queue is full")
  if d > self.R():
   return self.B(
   "treasury holds " + str(int(self.a))
   + " wei, of which " + str(int(self.b))
   + " is already committed and " + str(int(self.f))
   + " is owed as refunds")
  p = self.t.append_new_get()
  p.g = u32(len(self.t) - 1)
  p.e = ao
  p.aj = ah(aj, at)
  p.C = to
  p.x = u256(d)
  p.U = gl.message.sender_address
  p.D = E
  p.N = u64(now)
  p.l = self.l
  p.u = str(self.u)
  p.c = u32(int(self.c))
  p.h = u64(int(self.h))
  self.b = u256(int(self.b) + d)
  self.A = u256(int(self.A) + 1)
  M = self.ae(p, now)
  M["status_code"] = "OK"
  M["uncommitted_wei"] = self.R()
  return M
 @gl.public.write
 def release(self, g: int) -> typing.Any:
  p = self.av(g)
  if p is None:
   raise gl.vm.UserError(L + " no such payout")
  if str(p.D) != E:
   raise gl.vm.UserError(L + " payout is already "
   + str(p.D).lower())
  s = self.ak(p.l, str(p.e))
  now = self.Z()
  af = bool(s.get("known"))
  k = str(s.get("verdict", "UNKNOWN"))
  q = j(s.get("score"), 0)
  P = j(s.get("age_seconds"), 0)
  H = ""
  if not af:
   H = "no assessment on record for that proposal"
  elif not ai(str(p.u), k):
   H = ("verdict is " + k + "; this payout requires "
   + str(p.u))
  elif q < int(p.c):
   H = ("score " + str(q) + " is below the required "
   + str(int(p.c)))
  elif P > int(p.h):
   H = ("assessment is " + str(P) + "s old, older than the "
   + str(int(p.h)) + "s this payout allows")
  if H != "":
   raise gl.vm.UserError(
   L + " refused: " + H + " (" + ag(str(p.aj), 60)
   + ")")
  d = int(p.x)
  p.D = W
  p.K = u64(now)
  p.k = k
  p.q = u32(q)
  p.r = u32(j(s.get("assessment_id"), 0))
  p.O = ah(s.get("title"), 120)
  self.b = u256(int(self.b) - d)
  self.a = u256(int(self.a) - d)
  self.o = u256(int(self.o) + d)
  _Payee(p.C).emit(value=u256(d))
  M = self.ae(p, now)
  M["status_code"] = "RELEASED"
  return M
 @gl.public.write
 def cancel_payout(self, g: int) -> typing.Any:
  p = self.av(g)
  if p is None:
   raise gl.vm.UserError(L + " no such payout")
  if str(p.D) != E:
   raise gl.vm.UserError(L + " payout is already "
   + str(p.D).lower())
  al = gl.message.sender_address
  if al != p.U and al != self.Q:
   raise gl.vm.UserError(L + " only the queuer or the owner may "
                                        "cancel")
  p.D = T
  p.K = u64(self.Z())
  p.O = "cancelled by " + str(al.as_hex)
  self.b = u256(int(self.b) - int(p.x))
  return {"status": "OK", "payout_id": int(p.g),
  "uncommitted_wei": self.R()}
 @gl.public.write
 def claim_refund(self) -> typing.Any:
  ad = gl.message.sender_address
  d = int(self.z.get(ad) or 0)
  if d <= 0:
   return {"status": "NOTHING_OWED", "refund_wei": 0}
  self.z[ad] = u256(0)
  self.f = u256(int(self.f) - d)
  self.a = u256(int(self.a) - d)
  _Payee(ad).emit(value=u256(d))
  return {"status": "OK", "refund_wei": d}
 @gl.public.view
 def get_payout(self, g: int) -> typing.Any:
  p = self.av(g)
  if p is None:
   return {"found": False, "payout_id": j(g, -1)}
  M = self.ae(p, self.Z())
  M["found"] = True
  return M
 @gl.public.view
 def get_payouts(self, az: int, aB: int) -> typing.Any:
  X = j(az, 0)
  if X < 0:
   X = 0
  n = j(aB, 0)
  if n <= 0 or n > 100:
   n = 100
  now = self.Z()
  aw = []
  for i in range(X, min(X + n, len(self.t))):
   aw.append(self.ae(self.t[i], now))
  return {"total": len(self.t), "offset": X,
  "returned": len(aw), "payouts": aw}
 @gl.public.view
 def get_terms(self) -> typing.Any:
  am = {}
  try:
   ap = IVoteGuard(self.l).view().get_config()
   if isinstance(ap, dict):
    am = {"rubric_version": ap.get("rubric_version"),
    "verdicts": ap.get("verdicts"),
    "verdict_thresholds": ap.get("verdict_thresholds"),
    "fee_wei": ap.get("fee_wei"),
    "paused": ap.get("paused")}
  except Exception:
   am = {"error": "oracle unreachable"}
  return {
  "owner": str(self.Q.as_hex),
  "oracle": str(self.l.as_hex),
  "oracle_is_immutable": True,
  "mode": str(self.u),
  "accepted_modes": list(w),
  "min_score": int(self.c),
  "max_age_seconds": int(self.h),
  "balance_wei": int(self.a),
  "committed_wei": int(self.b),
  "uncommitted_wei": self.R(),
  "refunds_owed_wei": int(self.f),
  "queued": len(self.t),
  "total_queued": int(self.A),
  "total_released_wei": int(self.o),
  "oracle_rubric": am,
  "note": "terms are snapshotted into each payout when it is queued; "
                    "set_terms moves the defaults for payouts queued after it",
  }
 @gl.public.view
 def refund_of(self, ad: str) -> typing.Any:
  ab = Address(str(ad))
  return {"address": str(ab.as_hex),
  "refund_wei": int(self.z.get(ab) or 0)}
 @gl.public.write
 def set_terms(self, u: str, c: int, h: int) -> typing.Any:
  self.J()
  m = str(u)
  if m not in w:
   raise gl.vm.UserError(L + " mode must be one of "
   + ",".join(w))
  q = j(c, -1)
  if q < F or q > 100:
   raise gl.vm.UserError(L + " min_score must be between "
   + str(F) + " and 100")
  P = j(h, -1)
  if P <= 0 or P > I:
   raise gl.vm.UserError(L + " max_age must be between 1 and "
   + str(I) + " seconds")
  aG = {"mode": str(self.u), "min_score": int(self.c),
  "max_age_seconds": int(self.h)}
  self.u = m
  self.c = u32(q)
  self.h = u64(P)
  return {"status": "OK", "was": aG,
  "now": {"mode": m, "min_score": q, "max_age_seconds": P},
  "applies_to": "payouts queued after this call; the "
  + str(len(self.t))
  + " already queued keep their own terms"}
 @gl.public.write
 def transfer_ownership(self, ar: str) -> typing.Any:
  self.J()
  ab = Address(str(ar))
  if ab == Address("0x" + "0" * 40):
   raise gl.vm.UserError(L + " owner cannot be zero")
  self.Q = ab
  return {"status": "OK", "owner": str(ab.as_hex)}
 @gl.public.write
 def withdraw_uncommitted(self, d: int) -> typing.Any:
  self.J()
  ac = j(d, -1)
  aa = self.R()
  if ac <= 0 or ac > aa:
   raise gl.vm.UserError(
   L + " uncommitted balance is " + str(aa) + " wei (holds "
   + str(int(self.a)) + ", committed "
   + str(int(self.b)) + ", owes "
   + str(int(self.f)) + ")")
  self.a = u256(int(self.a) - ac)
  _Payee(self.Q).emit(value=u256(ac))
  return {"status": "OK", "withdrawn_wei": ac,
  "uncommitted_wei": aa - ac}
