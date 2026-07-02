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
  console.error(
    "Gebruik: node scripts/setup-pocketbase.mjs <url> <admin-email> <admin-wachtwoord>",
  );
  process.exit(1);
}
const base = baseUrl.replace(/\/+$/, "");

const AUTH_RULE = "@request.auth.id != ''";

const VAK4 = "4 planten per vak (i.p.v. standaard 5)";
const VAK6 = "Laatste vak heeft 6 planten, zelfde rijlengte";

// [rijnummer, ras, aantal_planten, notitie?, planten_per_vak?]
const SEED_RIJEN = [
  [1, "Muscaris", 10],
  [2, "Muscaris", 15],
  [3, "Muscaris", 20],
  [4, "Muscaris", 25],
  [5, "Muscaris", 30],
  [6, "Souvignier Gris", 34],
  [7, "Souvignier Gris", 39],
  [8, "Souvignier Gris", 43],
  [9, "Souvignier Gris", 49],
  [10, "Souvignier Gris", 49],
  [11, "Souvignier Gris", 49],
  [12, "Souvignier Gris", 49],
  [13, "Souvignier Gris", 50],
  [14, "Souvignier Gris", 50],
  [15, "Souvignier Gris", 51],
  [16, "Souvignier Gris", 52],
  [17, "Souvignier Gris", 53],
  [18, "Souvignier Gris", 55],
  [19, "Souvignier Gris", 56],
  [20, "Souvignier Gris", 58],
  [21, "Souvignier Gris", 59],
  [22, "Souvignier Gris", 60],
  [23, "Johanniter", 50, VAK4, 4],
  [24, "Johanniter", 51, VAK4, 4],
  [25, "Johanniter", 65],
  [26, "Johanniter", 67],
  [27, "Johanniter", 68],
  [28, "Johanniter", 70],
  [29, "Johanniter", 71, VAK6],
  [30, "Johanniter", 72],
  [31, "Johanniter", 73],
  [32, "Johanniter", 74],
  [33, "Johanniter", 76, VAK6],
  [34, "Johanniter", 77],
  [35, "Johanniter", 78],
  [36, "Johanniter", 79],
  [37, "Johanniter", 80],
  [38, "Johanniter", 81, VAK6],
  [39, "Johanniter", 81],
  [40, "Regent", 82],
  [41, "Pinot Noir", 83],
  [42, "Regent", 83],
  [43, "Regent", 84],
  [44, "Regent", 84],
  [45, "Regent", 85],
  [46, "Regent", 85],
  [47, "Regent", 86, VAK6],
  [48, "Chardonnay", 86, VAK6],
  [49, "Chardonnay", 86, VAK6],
  [50, "Chardonnay", 86, VAK6],
  [51, "Chardonnay", 86, VAK6],
  [52, "Chardonnay", 86, VAK6],
  [53, "Chardonnay", 86, VAK6],
  [54, "Chardonnay", 86, VAK6],
  [55, "Pinotin", 85],
  [56, "Pinotin", 85],
  [57, "Pinotin", 85],
  [58, "Pinotin", 85],
  [59, "Pinotin", 84],
  [60, "Pinotin", 84],
  [61, "Pinotin", 84],
  [62, "Pinotin", 83],
  [63, "Pinotin", 83],
  [64, "Pinotin", 82],
  [65, "Pinotin", 82],
  [66, "Pinot Noir", 82],
  [67, "Pinotin", 81, VAK6],
  [68, "Pinotin", 81, VAK6],
  [69, "Pinot Noir", 36, VAK6],
];

