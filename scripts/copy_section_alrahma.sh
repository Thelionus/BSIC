#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# copy_section_alrahma.sh
#
# Copies section "10: Proposition du Gestionnaire" from the default BSIC
# instance into the "alrahma" instance on staging-bsic-api.bbanker.ca.
#
# Usage:
#   chmod +x copy_section_alrahma.sh
#   ./copy_section_alrahma.sh
#
# Requirements: curl, jq  (brew install jq  /  apt install jq)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
API="https://staging-bsic-api.bbanker.ca"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImZyYW5rIiwicm9sZSI6ImFkbWluIiwiYXV0aG1ldGhvZCI6IkF1dGgiLCJ1c2VyX3JpZ2h0cyI6IjEiLCJ1c2VyX2lkIjoiMTY0MCIsIm5iZiI6MTc4OTkzMTk3MywiZXhwIjoxNzg5OTY3OTczLCJpYXQiOjE3ODk5MzE5NzMsImlzcyI6Imh0dHA6Ly9iYi5idXNpbmVzc2Jhbmtlci5jYSIsImF1ZCI6InN0YWdpbmctYnNpYy1hcGkuYmJhbmtlci5jYSJ9.xvTzx7k2Z3mIAiW4DiesQzQBir0EzhNZm9nGTW1QmFI"
TARGET_INSTANCE="alrahma"
SECTION_NUMBER=10
SECTION_NAME="Proposition du Gestionnaire"

AUTH_HEADER="Authorization: Bearer $TOKEN"
JSON_HEADER="Content-Type: application/json"
ACCEPT_HEADER="Accept: application/json"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()   { echo -e "\033[1;32m[ OK ]\033[0m  $*"; }
err()  { echo -e "\033[1;31m[ERR ]\033[0m  $*" >&2; }
die()  { err "$*"; exit 1; }

api_get() {
  local path="$1"
  curl -sf \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    "${API}${path}"
}

api_post() {
  local path="$1"
  local body="$2"
  curl -sf -X POST \
    -H "$AUTH_HEADER" \
    -H "$JSON_HEADER" \
    -H "$ACCEPT_HEADER" \
    -d "$body" \
    "${API}${path}"
}

api_put() {
  local path="$1"
  local body="$2"
  curl -sf -X PUT \
    -H "$AUTH_HEADER" \
    -H "$JSON_HEADER" \
    -H "$ACCEPT_HEADER" \
    -d "$body" \
    "${API}${path}"
}

# ── Step 1: discover API routes ───────────────────────────────────────────────
log "Step 1 — Discovering API structure..."
SWAGGER_URL=""
for path in "/swagger/v1/swagger.json" "/api/swagger.json" "/swagger.json" "/openapi.json"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "${API}${path}")
  if [ "$code" = "200" ]; then
    SWAGGER_URL="${API}${path}"
    ok "Found OpenAPI spec at $SWAGGER_URL"
    break
  fi
done

if [ -n "$SWAGGER_URL" ]; then
  log "Fetching available routes from swagger..."
  curl -sf -H "$AUTH_HEADER" "$SWAGGER_URL" | jq '.paths | keys[]' 2>/dev/null | head -40 || true
fi

# ── Step 2: list instances / tenants ─────────────────────────────────────────
log "Step 2 — Looking for instances/tenants..."
INSTANCE_ID=""
for path in "/api/instances" "/api/tenants" "/api/clients" "/api/organizations"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" -H "$ACCEPT_HEADER" "${API}${path}")
  if [ "$code" = "200" ]; then
    log "Instances endpoint found: $path"
    INSTANCES=$(api_get "$path")
    echo "$INSTANCES" | jq . 2>/dev/null || echo "$INSTANCES"

    # Try to extract the alrahma instance id
    INSTANCE_ID=$(echo "$INSTANCES" | jq -r \
      '.[] | select(.name // .slug // .code | ascii_downcase | contains("alrahma")) | .id // .instanceId // .tenantId' \
      2>/dev/null | head -1)
    [ -n "$INSTANCE_ID" ] && ok "Found alrahma instance ID: $INSTANCE_ID" && break
    break
  fi
done

