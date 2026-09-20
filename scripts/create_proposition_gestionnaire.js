/**
 * create_proposition_gestionnaire.js
 *
 * Recreates section "Proposition du Gestionnaire" (List Array) in staging AlRahma.
 *
 * HOW TO USE — two options:
 *
 * OPTION A – Browser Console (easiest, no install needed):
 *   1. Open https://staging-alrahma.bbanker.ca/ and log in
 *   2. Open DevTools → Console (F12)
 *   3. Paste this entire script and press Enter
 *
 * OPTION B – Node.js from terminal:
 *   node create_proposition_gestionnaire.js
 */

// ── Config ────────────────────────────────────────────────────────────────────
const ALR_API   = "https://staging-alrahma-api.bbanker.ca";
const ALR_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImZyYW5rIiwicm9sZSI6ImFkbWluIiwiYXV0aG1ldGhvZCI6IkF1dGgiLCJ1c2VyX3JpZ2h0cyI6IjMiLCJ1c2VyX2lkIjoiMTY0MCIsIm5iZiI6MTc4OTkzMjMzMCwiZXhwIjoxNzg5OTY4MzMwLCJpYXQiOjE3ODk5MzIzMzAsImlzcyI6Imh0dHA6Ly9iYi5idXNpbmVzc2Jhbmtlci5jYSIsImF1ZCI6InN0YWdpbmctYWxyYWhtYS1hcGkuYmJhbmtlci5jYSJ9.pTALwmJUJMN2c1TJtO9JIBjgwCtY45_V_kbAXt4ZfO8";

// ── Section payload — built from screenshot ───────────────────────────────────
const SECTION = {
  number:    12,
  name:      "Proposition du Gestionnaire",
  fieldName: "Montant_Approuve",
  type:      "ListArray",         // try "List Array" if this 400s

  // Section-level option flags (all unchecked in screenshot)
  useColumnFormula:  false,
  importLineByLine:  false,
  cloneSection:      false,
  risk:              false,
  hideDeleteButton:  false,
  hideOnDelete:      false,
  editAsExcelMode:   false,
  showNumber:        false,
  openEdit:          false,

  tabs: [
    {
      name:    "Tab1",
      order:   1,
      enabled: true,

      columns: [
        { number: 1, identifier: "A", name: "Paramètres"     },
        { number: 2, identifier: "B", name: "Montant Approuve", fieldName: "Montant_Approuve" }
      ],

      rows: [
        { number: 1, label: "Objet",                              formula: "{{$.client.Objet.value}}" },
        { number: 2, label: "Salaire Vérifié",                    formula: "0" },
        { number: 3, label: "Durée (en mois)",                    formula: "0" },
        { number: 4, label: "Montant proposé par le gestionnaire",formula: "0" },
        { number: 5, label: "TTC (Taux d'intérêt du prêt)",       formula: ".12" },
        { number: 6, label: "Échéance mensuelle (Montant)",       formula: "B4*(B5/12+0.00000001)/(1-(1+B5/12+0.00000001)**(-B3))" },
        { number: 7, label: "Frais de dossier",                   formula: "0" },
        { number: 8, label: "Frais d'instruction",                formula: "0" },
        { number: 9, label: "Pénalités de retard",                formula: "0" }
      ]
    }
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const H = {
  "Authorization": `Bearer ${ALR_TOKEN}`,
  "Content-Type":  "application/json",
  "Accept":        "application/json"
};

async function apiGet(path) {
  const r = await fetch(`${ALR_API}${path}`, { headers: H });
  return { status: r.status, body: r.ok ? await r.json().catch(() => r.text()) : await r.text() };
}

async function apiPost(path, payload) {
  const r = await fetch(`${ALR_API}${path}`, {
    method: "POST", headers: H,
    body: JSON.stringify(payload)
  });
  return { status: r.status, body: r.ok ? await r.json().catch(() => r.text()) : await r.text() };
}

async function apiPut(path, payload) {
  const r = await fetch(`${ALR_API}${path}`, {
    method: "PUT", headers: H,
    body: JSON.stringify(payload)
  });
  return { status: r.status, body: r.ok ? await r.json().catch(() => r.text()) : await r.text() };
}

// ── Candidate endpoints to try ────────────────────────────────────────────────
const ENDPOINTS = [
  "/api/setup/sections",
  "/api/sections",
  "/api/form/sections",
  "/api/workflow/sections",
  "/api/propositions",
];

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("=======================================================");
  console.log(" Creating: Proposition du Gestionnaire → AlRahma");
  console.log("=======================================================\n");

  // 1. Check token
  const parts  = ALR_TOKEN.split(".");
  const claims = JSON.parse(atob(parts[1].replace(/-/g,"+").replace(/_/g,"/")));
  const minsLeft = Math.floor((claims.exp - Date.now() / 1000) / 60);
  if (minsLeft < 0) { console.error("❌ Token expired — please refresh it."); return; }
  console.log(`✅ Token valid for ~${minsLeft} minutes.\n`);

  // 2. Find working endpoint on AlRahma
  let workingEndpoint = null;
  let existingId      = null;

  console.log("🔍 Probing AlRahma endpoints...");
  for (const ep of ENDPOINTS) {
    const r = await apiGet(ep);
    console.log(`   ${r.status}  GET ${ep}`);
    if (r.status === 200) {
      workingEndpoint = ep;

      // Check if section already exists
      const list = Array.isArray(r.body) ? r.body
                 : (r.body?.data ?? r.body?.items ?? r.body?.results ?? []);
      const found = list.find(s =>
        (s.number === SECTION.number || s.sectionNumber === SECTION.number) ||
        (s.name ?? "").includes("Proposition")
      );
      if (found) {
        existingId = found.id ?? found.sectionId;
        console.log(`⚠️  Section already exists (id: ${existingId}) — will UPDATE.`);
      }
      break;
    }
  }

  if (!workingEndpoint) {
    console.error("\n❌ No working endpoint found. Tried:", ENDPOINTS);
    console.error("   Check API host, token, or CORS policy.");
    return;
  }

  console.log(`\n✅ Using endpoint: ${ALR_API}${workingEndpoint}\n`);

  // 3. POST or PUT
  let result;
  if (existingId) {
    console.log(`📝 PUT (update) section id=${existingId}...`);
    result = await apiPut(`${workingEndpoint}/${existingId}`, SECTION);
  } else {
    console.log("📝 POST (create) new section...");
    result = await apiPost(workingEndpoint, SECTION);
  }

  console.log(`   HTTP ${result.status}`);
  console.log("   Response:", result.body);

  if (result.status >= 200 && result.status < 300) {
    console.log("\n✅ Done! Section created on AlRahma staging.");
    console.log("   Refresh the page to see it.");
  } else {
    console.error("\n❌ Failed. If you see a 422/400, the payload field names may differ.");
    console.error("   Try: apiGet('/api/setup/sections').then(r => console.log(r.body[0]))" );
    console.error("   …to inspect the exact field names the API expects, then adjust SECTION above.");
  }
})();
