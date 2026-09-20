#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# copy_section_alrahma.sh
#
# Copies section "10: Proposition du Gestionnaire" from the BSIC staging
# instance into the AlRahma staging instance.
#
# Architecture:
#   SOURCE  → staging-bsic-api.bbanker.ca   (BSIC token)
#   TARGET  → staging-alrahma-api.bbanker.ca (AlRahma token)
#
# Usage:
#   chmod +x copy_section_alrahma.sh
#   ./copy_section_alrahma.sh
#
# Requirements: curl, jq   (brew install jq  /  apt install jq)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Tokens (refresh if expired) ───────────────────────────────────────────────
BSIC_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImZyYW5rIiwicm9sZSI6ImFkbWluIiwiYXV0aG1ldGhvZCI6IkF1dGgiLCJ1c2VyX3JpZ2h0cyI6IjEiLCJ1c2VyX2lkIjoiMTY0MCIsIm5iZiI6MTc4OTkzMTk3MywiZXhwIjoxNzg5OTY3OTczLCJpYXQiOjE3ODk5MzE5NzMsImlzcyI6Imh0dHA6Ly9iYi5idXNpbmVzc2Jhbmtlci5jYSIsImF1ZCI6InN0YWdpbmctYnNpYy1hcGkuYmJhbmtlci5jYSJ9.xvTzx7k2Z3mIAiW4DiesQzQBir0EzhNZm9nGTW1QmFI"

ALR_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImZyYW5rIiwicm9sZSI6ImFkbWluIiwiYXV0aG1ldGhvZCI6IkF1dGgiLCJ1c2VyX3JpZ2h0cyI6IjMiLCJ1c2VyX2lkIjoiMTY0MCIsIm5iZiI6MTc4OTkzMjMzMCwiZXhwIjoxNzg5OTY4MzMwLCJpYXQiOjE3ODk5MzIzMzAsImlzcyI6Imh0dHA6Ly9iYi5idXNpbmVzc2Jhbmtlci5jYSIsImF1ZCI6InN0YWdpbmctYWxyYWhtYS1hcGkuYmJhbmtlci5jYSJ9.pTALwmJUJMN2c1TJtO9JIBjgwCtY45_V_kbAXt4ZfO8"

# ── Endpoints ─────────────────────────────────────────────────────────────────
BSIC_API="https://staging-bsic-api.bbanker.ca"
ALR_API="https://staging-alrahma-api.bbanker.ca"

