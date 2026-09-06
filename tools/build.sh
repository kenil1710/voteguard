#!/usr/bin/env bash
# Builds the deploy artifacts from the readable sources.
#
#   bash tools/build.sh
#
# Two stages, deliberately separate:
#   1. minify   — strips comments, docstrings and blank lines
#   2. mangle   — shortens identifiers, source untouched
#
# The readable source carries the reasoning; the chain carries the code. Both
# stages are verified rather than trusted: build/*.premangle.py is committed so
# `diff` can show the mangle did nothing but rename, and test/test_logic.py
# re-runs its whole battery against build/VoteGuard.min.py through the emitted
# name map.
set -euo pipefail
cd "$(dirname "$0")/.."

for name in VoteGuard GovernanceConsumer; do
  [ -f "contracts/$name.py" ] || continue
  python3 tools/minify_contract.py "contracts/$name.py" -o "build/$name.premangle.py" | sed 's/^/  /'
  python3 tools/mangle_names.py "build/$name.premangle.py" \
      -o "build/$name.min.py" --map "build/$name.names.json" | sed 's/^/  /'
  python3 -c "import ast,sys;ast.parse(open(sys.argv[1]).read())" "build/$name.min.py"
  if [ -x "$HOME/.local/bin/genvm-lint" ]; then
    "$HOME/.local/bin/genvm-lint" check "build/$name.min.py" | grep -E 'Lint passed|Validation passed' | sed 's/^/  /' || true
  fi
done

python3 - <<'PY'
import hashlib, json, os
path = "deployments.json"
d = json.load(open(path)) if os.path.exists(path) else {"project": "VoteGuard"}
d.setdefault("artifacts", {})
for name in ("VoteGuard", "GovernanceConsumer"):
    art = f"build/{name}.min.py"
    if not os.path.exists(art):
        continue
    meta = d["artifacts"].setdefault(art, {"source": f"contracts/{name}.py"})
    meta["bytes"] = os.path.getsize(art)
    meta["sha256"] = hashlib.sha256(open(art, "rb").read()).hexdigest()
    meta["source_sha256"] = hashlib.sha256(open(meta["source"], "rb").read()).hexdigest()
    meta["premangle_bytes"] = os.path.getsize(f"build/{name}.premangle.py")
    print(f"  {meta['bytes']:>7,} bytes  {art}  sha256 {meta['sha256'][:16]}…")
# ensure_ascii=False and a trailing newline: without either, every build
# rewrites every § and → in this file as a \uXXXX escape and drops the final
# newline, so `git diff` after a no-op build is 60 lines of noise.
with open(path, "w", encoding="utf-8") as fh:
    json.dump(d, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PY
