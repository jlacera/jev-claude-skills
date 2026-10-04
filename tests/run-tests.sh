#!/usr/bin/env bash
# Smoke test of the whole package against the local mock (no key, no spend). Usage: bash tests/run-tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
S=skills; F=tests/fixtures; O=$(mktemp -d)
MOCK_429_EVERY=4 node $S/jev-core/scripts/mock-gateway.mjs 8787 2>/dev/null & M=$!
(cd $F/site && python3 -m http.server 8799 >/dev/null 2>&1) & W=$!
trap 'kill $M $W 2>/dev/null' EXIT
sleep 1
export JEV_BASE_URL=http://localhost:8787/v1 AI_GATEWAY_API_KEY=test
B="node $S/jev-core/scripts/jev-batch.mjs"
$B $S/jev-growth/scripts/configs/icp-company-fit.mjs $F/companies.csv --dry-run >/dev/null
$B $S/jev-growth/scripts/configs/icp-company-fit.mjs $F/companies.csv --out $O/icp.csv
$B $S/jev-ops/scripts/configs/bookkeeping-review.mjs $F/transactions.csv --out $O/bk.csv
$B $S/jev-ops/scripts/configs/claim-check.mjs $F/claims.jsonl --all --out $O/cl.csv
$B $S/jev-ops/scripts/configs/lead-inbound-triage.mjs $F/leads.csv --out $O/tr.csv
node $S/jev-growth/scripts/find-buyers.mjs --product "a CRM for a small sales team" --file $F/posts.csv --out $O/buyers.csv
node $S/jev-growth/scripts/check-messages.mjs $F/outreach.json --out $O/msg.csv
node $S/jev-growth/scripts/internal-links.mjs --sitemap http://localhost:8799/sitemap.xml --dest $F/destinations.json --anchors --floor 0.3 --gap 0.05 --out $O/links.csv
(cd $S/jev-core/scripts && python3 -c "
from jev_client import Jev, boolean, choice
j=Jev(); r=j.evaluate('refrigerated logistics', {'a': boolean('refrigerated logistics'), 'c': choice('sector', {'log':'logistics refrigerated','wine':'winery'})})
assert r.choice('c')=='log' and 0<=r.prob('a')<=1; print('python OK', j.usage)")
python3 -c "import json;json.load(open('$S/jev-core/scripts/n8n-jev-lead-triage.json'));print('n8n JSON OK')"
for f in icp bk cl tr buyers msg links; do test -s $O/$f.csv || { echo "FAIL: $f.csv is empty"; exit 1; }; done
echo "ALL OK -> $O"
