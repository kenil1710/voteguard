#!/usr/bin/env bash
# Analyse a set of REAL governance proposals on a live network, patiently.
#
#   bash tools/seed_bradbury.sh <voteguard-address> [count]
#
# Bradbury throttles a wallet two ways and they need different responses:
#
#   "Request exceeds defined limit" / "node is at capacity"
#       — the transaction was never submitted. Wait and RETRY the same
#         proposal; nothing was consumed.
#   LEADER_TIMEOUT
#       — the transaction WAS submitted and the CLI gave up polling before
#         the round rotated. It often settles anyway, so the only reliable
#         check is the contract's own state, never the CLI's exit status.
#
# The contract also rate-limits one wallet to a request every 300 seconds, so
# a single signer cannot go faster than that however patient the retries are.
set -uo pipefail
cd "$(dirname "$0")/.."

VG="${1:?usage: seed_bradbury.sh <address> [count]}"
WANT="${2:-5}"

URLS=(
  "https://snapshot.org/#/aavedao.eth/proposal/0x12d0143db33efe0754cab4d89ba9ba7ae23e7e1b77817ba7fc79a35c382280ec|Aave DAO|Snapshot · deploy Aave V4 on Arc"
  "https://forum.arbitrum.foundation/t/constitutional-aip-fast-feed/31003|Arbitrum DAO|Discourse · constitutional AIP"
  "https://www.tally.xyz/gov/uniswap/proposal/86|Uniswap|Tally · approved budgets rebalancing"
  "https://snapshot.org/#/ens.eth/proposal/0x943e585d1a4996525c5c7d229401d604ea56fe08c2c9c615c44f048ba42487b7|ENS|Snapshot · SPP3 marketplace RFP"
  "https://snapshot.org/#/lido-snapshot.eth/proposal/0x7b07bc31f0b38b69a117473031bc126becc70b9fa37246b53d9fe5a841c814f5|Lido|Snapshot · 0x02 CSM module launch"
  "https://snapshot.org/#/uniswapgovernance.eth/proposal/0x5ae3426216321df66a67eb677874b725f80e51888ad2da72b382b21669c554ee|Uniswap|Snapshot · Four for V4 temp check"
)

analysed() {
  genlayer call "$VG" get_stats 2>/dev/null \
    | grep -oE 'total_analyzed: [0-9]+' | grep -oE '[0-9]+' | head -1
}

stored() {
  genlayer call "$VG" get_assessment_by_url --args "$1" 2>/dev/null | grep -q "found: true"
}

printf '\nSeeding %s with real proposals (target %s)\n\n' "$VG" "$WANT"

for entry in "${URLS[@]}"; do
  IFS='|' read -r url dao what <<< "$entry"
  have=$(analysed); have=${have:-0}
  [ "$have" -ge "$WANT" ] && break

  if stored "$url"; then printf '  · already assessed: %s\n' "$what"; continue; fi
  printf '  → %s\n' "$what"

  for attempt in 1 2 3 4 5 6; do
    out=$(genlayer write "$VG" analyze_proposal --args "$url" "$dao" 2>&1)
    if printf '%s' "$out" | grep -qiE "exceeds defined limit|at capacity|rate limit"; then
      printf '      throttled (attempt %d) — backing off 90s\n' "$attempt"
      sleep 90
      continue
    fi
    # Submitted. Whether the CLI saw it settle or not, the contract decides.
    for _ in $(seq 1 20); do
      if stored "$url"; then break; fi
      sleep 15
    done
    break
  done

  if stored "$url"; then
    line=$(genlayer call "$VG" get_assessment_by_url --args "$url" 2>/dev/null \
      | grep -E "verdict:|overall_score:|assessment_id:" | tr -d ' \n')
    printf '      stored — %s\n' "$line"
  else
    printf '      NOT stored\n'
  fi
  # the contract's own per-wallet limit
  sleep 310
done

printf '\nfinal: %s assessments on %s\n' "$(analysed)" "$VG"
genlayer call "$VG" get_stats 2>/dev/null | grep -E "total_analyzed|proposals_tracked|daos_tracked"
