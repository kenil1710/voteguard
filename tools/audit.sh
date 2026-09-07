#!/usr/bin/env bash
# Repository + live-deployment audit.
#
#   bash tools/audit.sh                       # local checks only
#   bash tools/audit.sh --network=bradbury    # also check the LIVE contract
#
# Checks the deployed contract and the built artifacts, not just the source.
# A repository can be internally consistent and still describe something that
# is not on chain, which is the failure this exists to catch.
set -uo pipefail
cd "$(dirname "$0")/.."

NETWORK=""
for arg in "$@"; do
  case "$arg" in
    --network=*) NETWORK="${arg#*=}" ;;
  esac
done

PASS=0
FAIL=0
SKIP=0
FAILED_LINES=()

ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED_LINES+=("$1"); printf '  FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP+1)); printf '  --    %s (skipped)\n' "$1"; }
check(){ if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

section() { printf '\n%s\n' "$1"; }

printf '\nVoteGuard audit\n'

# ---------------------------------------------------------------------------
section "1. the artifacts are what the repository says they are"
# ---------------------------------------------------------------------------
for name in VoteGuard GovernanceConsumer; do
  art="build/$name.min.py"
  if [ ! -f "$art" ]; then bad "$art exists"; continue; fi
  ok "$art exists"
  want=$(python3 -c "import json;print(json.load(open('deployments.json'))['artifacts']['build/$name.min.py']['sha256'])" 2>/dev/null)
  got=$(shasum -a 256 "$art" | cut -d' ' -f1)
  if [ "$want" = "$got" ]; then ok "$name checksum matches deployments.json"
  else bad "$name checksum: recorded $want, actual $got"; fi
  wantb=$(python3 -c "import json;print(json.load(open('deployments.json'))['artifacts']['build/$name.min.py']['bytes'])" 2>/dev/null)
  gotb=$(wc -c < "$art" | tr -d ' ')
  if [ "$wantb" = "$gotb" ]; then ok "$name byte count matches deployments.json"
  else bad "$name bytes: recorded $wantb, actual $gotb"; fi
  check "$name artifact parses" "python3 -c \"import ast,sys;ast.parse(open('$art').read())\""
  check "$name pre-mangle source is committed for diffing" "[ -f build/$name.premangle.py ]"
done

# The MEASURED ceiling, re-measured for this project on 2026-09-06:
# 52,804 accepted, 53,200 refused (BlockPubdataLimitReached).
size=$(wc -c < build/VoteGuard.min.py | tr -d ' ')
if [ "$size" -le 52700 ]; then ok "VoteGuard fits the measured Bradbury ceiling ($size ≤ 52,700 budget, 52,804 proven)"
else bad "VoteGuard is $size bytes; budget is 52,700 and 53,200 is proven to fail"; fi

# ---------------------------------------------------------------------------
section "2. the runner pin"
# ---------------------------------------------------------------------------
for f in contracts/VoteGuard.py contracts/GovernanceConsumer.py build/VoteGuard.min.py build/GovernanceConsumer.min.py; do
  first=$(head -1 "$f")
  case "$first" in
    '# { "Depends": "py-genlayer:'*) ok "$f pins the runner on line 1" ;;
    *) bad "$f line 1 is not the runner pin: ${first:0:50}" ;;
  esac
done
check "the pin is a concrete hash, not a test/latest alias" \
  "! head -1 contracts/VoteGuard.py | grep -qE 'py-genlayer:(test|latest)'"

# ---------------------------------------------------------------------------
section "3. money safety, checked against the AST"
# ---------------------------------------------------------------------------
python3 - <<'PY'
import ast, sys
bad = []
for path in ("contracts/VoteGuard.py", "contracts/GovernanceConsumer.py",
             "build/VoteGuard.min.py", "build/GovernanceConsumer.min.py"):
    tree = ast.parse(open(path).read())
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.FunctionDef):
            continue
        payable = any(isinstance(d, ast.Attribute) and d.attr == "payable"
                      for d in fn.decorator_list)
        if payable:
            raises = [s.lineno for s in ast.walk(fn) if isinstance(s, ast.Raise)]
            if raises:
                bad.append(f"{path}:{fn.name} raises at {raises}")
