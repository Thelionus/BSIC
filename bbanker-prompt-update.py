#!/usr/bin/env python3
"""
Generic 2-way bbanker API prompt updater.
Usage: python3 bbanker-prompt-update.py
"""
import urllib.request, urllib.error, json, sys

BASE    = "https://staging-bsic.bbanker.ca"
TOKEN   = input("JWT Token: ").strip()

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type":  "application/json",
    "Accept":        "application/json",
}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(f"{BASE}{path}", data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode("utf-8-sig")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} on {method} {path}: {e.read().decode()}")
        sys.exit(1)

# ── 1. GET all prompts ─────────────────────────────────────────────────────────
print("\n── Fetching prompts…")
prompts = api("GET", "/api/AIPrompt")
if isinstance(prompts, list):
    for p in prompts:
        print(f"  id={p.get('id')} name={p.get('name') or p.get('promptName')}")
else:
    print("Response:", json.dumps(prompts, indent=2, ensure_ascii=False)[:500])
    sys.exit(0)

# ── 2. Find target prompt ──────────────────────────────────────────────────────
TARGET = "WhatsappPrompt"
found  = next((p for p in prompts if TARGET.lower() in
               str(p.get("name","") or p.get("promptName","")).lower()), None)

if not found:
    print(f"\nPrompt '{TARGET}' not found. Available: {[p.get('name') or p.get('promptName') for p in prompts]}")
    sys.exit(1)

pid    = found["id"]
print(f"\n── Found: id={pid}  name={found.get('name') or found.get('promptName')}")

# ── 3. GET full prompt detail ──────────────────────────────────────────────────
detail = api("GET", f"/api/AIPrompt/{pid}")
print("\n── Current content (first 300 chars):")
content_key = next((k for k in detail if "content" in k.lower() or "text" in k.lower() or "prompt" in k.lower()), None)
if content_key:
    print(detail[content_key][:300])
else:
    print(json.dumps(detail, indent=2, ensure_ascii=False)[:500])

# ── 4. Apply replacements ──────────────────────────────────────────────────────
REPLACEMENTS = [
    # Old text → New text
    (
        "Échéance maximale admissible : 0 FCFA → montant maximum 0 FCFA",
        "Capacité d'emprunt épuisée — les engagements existants dépassent déjà le plafond autorisé. Montant maximum : 0 FCFA"
    ),
    # Add more replacements here as needed
    # ("old string", "new string"),
]

if content_key:
    original = detail[content_key]
    updated  = original
    for old, new in REPLACEMENTS:
        updated = updated.replace(old, new)

    if updated == original:
        print("\n⚠️  No matching text found to replace. Check the replacement strings.")
        sys.exit(0)

    detail[content_key] = updated

# ── 5. PUT updated prompt ──────────────────────────────────────────────────────
print("\n── Updating prompt…")
result = api("PUT", f"/api/AIPrompt/{pid}", body=detail)
print("✅ Done:", json.dumps(result, ensure_ascii=False)[:200] if result else "OK")
