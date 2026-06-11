// Richt PocketBase in voor Wijngaard Buddy: collecties, rijen-seed en gebruikers.
// Vereist alleen Node 18+ (geen npm-packages).
//
// Gebruik:
//   node scripts/setup-pocketbase.mjs <pocketbase-url> <admin-email> <admin-wachtwoord>
//
// Het script is idempotent: bestaande collecties, rijen en gebruikers worden
// overgeslagen. Aangemaakte gebruikersaccounts (met wachtwoorden) worden
// weggeschreven naar pocketbase-accounts.txt (staat in .gitignore).

import { writeFileSync } from "node:fs";
import crypto from "node:crypto";

const [baseUrl, adminEmail, adminPass] = process.argv.slice(2);
if (!baseUrl || !adminEmail || !adminPass) {
  console.error("Gebruik: node scripts/setup-pocketbase.mjs <url> <admin-email> <admin-wachtwoord>");
  process.exit(1);
}
const base = baseUrl.replace(/\/+$/, "");

const AUTH_RULE = "@request.auth.id != ''";

const SEED_RIJEN = [
  [1, "Muscaris", 10], [2, "Muscaris", 15], [3, "Muscaris", 20], [4, "Muscaris", 25], [5, "Muscaris", 30],
  [6, "Souveginier Gris", 34], [7, "Souveginier Gris", 39], [8, "Souveginier Gris", 43], [9, "Souveginier Gris", 49],
  [10, "Souveginier Gris", 49], [11, "Souveginier Gris", 49], [12, "Souveginier Gris", 50], [13, "Souveginier Gris", 50],
  [14, "Souveginier Gris", 50], [15, "Souveginier Gris", 56], [16, "Souveginier Gris", 58], [17, "Souveginier Gris", 59],
  [18, "Souveginier Gris", 60], [19, "Souveginier Gris", 61], [20, "Souveginier Gris", 63], [21, "Souveginier Gris", 63],
  [22, "Johanniter", 64], [23, "Johanniter", 66], [24, "Johanniter", 67], [25, "Johanniter", 68], [26, "Johanniter", 70],
  [27, "Johanniter", 72], [28, "Johanniter", 74], [29, "Johanniter", 75], [30, "Johanniter", 75], [31, "Johanniter", 77],
  [32, "Johanniter", 79], [33, "Johanniter", 81], [34, "Johanniter", 82], [35, "Johanniter", 83], [36, "Johanniter", 84],
  [37, "Johanniter", 85], [38, "Johanniter", 85], [39, "Johanniter", 86], [40, "Johanniter", 87],
  [41, "Regent", 88], [42, "Regent", 88], [43, "Regent", 89], [44, "Regent", 89], [46, "Regent", 90], [47, "Regent", 90],
  [45, "Pinot Noir", 90], [65, "Pinot Noir", 87], [68, "Pinot Noir", 36],
  [48, "Chardonnay", 90], [49, "Chardonnay", 91], [50, "Chardonnay", 91], [51, "Chardonnay", 91], [52, "Chardonnay", 91],
  [53, "Chardonnay", 91], [54, "Chardonnay", 90], [55, "Chardonnay", 90], [56, "Chardonnay", 90],
  [57, "Pinotin", 90], [58, "Pinotin", 90], [59, "Pinotin", 89], [60, "Pinotin", 89], [61, "Pinotin", 89],
  [62, "Pinotin", 88], [63, "Pinotin", 88], [64, "Pinotin", 87], [66, "Pinotin", 87], [67, "Pinotin", 87],
];

const RAS_VALUES = ["Muscaris", "Souveginier Gris", "Johanniter", "Regent", "Pinot Noir", "Chardonnay", "Pinotin"];
const OBSERVATIE_TYPES = ["gezond", "groei", "ziekte", "schade", "uitval", "anders"];
const FENOLOGIE_MOMENTEN = ["Knopbreek", "Bloei", "Zetting", "Véraison", "Oogstrijp"];
const NEERSLAG = ["Geen", "Lichte regen", "Matige regen", "Zware regen", "Onweer"];