print("PAYABLE_RAISES=" + ("|".join(bad) if bad else "none"))
PY
raises=$(python3 - <<'PY'
import ast
bad = []
for path in ("contracts/VoteGuard.py", "contracts/GovernanceConsumer.py",
             "build/VoteGuard.min.py", "build/GovernanceConsumer.min.py"):
    tree = ast.parse(open(path).read())
    for fn in ast.walk(tree):
        if isinstance(fn, ast.FunctionDef) and any(
                isinstance(d, ast.Attribute) and d.attr == "payable"
                for d in fn.decorator_list):
            if [s for s in ast.walk(fn) if isinstance(s, ast.Raise)]:
                bad.append(f"{path}:{fn.name}")
print("|".join(bad))
PY
)
if [ -z "$raises" ]; then ok "no payable method raises, in any source or artifact"
else bad "payable methods that raise: $raises"; fi

nobal=$(python3 - <<'PY'
import ast
bad = []
for path in ("contracts/VoteGuard.py", "contracts/GovernanceConsumer.py",
             "build/VoteGuard.min.py", "build/GovernanceConsumer.min.py"):
    for n in ast.walk(ast.parse(open(path).read())):
        if (isinstance(n, ast.Attribute) and n.attr in ("contract_balance", "get_balance")
                and isinstance(n.value, ast.Name) and n.value.id == "gl"):
            bad.append(f"{path}:{n.lineno}")
print("|".join(bad))
PY
)
if [ -z "$nobal" ]; then ok "nothing reads gl.contract_balance (it does not exist in this runner)"
else bad "gl.contract_balance is read at: $nobal"; fi

floats=$(python3 - <<'PY'
import ast
bad = []
for path in ("contracts/VoteGuard.py", "contracts/GovernanceConsumer.py",
             "build/VoteGuard.min.py", "build/GovernanceConsumer.min.py"):
    for n in ast.walk(ast.parse(open(path).read())):
        if isinstance(n, ast.Constant) and isinstance(n.value, float):
            bad.append(f"{path}:{n.lineno}")
print("|".join(bad))
PY
)
if [ -z "$floats" ]; then ok "no float literal anywhere (the same vector must give the same integer)"
else bad "float literals at: $floats"; fi

repl=$(python3 - <<'PY'
import ast
bad = []
for path in ("contracts/VoteGuard.py", "contracts/GovernanceConsumer.py",
             "build/VoteGuard.min.py", "build/GovernanceConsumer.min.py"):
    for n in ast.walk(ast.parse(open(path).read())):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "replace":
            bad.append(f"{path}:{n.lineno}")
print("|".join(bad))
PY
)
if [ -z "$repl" ]; then ok "no str.replace() call (the runner rejects it)"
else bad "str.replace at: $repl"; fi

# ---------------------------------------------------------------------------
section "4. the owner cannot reach a score or a refund"
# ---------------------------------------------------------------------------
owner=$(python3 - <<'PY'
import ast
tree = ast.parse(open("contracts/VoteGuard.py").read())
forbidden = {"verdict", "overall_score", "feeds", "evidence", "content_hash",
             "labels", "flags", "refund_wei", "id_index", "dao_feeds"}
bad = []
for fn in ast.walk(tree):
    if not isinstance(fn, ast.FunctionDef):
        continue
    calls = {s.func.attr for s in ast.walk(fn)
             if isinstance(s, ast.Call) and isinstance(s.func, ast.Attribute)}
    if "_only_owner" not in calls:
        continue
    for s in ast.walk(fn):
        if isinstance(s, ast.Attribute) and isinstance(s.ctx, ast.Store) and s.attr in forbidden:
            bad.append(f"{fn.name} writes {s.attr}")
print("|".join(bad))
PY
)
if [ -z "$owner" ]; then ok "no owner-gated method writes a verdict, score, feed or refund"
else bad "owner reaches: $owner"; fi