if [ -z "$INSTANCE_ID" ]; then
  err "Could not auto-detect the alrahma instance ID."
  err "Please set INSTANCE_ID manually below and re-run."
  echo ""
  echo "  INSTANCE_ID=<id> ./copy_section_alrahma.sh"
  echo ""
  # Allow env override
  INSTANCE_ID="${INSTANCE_ID:-}"
fi

# ── Step 3: find section 10 in the source ─────────────────────────────────────
log "Step 3 — Fetching section '$SECTION_NUMBER: $SECTION_NAME'..."
SECTION_DATA=""
for path in \
  "/api/sections" \
  "/api/setup/sections" \
  "/api/propositions" \
  "/api/form-sections" \
  "/api/workflow/sections"; do

  code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" -H "$ACCEPT_HEADER" "${API}${path}")
  if [ "$code" = "200" ]; then
    log "Sections endpoint found: $path"
    ALL_SECTIONS=$(api_get "$path")

    # Try to isolate section 10
    SECTION_DATA=$(echo "$ALL_SECTIONS" | jq \
      --argjson n "$SECTION_NUMBER" \
      '.[] | select(.number == $n or .order == $n or .sectionNumber == $n or (.name // .title | test("Proposition"; "i")))' \
      2>/dev/null | head -c 8000)

    if [ -n "$SECTION_DATA" ]; then
      ok "Found section data:"
      echo "$SECTION_DATA" | jq . 2>/dev/null || echo "$SECTION_DATA"
      break
    fi
    break
  fi
done

if [ -z "$SECTION_DATA" ]; then
  # Try direct section endpoint
  for path in \
    "/api/sections/$SECTION_NUMBER" \
    "/api/setup/sections/$SECTION_NUMBER" \
    "/api/propositions/$SECTION_NUMBER"; do

    code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" -H "$ACCEPT_HEADER" "${API}${path}")
    if [ "$code" = "200" ]; then
      SECTION_DATA=$(api_get "$path")
      ok "Found section at $path:"
      echo "$SECTION_DATA" | jq . 2>/dev/null || echo "$SECTION_DATA"
      break
    fi
  done
fi

[ -z "$SECTION_DATA" ] && die "Could not retrieve section data. Please check endpoint paths manually."

# ── Step 4: copy section to alrahma instance ──────────────────────────────────
log "Step 4 — Copying section to '$TARGET_INSTANCE' instance (ID: ${INSTANCE_ID:-unknown})..."

if [ -z "$INSTANCE_ID" ]; then
  err "Cannot copy: alrahma instance ID is unknown."
  err "Run the script with: INSTANCE_ID=<id> ./copy_section_alrahma.sh"
  exit 1
fi

# Strip any source-specific IDs from the payload before posting
CLEAN_PAYLOAD=$(echo "$SECTION_DATA" | jq \
  --arg inst "$INSTANCE_ID" \
  'del(.id, .createdAt, .updatedAt) | .instanceId = $inst' \
  2>/dev/null)

log "Payload to POST:"
echo "$CLEAN_PAYLOAD" | jq . 2>/dev/null || echo "$CLEAN_PAYLOAD"

# Try POST to common copy/create endpoints
COPY_SUCCESS=false
for path in \
  "/api/instances/${INSTANCE_ID}/sections" \
  "/api/setup/sections" \
  "/api/propositions" \
  "/api/sections"; do

  RESPONSE=$(api_post "$path" "$CLEAN_PAYLOAD" 2>&1 || true)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "$JSON_HEADER" \
    -H "$ACCEPT_HEADER" \
    -d "$CLEAN_PAYLOAD" \
    "${API}${path}" 2>/dev/null)

  if [[ "$HTTP_CODE" =~ ^2 ]]; then
    ok "Section created in alrahma (HTTP $HTTP_CODE) via $path"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    COPY_SUCCESS=true
    break
  else
    log "  $HTTP_CODE  $path"
  fi
done

$COPY_SUCCESS || die "Copy failed. Review the endpoint paths and payload above, then adjust manually."

echo ""
ok "Done! Section '$SECTION_NUMBER: $SECTION_NAME' copied to '$TARGET_INSTANCE'."