const RAS_VALUES = [
  "Muscaris",
  "Souvignier Gris",
  "Johanniter",
  "Regent",
  "Pinot Noir",
  "Chardonnay",
  "Pinotin",
];
const OBSERVATIE_TYPES = ["gezond", "groei", "ziekte", "schade", "uitval", "anders"];
const FENOLOGIE_MOMENTEN = ["Knopbreek", "Bloei", "Zetting", "Véraison", "Oogstrijp"];
const NEERSLAG = ["Geen", "Lichte regen", "Matige regen", "Zware regen", "Onweer"];
const PARTIJ_TYPES = ["wit", "rood", "rosé", "mousserend", "overig"];
const PARTIJ_STATUSSEN = [
  "most",
  "gisting",
  "opvoeding",
  "klaar_voor_botteling",
  "gebotteld",
  "afgevoerd",
];
const PRODUCENT_SOORTEN = ["eigen_wijngaard", "drankproductie", "extern_klant"];
const OPDRACHT_TYPES = ["eigen_wijn", "drank", "loonproductie", "bottelservice"];
const TANK_STATUSSEN = ["leeg", "in_gebruik", "reiniging", "defect"];
const TANKBOEK_ACTIES = [
  "vullen",
  "overhevelen",
  "toevoeging",
  "monster",
  "botteling",
  "verlies",
  "correctie",
  "overig",
];
const KELDERLOG_ACTIES = [
  "ontstelen",
  "persen",
  "voorklaren",
  "gisting_start",
  "gisting_einde",
  "roeren",
  "overhevelen",
  "filtreren",
  "klaring",
  "toevoeging",
  "koeling",
  "proeven",
  "reiniging",
  "botteling",
  "overig",
];
const KELDERLOG_EENHEDEN = ["g", "kg", "ml", "l", "g_hl", "mg_l"];
const ANALYSE_METHODEN = ["eigen_meting", "extern_lab"];

// Tankinventaris van De Tappenmars — overgenomen uit "Tankboek Leeg.xlsx".
// IM = zwemdekseltank; capaciteit afgeleid uit de typecode. Pulptank/koeltank
// hebben geen capaciteit in de Excel: 0 + notitie, zelf invullen in de app.
// Seed is create-only (per code): bestaande tanks worden nooit overschreven,
// want huidige_partij/huidig_volume_l zijn live kelderdata.
// [code, soort, capaciteit_l]
const SEED_TANKS = [
  ["1", "IM530", 530],
  ["2", "IM530", 530],
  ["3", "IM530", 530],
  ["4", "IM530", 530],
  ["5", "IM530", 530],
  ["6", "650", 650],
  ["7", "650", 650],
  ["8", "1050", 1050],
  ["9", "IM530", 530],
  ["10", "650", 650],
  ["11", "IM530", 530],
  ["12", "IM530", 530],
  ["13", "1050", 1050],
  ["14", "650", 650],
  ["15", "1050", 1050],
  ["16", "1050", 1050],
  ["17", "650", 650],
  ["18", "650", 650],
  ["19", "IM530", 530],
  ["20", "Pulptank", 0],
  ["21", "Pulptank", 0],
  ["22", "IM1100", 1100],
  ["23", "IM1100", 1100],
  ["24", "IM2200", 2200],
  ["25", "IM2200", 2200],
  ["26", "IM530", 530],
  ["27", "IM1600", 1600],
  ["28", "koeltank", 0],
  ["29", "IM1600", 1600],
  ["30", "IM530", 530],
  ["31", "IM530", 530],
  ["32", "IM530", 530],
  ["33", "IM530", 530],
  ["34", "IM1600", 1600],
  ["35", "IM1600", 1600],
  ["36", "IM1100", 1100],
  ["37", "IM1100", 1100],
  ["38", "IM2200", 2200],
  ["39", "IM530", 530],
  ["40", "IM530", 530],
  ["41", "IM530", 530],
  ["42", "IM530", 530],
  ["43", "525 onder", 525],
  ["44", "525 boven", 525],
  ["45", "IM1100", 1100],
  ["46", "1050", 1050],
  ["47", "IM1100", 1100],
  ["IBC1", "IBC1000", 1000],
];