consts=$(python3 - <<'PY'
import ast
names = {"W_FEAS","W_BUDGET","W_CENTRAL","W_CLARITY","W_ALIGN","RECOMMEND_MIN",
         "CAUTION_MIN","ORD_BANDS","BUCKETS","FEATURE_RANGE","AMT_LADDER",
         "LEN_LADDER","WEIGHTS","RUBRIC_VERSION","Q_STEP","FLAG_NAMES"}
bad = []
for fn in ast.walk(ast.parse(open("contracts/VoteGuard.py").read())):
    if not isinstance(fn, ast.FunctionDef):
        continue
    for s in ast.walk(fn):
        if isinstance(s, ast.Name) and isinstance(s.ctx, ast.Store) and s.id in names:
            bad.append(f"{fn.name} assigns {s.id}")
print("|".join(bad))
PY
)
if [ -z "$consts" ]; then ok "no function assigns a rubric constant (governance cannot move a score)"
else bad "rubric constants assigned: $consts"; fi

check "GovernanceConsumer has no set_oracle" \
  "! grep -qE 'def set_oracle' contracts/GovernanceConsumer.py"

# ---------------------------------------------------------------------------
section "5. the test suites"
# ---------------------------------------------------------------------------
if out=$(python3 test/test_logic.py 2>&1 | tail -3); then
  n=$(printf '%s' "$out" | grep -oE 'Ran [0-9]+ tests' | grep -oE '[0-9]+')
  ok "offline suite passes ($n tests)"
else
  bad "offline suite FAILS"
