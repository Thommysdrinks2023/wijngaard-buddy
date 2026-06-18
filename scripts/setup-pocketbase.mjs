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