const SEED_PRODUCENTEN = [
  ["De Tappenmars", "eigen_wijngaard"],
  ["Thomas Drinks", "drankproductie"],
];

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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* leeg */
  }
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

// Voegt ontbrekende velden toe aan een bestaande collectie (schema-migratie)
async function ensureVelden(collectionNaam, velden) {
  const col = await api(`/api/collections/${collectionNaam}`);
  const bestaande = new Set(col.fields.map((f) => f.name));
  const nieuwe = velden.filter((v) => !bestaande.has(v.name));
  if (nieuwe.length === 0) return;
  await api(`/api/collections/${col.id}`, {
    method: "PATCH",
    body: { fields: [...col.fields, ...nieuwe] },
  });
  console.log(
    `  + ${nieuwe.length} veld(en) toegevoegd aan "${collectionNaam}": ${nieuwe.map((v) => v.name).join(", ")}`,
  );
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
      method: "POST",
      token: "",
      body: { identity: adminEmail, password: adminPass },
    });
    adminToken = auth.token;
  } catch (e) {
    if (e.status !== 404) throw e;
    const auth = await api("/api/admins/auth-with-password", {
      method: "POST",
      token: "",
      body: { identity: adminEmail, password: adminPass },
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
      { name: "notitie", type: "text" },
      { name: "planten_per_vak", type: "number", onlyInt: true },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  const rijRelatie = {
    name: "rij",
    type: "relation",
    required: true,
    collectionId: rijenCol.id,
    cascadeDelete: false,
    maxSelect: 1,
  };
  const fotoVeld = {
    name: "foto",
    type: "file",
    maxSelect: 1,
    maxSize: 10485760,
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
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
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
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
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
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
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
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
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
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "werkuren",
    type: "base",
    fields: [
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      {
        name: "taak",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "Snoeien",
          "Uitbreken",
          "Aanbinden",
          "Spuiten",
          "Maaien",
          "Bodembewerking",
          "Oogsten",
          "Overig",
        ],
      },
      { ...rijRelatie, required: false },
      { name: "ras", type: "select", maxSelect: 1, values: RAS_VALUES },
      { name: "uren", type: "number", required: true },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // Spuitregistratie (wettelijk verplicht voor gewasbescherming in NL)
  await ensureVelden("werkuren", [
    { name: "middel", type: "text" },
    { name: "dosering", type: "number" },
    {
      name: "dosering_eenheid",
      type: "select",
      maxSelect: 1,
      values: ["ml/L", "g/L", "kg/ha", "L/ha"],
    },
    { name: "reden", type: "select", maxSelect: 1, values: ["Preventief", "Curatief"] },
    { name: "wachttijd_dagen", type: "number", onlyInt: true },
  ]);

  await ensureCollection({
    name: "steekproef_planten",
    type: "base",
    fields: [
      { name: "client_id", type: "text", required: true },
      { name: "naam", type: "text" },
      { name: "ras", type: "select", required: true, maxSelect: 1, values: RAS_VALUES },
      { name: "rij", type: "text" },
      { name: "rijnummer", type: "number", onlyInt: true },
      { name: "plant", type: "number", onlyInt: true },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "steekproef_metingen",
    type: "base",
    fields: [
      { name: "client_id", type: "text", required: true },
      { name: "plant_client_id", type: "text", required: true },
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      { name: "trosaantal", type: "number" },
      { name: "trosgewicht", type: "number" },
      { name: "brix", type: "number" },
      { name: "zuurgraad", type: "number" },
      { name: "fenologie", type: "text" },
      { name: "ziektedruk", type: "text" },
      { name: "bladgroei", type: "text" },
      { name: "bodem", type: "text" },
      { name: "biodiversiteit", type: "text" },
      { name: "waterstress", type: "text" },
      { name: "opbrengst_kg", type: "number" },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "werkkalender",
    type: "base",
    fields: [
      { name: "ras", type: "select", required: true, maxSelect: 1, values: RAS_VALUES },
      { name: "kolom", type: "text", required: true },
      { name: "jaar", type: "number", required: true, onlyInt: true },
      { name: "datum", type: "text" },
      { name: "notitie", type: "text" },
      { name: "verwijderd", type: "bool" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "notities",
    type: "base",
    fields: [
      { name: "seizoen", type: "number", required: true, onlyInt: true },
      { name: "tekst", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "lab",
    type: "base",
    fields: [
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      {
        name: "soort",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["Bodemanalyse", "Sapanalyse", "Anders"],
      },
      { name: "ph", type: "number" },
      { name: "organische_stof", type: "number" },
      { name: "n", type: "number" },
      { name: "p", type: "number" },
      { name: "k", type: "number" },
      { name: "yan", type: "number" },
      { name: "nh4", type: "number" },
      { name: "nopa", type: "number" },
      { name: "notitie", type: "text" },
      {
        name: "bestand",
        type: "file",
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"],
      },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "rij_locaties",
    type: "base",
    fields: [
      { name: "rijnummer", type: "number", required: true, onlyInt: true },
      { name: "lat", type: "number", required: true },
      { name: "lon", type: "number", required: true },
      { name: "datum", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "ai_gesprekken",
    type: "base",
    fields: [
      { name: "client_id", type: "text", required: true },
      { name: "titel", type: "text" },
      { name: "berichten", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "audit_log",
    type: "base",
    fields: [
      { name: "tijd", type: "text", required: true },
      { name: "gebruiker", type: "text" },
      { name: "actie", type: "text", required: true },
      { name: "collectie", type: "text", required: true },
      { name: "samenvatting", type: "text" },
      { name: "oude_waarde", type: "text" },
      ...autodateFields(),
    ],
    // audit-log: iedereen mag schrijven/lezen, niemand mag wijzigen of wissen
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: null,
    deleteRule: null,
  });

  // 3a-2. Kelder — producenten en tanks.
  // Producenten: eigen wijn, Thomas Drinks en externe klanten (loonproductie/
  // bottelservice). Relatieveld i.p.v. vrije tekst zodat records nooit
  // versnipperen over spellingsvarianten.
  const producentenCol = await ensureCollection({
    name: "producenten",
    type: "base",
    fields: [
      { name: "naam", type: "text", required: true },
      {
        name: "soort",
        type: "select",
        required: true,
        maxSelect: 1,
        values: PRODUCENT_SOORTEN,
      },
      { name: "actief", type: "bool" },
      { name: "notitie", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // Tanks: fysieke keldervaten. huidige_partij/huidig_volume_l zijn CACHES —
  // de waarheid is het tankboek; alleen de server-endpoints muteren deze velden.
  const tanksCol = await ensureCollection({
    name: "tanks",
    type: "base",
    fields: [
      { name: "code", type: "text", required: true },
      { name: "soort", type: "text" },
      // niet required: PocketBase behandelt 0 als leeg, en pulptank/koeltank
      // staan bewust op 0 tot de capaciteit bekend is
      { name: "capaciteit_l", type: "number" },
      { name: "status", type: "select", required: true, maxSelect: 1, values: TANK_STATUSSEN },
      { name: "huidig_volume_l", type: "number" },
      { name: "locatie", type: "text" },
      { name: "notitie", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // 3a-3. Partijen (wijngaard → kelder overdracht): oogstlotten volgen tot
  // botteling. Bewust los van wijnbatches/tanks (vroeg-stadium concept, vóór
  // tanktoewijzing) — koppeling tussen partij en wijnbatch is toekomstig werk.
  const partijenCol = await ensureCollection({
    name: "partijen",
    type: "base",
    fields: [
      { name: "naam", type: "text", required: true },
      { name: "jaargang", type: "number", required: true, onlyInt: true },
      { name: "type", type: "select", required: true, maxSelect: 1, values: PARTIJ_TYPES },
      { name: "status", type: "select", required: true, maxSelect: 1, values: PARTIJ_STATUSSEN },
      { name: "samenstelling", type: "text" },
      { name: "start_volume_l", type: "number" },
      { name: "notitie", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureVelden("oogst", [
    {
      name: "partij",
      type: "relation",
      collectionId: partijenCol.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
  ]);

  // 3a-4. Partijen-uitbreiding (Fase 0–2 kelder): producent, opdrachttype,
  // genealogie-voorbereiding (ouder_partij, UI komt later), lot, dichtheden
  // (°Oe primair; Brix/SG worden altijd meegeschreven) en starttank.
  await ensureVelden("partijen", [
    {
      name: "producent",
      type: "relation",
      collectionId: producentenCol.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
    { name: "opdracht_type", type: "select", maxSelect: 1, values: OPDRACHT_TYPES },
    {
      name: "ouder_partij",
      type: "relation",
      collectionId: partijenCol.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
    { name: "lotnummer", type: "text" },
    { name: "pers_datum", type: "text" },
    { name: "gist", type: "text" },
    { name: "start_dichtheid_oechsle", type: "number" },
    { name: "start_dichtheid_brix", type: "number" },
    { name: "start_dichtheid_sg", type: "number" },
    {
      name: "start_tank",
      type: "relation",
      collectionId: tanksCol.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
  ]);

  // Kruisrelatie die pas kan bestaan nu partijen er is: tank → huidige partij (cache)
  await ensureVelden("tanks", [
    {
      name: "huidige_partij",
      type: "relation",
      collectionId: partijenCol.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
  ]);

  // 3a-5. Tankboek — het onwijzigbare kelderregister. Schrijven kan UITSLUITEND
  // via het server-endpoint (pb_hooks/kelder.pb.js): create/update/delete zijn
  // dichtgezet in de API-rules. Correcties = nieuwe regel met actie "correctie"
  // + corrigeert-verwijzing, nooit een bewerking van de historie.
  const tankboekCol = await ensureCollection({
    name: "tankboek",
    type: "base",
    fields: [
      { name: "datum", type: "text", required: true },
      { name: "tijd", type: "text" },
      {
        name: "partij",
        type: "relation",
        required: true,
        collectionId: partijenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "producent",
        type: "relation",
        collectionId: producentenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "actie", type: "select", required: true, maxSelect: 1, values: TANKBOEK_ACTIES },
      {
        name: "van_tank",
        type: "relation",
        collectionId: tanksCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "naar_tank",
        type: "relation",
        collectionId: tanksCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "volume_l", type: "number" },
      { name: "middel", type: "text" },
      { name: "dosering", type: "text" },
      { name: "verantwoordelijke", type: "text", required: true },
      { name: "notitie", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // 3a-6. Analyses (kelder) — gescheiden van "lab" (wijngaard: bodem/sap).
  await ensureCollection({
    name: "analyses",
    type: "base",
    fields: [
      { name: "datum", type: "text", required: true },
      { name: "tijd", type: "text" },
      {
        name: "partij",
        type: "relation",
        required: true,
        collectionId: partijenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "tank",
        type: "relation",
        collectionId: tanksCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "dichtheid_oechsle", type: "number" },
      { name: "dichtheid_brix", type: "number" },
      { name: "dichtheid_sg", type: "number" },
      { name: "ph", type: "number" },
      { name: "alcohol_pct", type: "number" },
      { name: "restsuiker_g_l", type: "number" },
      { name: "totaalzuur_g_l", type: "number" },
      { name: "vluchtig_zuur_g_l", type: "number" },
      { name: "so2_vrij", type: "number" },
      { name: "so2_totaal", type: "number" },
      { name: "methode", type: "select", maxSelect: 1, values: ANALYSE_METHODEN },
      {
        name: "bestand",
        type: "file",
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"],
      },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // 3a-7. Kelderlog — werklogboek (patroon van de Bewerkingen-tabel in het
  // Excel-logboek), géén takenplanner.
  await ensureCollection({
    name: "kelderlog",
    type: "base",
    fields: [
      { name: "datum", type: "text", required: true },
      {
        name: "partij",
        type: "relation",
        collectionId: partijenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "tank",
        type: "relation",
        collectionId: tanksCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "actie", type: "select", required: true, maxSelect: 1, values: KELDERLOG_ACTIES },
      { name: "middel", type: "text" },
      { name: "hoeveelheid", type: "number" },
      { name: "eenheid", type: "select", maxSelect: 1, values: KELDERLOG_EENHEDEN },
      { name: "notitie", type: "text" },
      fotoVeld,
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // 3a-8. Regelgeving-instellingen — tarieven/drempels als data i.p.v. code,
  // met "laatst gecontroleerd"-datum. Alleen scaffold; nog geen UI.
  await ensureCollection({
    name: "regelgeving_instellingen",
    type: "base",
    fields: [
      { name: "sleutel", type: "text", required: true },
      { name: "waarde", type: "number" },
      { name: "eenheid", type: "text" },
      { name: "geldig_vanaf", type: "text" },
      { name: "laatst_gecontroleerd", type: "text" },
      { name: "bron", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // corrigeert = zelfverwijzing; kan pas ná aanmaak (id nog onbekend in de definitie)
  await ensureVelden("tankboek", [
    {
      name: "corrigeert",
      type: "relation",
      collectionId: tankboekCol.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
  ]);

  // 3a-9. Seeds: producenten en tankinventaris (create-only, nooit overschrijven)
  {
    const bestaandeProducenten = await api("/api/collections/producenten/records?perPage=200");
    const namen = new Set((bestaandeProducenten.items ?? []).map((p) => p.naam));
    for (const [naam, soort] of SEED_PRODUCENTEN) {
      if (namen.has(naam)) continue;
      await api("/api/collections/producenten/records", {
        method: "POST",
        body: { naam, soort, actief: true },
      });
      console.log(`  + producent "${naam}" aangemaakt`);
    }

    const bestaandeTanks = await api("/api/collections/tanks/records?perPage=200");
    const codes = new Set((bestaandeTanks.items ?? []).map((t) => t.code));
    let nieuweTanks = 0;
    for (const [code, soort, capaciteit_l] of SEED_TANKS) {
      if (codes.has(code)) continue;
      await api("/api/collections/tanks/records", {
        method: "POST",
        body: {
          code,
          soort,
          capaciteit_l,
          status: "leeg",
          huidig_volume_l: 0,
          notitie: capaciteit_l === 0 ? "Capaciteit nog invullen" : "",
        },
      });
      nieuweTanks++;
    }
    if (nieuweTanks > 0) console.log(`  + ${nieuweTanks} tank(s) geseed uit tankinventaris`);
  }

  // 3b. Wijngaard-instellingen (vineyard_settings) + eerste configuratie
  await ensureCollection({
    name: "vineyard_settings",
    type: "base",
    fields: [
      { name: "naam", type: "text", required: true },
      { name: "plaats", type: "text" },
      { name: "lat", type: "number" },
      { name: "lon", type: "number" },
      { name: "oppervlakte_ha", type: "number" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });
  // eerste configuratie = De Tappenmars (alleen aanmaken als er nog geen is)
  const reedsConfig = await api("/api/collections/vineyard_settings/records?perPage=1");
  if (reedsConfig.totalItems === 0) {
    await api("/api/collections/vineyard_settings/records", {
      method: "POST",
      body: {
        naam: "De Tappenmars",
        plaats: "Den Ham",
        lat: 52.47291998204718,
        lon: 6.484049217459633,
        oppervlakte_ha: 1.5,
      },
    });
    console.log("  + eerste wijngaard-configuratie (De Tappenmars) aangemaakt");
  }

  // 3c. Multi-tenant voorbereiding: vineyard_id op alle datacollecties.
  // Puur schema-voorbereiding (niet geactiveerd in de UI). Default-tenant = "tappenmars".
  const TENANT_COLLECTIES = [
    "rijen",
    "metingen",
    "observaties",
    "fenologie",
    "gezondheid",
    "oogst",
    "werkuren",
    "steekproef_planten",
    "steekproef_metingen",
    "werkkalender",
    "notities",
    "lab",
    "rij_locaties",
    "ai_gesprekken",
    "partijen",
    "producenten",
    "tanks",
    "tankboek",
    "analyses",
    "kelderlog",
    "regelgeving_instellingen",
  ];
  for (const naam of TENANT_COLLECTIES) {
    await ensureVelden(naam, [{ name: "vineyard_id", type: "text" }]);
  }

  // 4a. rijen-schema migreren op bestaande databases:
  //   - notitie + planten_per_vak velden toevoegen
  //   - ras-select bijwerken naar de juiste rasnamen (o.a. "Souvignier Gris")
  await ensureVelden("rijen", [
    { name: "notitie", type: "text" },
    { name: "planten_per_vak", type: "number", onlyInt: true },
  ]);
  {
    const col = await api("/api/collections/rijen");
    const rasVeld = col.fields.find((f) => f.name === "ras");
    if (rasVeld && JSON.stringify(rasVeld.values) !== JSON.stringify(RAS_VALUES)) {
      const velden = col.fields.map((f) => (f.name === "ras" ? { ...f, values: RAS_VALUES } : f));
      await api(`/api/collections/${col.id}`, { method: "PATCH", body: { fields: velden } });
      console.log("  ✓ ras-select bijgewerkt naar actuele rasnamen");
    }
  }

  // 4b. rijen seeden/bijwerken (idempotent: bestaande rijen worden geüpdatet,
  //     nieuwe aangemaakt, en rijen die niet meer in de seed staan verwijderd)
  console.log("Rijen seeden/bijwerken...");
  const bestaandeRijen = await api("/api/collections/rijen/records?perPage=500&sort=rijnummer");
  const perNummer = new Map();
  for (const rec of bestaandeRijen.items ?? []) perNummer.set(rec.rijnummer, rec);
  let nieuw = 0;
  let bijgewerkt = 0;
  for (const [rijnummer, ras, aantal_planten, notitie, planten_per_vak] of SEED_RIJEN) {
    const body = {
      rijnummer,
      ras,
      aantal_planten,
      notitie: notitie ?? "",
      planten_per_vak: planten_per_vak ?? 5,
    };
    const bestaand = perNummer.get(rijnummer);
    if (bestaand) {
      await api(`/api/collections/rijen/records/${bestaand.id}`, { method: "PATCH", body });
      perNummer.delete(rijnummer);
      bijgewerkt++;
    } else {
      await api("/api/collections/rijen/records", { method: "POST", body });
      nieuw++;
    }
  }
  // overgebleven records (bv. een oude rij 70) staan niet meer in de seed → verwijderen
  let verwijderd = 0;
  for (const rec of perNummer.values()) {
    await api(`/api/collections/rijen/records/${rec.id}`, { method: "DELETE" });
    verwijderd++;
  }
  console.log(
    `  ✓ rijen: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt, ${verwijderd} verwijderd (${SEED_RIJEN.length} totaal)`,
  );

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
      method: "POST",
      token: "",
      body: { identity: test.email, password: test.wachtwoord },
    });
    const eersteRij = await api("/api/collections/rijen/records?perPage=1", {
      token: userAuth.token,
    });
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
      method: "DELETE",
      token: userAuth.token,
    });
    console.log(`  ✓ testmeting aangemaakt en verwijderd als ${test.email}`);
  }

  console.log("\n✅ PocketBase volledig ingericht!");
}

main().catch((e) => {
  console.error("\n❌ Fout:", e.message);
  process.exit(1);
});