SECTION_NUMBER=10
SECTION_LABEL="Proposition du Gestionnaire"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()   { echo -e "\033[1;32m[ OK ]\033[0m  $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()  { echo -e "\033[1;31m[ERR ]\033[0m  $*" >&2; }
die()  { err "$*"; exit 1; }
hr()   { echo "────────────────────────────────────────────────────────────"; }

check_token_expiry() {
  local token="$1" label="$2"
  local payload exp now
  payload=$(echo "$token" | cut -d. -f2 | python3 -c \
    "import sys,base64; d=sys.stdin.read().strip(); d+='=='*((4-len(d)%4)%4); print(base64.b64decode(d).decode())" 2>/dev/null)
  exp=$(echo "$payload" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['exp'])" 2>/dev/null)
  now=$(date +%s)
  if [ "$now" -gt "$exp" ]; then
    die "$label token EXPIRED. Please refresh it and update BSIC_TOKEN / ALR_TOKEN at the top of this script."
  fi
  ok "$label token valid for $(( (exp - now) / 60 )) more minutes."
}

get() {
  local url="$1" token="$2"
  curl -sf \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/json" \
    "$url"
}

post() {
  local url="$1" token="$2" body="$3"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$body" \
    "$url"
}

http_code() {
  local method="${1:-GET}" url="$2" token="$3" body="${4:-}"
  if [ "$method" = "POST" ] && [ -n "$body" ]; then
    curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$body" "$url" 2>/dev/null
  else
    curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $token" \
      -H "Accept: application/json" \
      "$url" 2>/dev/null
  fi
}

# Probe a list of paths; returns first one that responds 200
find_endpoint() {
  local base="$1" token="$2"; shift 2
  for path in "$@"; do
    code=$(http_code GET "${base}${path}" "$token")
    if [ "$code" = "200" ]; then
      echo "$path"
      return 0
    fi
  done
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
hr
echo "  BSIC → AlRahma  |  Section $SECTION_NUMBER: $SECTION_LABEL"
hr

# ── 0. Token health ───────────────────────────────────────────────────────────
log "Checking token validity..."
check_token_expiry "$BSIC_TOKEN" "BSIC"
check_token_expiry "$ALR_TOKEN"  "AlRahma"

# ── 1. Discover swagger on BSIC ───────────────────────────────────────────────
hr
log "Step 1 — Discovering BSIC API structure..."
SWAGGER_PATH=$(find_endpoint "$BSIC_API" "$BSIC_TOKEN" \
  "/swagger/v1/swagger.json" "/swagger.json" "/api/swagger.json" "/openapi.json" \
  "/swagger/index.html" "/swagger" || true)

if [ -n "$SWAGGER_PATH" ]; then
  ok "OpenAPI spec at ${BSIC_API}${SWAGGER_PATH}"
  log "Available routes:"
  get "${BSIC_API}${SWAGGER_PATH}" "$BSIC_TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); [print(' ', p) for p in sorted(d.get('paths',{}).keys())]" \
    2>/dev/null || true
else
  warn "No OpenAPI spec found — will probe common REST paths directly."
fi

# ── 2. Fetch section 10 from BSIC ─────────────────────────────────────────────
hr
log "Step 2 — Fetching section $SECTION_NUMBER ($SECTION_LABEL) from BSIC..."
SECTION_DATA=""
SECTION_ENDPOINT=""

# Try direct-by-id paths first
for path in \
  "/api/sections/$SECTION_NUMBER" \
  "/api/setup/sections/$SECTION_NUMBER" \
  "/api/form/sections/$SECTION_NUMBER" \
  "/api/workflow/sections/$SECTION_NUMBER" \
  "/api/propositions/$SECTION_NUMBER"; do

  code=$(http_code GET "${BSIC_API}${path}" "$BSIC_TOKEN")
  if [ "$code" = "200" ]; then
    SECTION_DATA=$(get "${BSIC_API}${path}" "$BSIC_TOKEN")
    SECTION_ENDPOINT="$path"
    ok "Found section at ${BSIC_API}${path}"
    break
  fi
done

# Fall back: fetch collection and filter
if [ -z "$SECTION_DATA" ]; then
  for path in \
    "/api/sections" \
    "/api/setup/sections" \
    "/api/form/sections" \
    "/api/workflow/sections" \
    "/api/propositions"; do

    code=$(http_code GET "${BSIC_API}${path}" "$BSIC_TOKEN")
    if [ "$code" = "200" ]; then
      ALL=$(get "${BSIC_API}${path}" "$BSIC_TOKEN")
      # Match by number, order, or name containing "Proposition"
      SECTION_DATA=$(echo "$ALL" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('data', data.get('items', data.get('results', [])))
for item in items:
    n = item.get('number') or item.get('order') or item.get('sectionNumber') or 0
    name = str(item.get('name','') or item.get('title',''))
    if int(n) == $SECTION_NUMBER or 'Proposition' in name:
        print(json.dumps(item))
        break
" 2>/dev/null)
      if [ -n "$SECTION_DATA" ]; then
        SECTION_ENDPOINT="$path"
        ok "Found section in collection at ${BSIC_API}${path}"
        break
      fi
    fi
  done
fi

[ -z "$SECTION_DATA" ] && die "Could not retrieve section $SECTION_NUMBER from BSIC. Check the API paths or permissions."

log "Section payload:"
echo "$SECTION_DATA" | python3 -m json.tool 2>/dev/null || echo "$SECTION_DATA"

# ── 3. Discover equivalent endpoint on AlRahma ────────────────────────────────
hr
log "Step 3 — Discovering AlRahma API structure..."
ALR_SECTIONS_PATH=""

for path in \
  "/api/sections" \
  "/api/setup/sections" \
  "/api/form/sections" \
  "/api/workflow/sections" \
  "/api/propositions"; do

  code=$(http_code GET "${ALR_API}${path}" "$ALR_TOKEN")
  log "  $code  ${ALR_API}${path}"
  if [ "$code" = "200" ]; then
    ALR_SECTIONS_PATH="$path"
    ok "AlRahma sections endpoint: ${ALR_API}${path}"
    break
  fi
done

[ -z "$ALR_SECTIONS_PATH" ] && die "Could not find a sections endpoint on AlRahma. Check connectivity and token."

# ── 4. Check if section already exists on AlRahma ────────────────────────────
hr
log "Step 4 — Checking if section $SECTION_NUMBER already exists on AlRahma..."
EXISTING=$(get "${ALR_API}${ALR_SECTIONS_PATH}" "$ALR_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('data', data.get('items', data.get('results', [])))
for item in items:
    n = item.get('number') or item.get('order') or item.get('sectionNumber') or 0
    name = str(item.get('name','') or item.get('title',''))
    if int(n) == $SECTION_NUMBER or 'Proposition' in name:
        print(json.dumps(item))
        break
" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  warn "Section $SECTION_NUMBER already exists on AlRahma:"
  echo "$EXISTING" | python3 -m json.tool 2>/dev/null || echo "$EXISTING"
  read -rp "Overwrite / update it? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { log "Aborted."; exit 0; }
  EXISTING_ID=$(echo "$EXISTING" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('id',''))" 2>/dev/null || true)
else
  ok "Section not found on AlRahma — will create it."
  EXISTING_ID=""
fi

# ── 5. Build clean payload ────────────────────────────────────────────────────
hr
log "Step 5 — Building payload (stripping source IDs)..."
CLEAN=$(echo "$SECTION_DATA" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
# Remove source-specific fields
for k in ('id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'instanceId', 'tenantId'):
    d.pop(k, None)
print(json.dumps(d, ensure_ascii=False, indent=2))
" 2>/dev/null)

log "Clean payload:"
echo "$CLEAN"

# ── 6. POST (create) or PUT (update) on AlRahma ───────────────────────────────
hr
if [ -n "$EXISTING_ID" ]; then
  log "Step 6 — Updating section $EXISTING_ID on AlRahma..."
  RESPONSE=$(curl -sf -X PUT \
    -H "Authorization: Bearer $ALR_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$CLEAN" \
    "${ALR_API}${ALR_SECTIONS_PATH}/${EXISTING_ID}" 2>&1 || true)
  HTTP=$(http_code GET "${ALR_API}${ALR_SECTIONS_PATH}/${EXISTING_ID}" "$ALR_TOKEN")
else
  log "Step 6 — Creating section on AlRahma..."
  RESPONSE=$(post "${ALR_API}${ALR_SECTIONS_PATH}" "$ALR_TOKEN" "$CLEAN" 2>&1 || true)
  HTTP=$(http_code POST "${ALR_API}${ALR_SECTIONS_PATH}" "$ALR_TOKEN" "$CLEAN")
fi

log "Response (HTTP $HTTP):"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

[[ "$HTTP" =~ ^2 ]] && ok "Done! Section '$SECTION_NUMBER: $SECTION_LABEL' copied to AlRahma." \
                     || die "Copy failed (HTTP $HTTP). Review the output above."