fi
if out=$(node test/wallet_settle.mjs 2>&1 | tail -3); then
  n=$(printf '%s' "$out" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
  ok "the submit-settlement suite passes ($n checks)"
else
  bad "the submit-settlement suite FAILS"
fi
check "the live suite exists" "[ -f test/e2e.mjs ]"
check "fixtures were captured from the real platforms" \
  "python3 -c \"import json;d=json.load(open('test/fixtures.json'));assert d['snapshot_aave_arc']['status']==200;assert d['discourse_arbitrum']['status']==200;assert d['tally_uniswap_86']['status']==200\""
check "the SPA-shell finding is preserved as a fixture" \
  "python3 -c \"import json;d=json.load(open('test/fixtures.json'));a=d['spa_shell_snapshot_org']['body'];b=d['spa_shell_snapshot_box']['body'];assert a==b and len(a)==1363 and 'Aave' not in a\""
check "the slug-is-ignored finding is preserved as a fixture" \
  "python3 -c \"import json;d=json.load(open('test/fixtures.json'));assert d['discourse_arbitrum']['body']==d['discourse_wrong_slug']['body']\""

# ---------------------------------------------------------------------------
section "6. documentation says what the code does"
# ---------------------------------------------------------------------------
for f in README.md docs/PROBE.md contracts/NOTES.md deployments.json; do
  check "$f exists" "[ -s $f ]"
done
check "the probe contracts are kept as evidence" \
  "[ -f contracts/_render_probe.py ] && [ -f contracts/_judge_probe2.py ] && [ -f contracts/_bal_probe.py ]"
check "PROBE.md records the SPA finding" "grep -q '1,363' docs/PROBE.md"
check "PROBE.md records the measured size ceiling" "grep -q '52,804' docs/PROBE.md || grep -q '53,200' docs/PROBE.md"
check "NOTES.md records the one-rung tolerance" "grep -qi 'one-rung' contracts/NOTES.md"

# ---------------------------------------------------------------------------
section "7. the frontend"
# ---------------------------------------------------------------------------
if [ -d frontend ]; then
  # Subshells, deliberately: `check` runs eval in the CURRENT shell, so a bare
  # `cd frontend` leaked into every later check and made them all fail from the
  # wrong working directory.
  check "frontend typechecks" "(cd frontend && npx tsc --noEmit)"
  check "frontend lints with zero warnings" "(cd frontend && npx eslint . --max-warnings=0)"
  for page in "(marketing)/page.tsx" "(app)/analyze/page.tsx" "(app)/proposals/page.tsx" \
              "(app)/proposal/[id]/page.tsx" "(app)/dao/[name]/page.tsx" "(app)/docs/page.tsx"; do
    if [ -f "frontend/src/app/$page" ]; then ok "page exists: $page"
    else bad "page missing: $page"; fi
  done
  check "the marketing shell imports no chain state" \
    "! grep -q 'genlayer' 'frontend/src/app/(marketing)/layout.tsx'"
else
  skip "frontend checks"
fi

# ---------------------------------------------------------------------------
section "8. the LIVE deployment"
# ---------------------------------------------------------------------------
if [ -z "$NETWORK" ]; then
  skip "live contract checks (pass --network=bradbury)"
else
  net="$NETWORK"; [ "$net" = "bradbury" ] && net="testnet-bradbury"
  genlayer network set "$net" >/dev/null 2>&1
  ADDR=$(python3 -c "import json;print(json.load(open('deployments.json'))['deployments']['$NETWORK']['VoteGuard']['address'])" 2>/dev/null)
  CADDR=$(python3 -c "import json;print(json.load(open('deployments.json'))['deployments']['$NETWORK']['GovernanceConsumer']['address'])" 2>/dev/null)
  if [ -z "$ADDR" ]; then
    bad "deployments.json has no VoteGuard address for $NETWORK"
  else
    ok "deployments.json records VoteGuard on $NETWORK ($ADDR)"
    if python3 tools/verify_onchain.py "$ADDR" build/VoteGuard.min.py >/dev/null 2>&1; then
      ok "the code AT $ADDR is byte-identical to build/VoteGuard.min.py"
    else
      bad "the code at $ADDR DIFFERS from build/VoteGuard.min.py"
    fi
    cfg=$(genlayer call "$ADDR" get_config 2>/dev/null)
    echo "$cfg" | grep -q "rubric_version" && ok "get_config answers on chain" || bad "get_config is dead on chain"
    stats=$(genlayer call "$ADDR" get_stats 2>/dev/null)
    echo "$stats" | grep -q "total_analyzed" && ok "get_stats answers on chain" || bad "get_stats is dead on chain"
    n=$(echo "$stats" | grep -oE 'total_analyzed: [0-9]+' | grep -oE '[0-9]+')
    if [ "${n:-0}" -ge 3 ]; then ok "the live contract holds $n real assessments"
    else bad "the live contract holds only ${n:-0} assessments (want 3+)"; fi
  fi
  if [ -n "$CADDR" ]; then
    if python3 tools/verify_onchain.py "$CADDR" build/GovernanceConsumer.min.py >/dev/null 2>&1; then
      ok "the code AT $CADDR is byte-identical to build/GovernanceConsumer.min.py"
    else
      bad "the code at $CADDR DIFFERS from build/GovernanceConsumer.min.py"
    fi
    terms=$(genlayer call "$CADDR" get_terms 2>/dev/null)
    echo "$terms" | grep -q "oracle_rubric" && ok "get_terms answers on chain" || bad "get_terms is dead on chain"
    echo "$terms" | grep -qi "rubric_version" && ok "the consumer reads the oracle ACROSS the contract boundary" \
      || bad "the consumer cannot read the oracle"
    echo "$terms" | grep -q "oracle_is_immutable: true" && ok "the consumer's oracle is pinned" \
      || bad "the consumer does not report a pinned oracle"
  else
    skip "consumer live checks"
  fi
fi

# ---------------------------------------------------------------------------
printf '\n%s\n' "──────────────────────────────────────────────────────────────"
printf '%d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -gt 0 ]; then
  printf '\nfailures:\n'
  for f in "${FAILED_LINES[@]}"; do printf '  · %s\n' "$f"; done
  exit 1
fi
exit 0