const GEBRUIKERS = [
  { email: "invoerder1@tappenmars.nl", name: "Invoerder 1" },
  { email: "invoerder2@tappenmars.nl", name: "Invoerder 2" },
  { email: "invoerder3@tappenmars.nl", name: "Invoerder 3" },
];

let adminToken = "";

async function api(path, { method = "GET", body, token = adminToken, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  if (body && !form) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leeg */ }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function autodateFields() {
  return [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
}

async function ensureCollection(def) {
  try {
    const bestaand = await api(`/api/collections/${def.name}`);
    console.log(`  ✓ collectie "${def.name}" bestaat al`);
    return bestaand;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const created = await api("/api/collections", { method: "POST", body: def });
  console.log(`  + collectie "${def.name}" aangemaakt`);
  return created;
}

function wachtwoordGenereren() {
  // leesbaar maar sterk: Druif-<6 tekens>-<2 cijfers>
  const deel = crypto.randomBytes(5).toString("base64").replace(/[/+=]/g, "a").slice(0, 6);
  const cijfers = crypto.randomInt(10, 99);
  return `Druif-${deel}-${cijfers}`;
}

async function main() {
  console.log(`PocketBase inrichten op ${base}`);

  // 1. health check
  await api("/api/health", { token: "" });
  console.log("  ✓ server bereikbaar");

  // 2. admin login (PocketBase 0.23+; valt terug op oudere admin-endpoint)
  try {
    const auth = await api("/api/collections/_superusers/auth-with-password", {
      method: "POST", token: "", body: { identity: adminEmail, password: adminPass },
    });
    adminToken = auth.token;
  } catch (e) {
    if (e.status !== 404) throw e;
    const auth = await api("/api/admins/auth-with-password", {
      method: "POST", token: "", body: { identity: adminEmail, password: adminPass },
    });
    adminToken = auth.token;
  }
  console.log("  ✓ ingelogd als admin");

  // 3. collecties
  console.log("Collecties aanmaken...");
  const rijenCol = await ensureCollection({
    name: "rijen",
    type: "base",
    fields: [
      { name: "rijnummer", type: "number", required: true, onlyInt: true },
      { name: "ras", type: "select", required: true, maxSelect: 1, values: RAS_VALUES },
      { name: "aantal_planten", type: "number", onlyInt: true },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  const rijRelatie = {
    name: "rij", type: "relation", required: true,
    collectionId: rijenCol.id, cascadeDelete: false, maxSelect: 1,
  };
  const fotoVeld = {
    name: "foto", type: "file", maxSelect: 1, maxSize: 10485760,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  };

  await ensureCollection({
    name: "metingen",
    type: "base",
    fields: [
      rijRelatie,
      { name: "plant", type: "number", onlyInt: true },
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      { name: "brix", type: "number" },
      { name: "ph", type: "number" },
      { name: "zuurgraad", type: "number" },
      { name: "rijpheid_score", type: "number", required: true, onlyInt: true, min: 1, max: 5 },
      { name: "notitie", type: "text" },
      fotoVeld,
      { name: "temperatuur", type: "number" },
      { name: "neerslag", type: "select", maxSelect: 1, values: NEERSLAG },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "observaties",
    type: "base",
    fields: [
      rijRelatie,
      { name: "plant", type: "number", onlyInt: true },
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      { name: "type", type: "select", required: true, maxSelect: 1, values: OBSERVATIE_TYPES },
      { name: "notitie", type: "text" },
      fotoVeld,
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "fenologie",
    type: "base",
    fields: [
      rijRelatie,
      { name: "ras", type: "select", required: true, maxSelect: 1, values: RAS_VALUES },
      { name: "moment", type: "select", required: true, maxSelect: 1, values: FENOLOGIE_MOMENTEN },
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "gezondheid",
    type: "base",
    fields: [
      rijRelatie,
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      { name: "vigor", type: "number", required: true, onlyInt: true, min: 1, max: 5 },
      { name: "snoeigewicht", type: "number" },
      { name: "dode_planten", type: "number", onlyInt: true },
      { name: "korte_scheuten", type: "number" },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "oogst",
    type: "base",
    fields: [
      { ...rijRelatie, required: false },
      { name: "ras", type: "select", required: true, maxSelect: 1, values: RAS_VALUES },
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      { name: "kg", type: "number", required: true },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "werkuren",
    type: "base",
    fields: [
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      {
        name: "taak", type: "select", required: true, maxSelect: 1,
        values: ["Snoeien", "Uitbreken", "Aanbinden", "Spuiten", "Maaien", "Bodembewerking", "Oogsten", "Overig"],
      },
      { ...rijRelatie, required: false },
      { name: "ras", type: "select", maxSelect: 1, values: RAS_VALUES },
      { name: "uren", type: "number", required: true },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE, viewRule: AUTH_RULE, createRule: AUTH_RULE, updateRule: AUTH_RULE, deleteRule: AUTH_RULE,
  });

  // 4. rijen seeden
  console.log("Rijen seeden...");
  const bestaande = await api("/api/collections/rijen/records?perPage=1");
  if (bestaande.totalItems > 0) {
    console.log(`  ✓ rijen-collectie bevat al ${bestaande.totalItems} records, seeden overgeslagen`);
  } else {
    for (const [rijnummer, ras, aantal_planten] of SEED_RIJEN) {
      await api("/api/collections/rijen/records", {
        method: "POST",
        body: { rijnummer, ras, aantal_planten },
      });
    }
    console.log(`  + ${SEED_RIJEN.length} rijen aangemaakt`);
  }

  // 5. gebruikers
  console.log("Gebruikers aanmaken...");
  const accounts = [];
  for (const g of GEBRUIKERS) {
    const zoek = await api(
      `/api/collections/users/records?perPage=1&filter=${encodeURIComponent(`email='${g.email}'`)}`,
    );
    if (zoek.totalItems > 0) {
      console.log(`  ✓ ${g.email} bestaat al`);
      continue;
    }
    const wachtwoord = wachtwoordGenereren();
    await api("/api/collections/users/records", {
      method: "POST",
      body: {
        email: g.email,
        password: wachtwoord,
        passwordConfirm: wachtwoord,
        name: g.name,
        verified: true,
        emailVisibility: true,
      },
    });
    accounts.push({ ...g, wachtwoord });
    console.log(`  + ${g.email} aangemaakt`);
  }

  if (accounts.length > 0) {
    const regels = accounts
      .map((a) => `${a.name}\n  E-mail:     ${a.email}\n  Wachtwoord: ${a.wachtwoord}`)
      .join("\n\n");
    writeFileSync("pocketbase-accounts.txt", `Wijngaard Buddy accounts (${base})\n\n${regels}\n`);
    console.log("  → wachtwoorden opgeslagen in pocketbase-accounts.txt");
  }

  // 6. verificatie: inloggen als gebruiker en een testrecord aanmaken + verwijderen
  console.log("Verificatie...");
  const cols = await api("/api/collections?perPage=100");
  const namen = cols.items.map((c) => c.name).filter((n) => !n.startsWith("_"));
  console.log(`  ✓ collecties aanwezig: ${namen.join(", ")}`);

  if (accounts.length > 0) {
    const test = accounts[0];
    const userAuth = await api("/api/collections/users/auth-with-password", {
      method: "POST", token: "", body: { identity: test.email, password: test.wachtwoord },
    });
    const eersteRij = await api("/api/collections/rijen/records?perPage=1", { token: userAuth.token });
    const testRecord = await api("/api/collections/metingen/records", {
      method: "POST",
      token: userAuth.token,
      body: {
        rij: eersteRij.items[0].id,
        datum: new Date().toISOString().slice(0, 10),
        seizoen: new Date().getFullYear(),
        rijpheid_score: 3,
        notitie: "setup-test (wordt direct verwijderd)",
        ingevoerd_door: test.name,
      },
    });
    await api(`/api/collections/metingen/records/${testRecord.id}`, {
      method: "DELETE", token: userAuth.token,
    });
    console.log(`  ✓ testmeting aangemaakt en verwijderd als ${test.email}`);
  }

  console.log("\n✅ PocketBase volledig ingericht!");
}

main().catch((e) => {
  console.error("\n❌ Fout:", e.message);
  process.exit(1);
});
