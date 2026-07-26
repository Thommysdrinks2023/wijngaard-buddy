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

// ---------------------------------------------------------------------------
// Fase 12 — uitleesstand voor de schema-driftcontrole.
//
// Waarom dit hier zit en niet in een los bestand: dit script IS de bron van
// waarheid voor het schema. Een tweede kopie van de definities zou meteen
// gaan afwijken, en dan controleer je drift met een bron die zelf gedrift is.
//
// Zet DRIFT_DUMP=<pad.json> om het script alles te laten opschrijven wat het
// zou willen inrichten, ZONDER iets te wijzigen: elke niet-GET-aanroep wordt
// geblokkeerd. scripts/check-schema-drift.mjs leest die dump en vergelijkt hem
// met de draaiende database. Zonder de variabele verandert er niets aan het
// normale gedrag van dit script.
const DRIFT_DUMP = process.env.DRIFT_DUMP || "";
const droog = Boolean(DRIFT_DUMP);
const driftDefinities = [];
const driftVelden = [];

// Leeg = geen restrictie (ook anonieme/niet-ingelogde clients mogen erbij).
const OPEN_RULE = "";

// INLOGGEN VERWIJDERD — besluit Thomas, 26 juli 2026.
//
// Was: "@request.auth.id != ''" (alleen ingelogde gebruikers). Thomas wilde
// nergens meer een e-mail/wachtwoord hoeven invoeren en koos hier bewust voor,
// nadat het risico hieronder expliciet is benoemd. Deze ene constante stuurt
// alle 171 auth-regels tegelijk; daarom staat hij hier en niet verspreid.
//
// WAT DIT BETEKENT: iedereen die de PocketBase-server kan bereiken mag alle
// data lezen EN wijzigen. Dat is nu te overzien omdat de server uitsluitend op
// 127.0.0.1 luistert. Het is NIET te overzien zodra de app op de Raspberry Pi
// in de schuur draait (bereikbaar voor het hele thuisnetwerk) of op
// pb.tappenmars.nl (bereikbaar voor het hele internet). In beide gevallen
// liggen dan het tankboek, de klantgegevens (AVG) en het gebruikersbeheer
// open voor lezen en schrijven.
//
// TERUGZETTEN = deze regel terugveranderen in "@request.auth.id != ''", het
// script opnieuw draaien, en de frontend-guards herstellen (git-geschiedenis:
// de commit die dit weghaalde). Doe dat VOORDAT de server van 127.0.0.1 af
// gaat, niet erna.
//
// NIET geraakt door deze wijziging, en dat is opzet: de collecties met
// create/update/delete = null (tankboek, agent_acties). Die staan niet dicht
// vanwege inloggen maar vanwege ONWIJZIGBAARHEID — schrijven kan daar
// uitsluitend via de gecontroleerde serverendpoints, wat de correctheid van
// het wettelijke accijnsregister bewaakt. Dat blijft zo.
const AUTH_RULE = OPEN_RULE;

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
// Fase 4 — Botteling & Voorraad
const VOORRAAD_STATUSSEN = ["op_voorraad", "uitverkocht"];
const VOORRAAD_MUTATIE_TYPES = ["verkocht", "eigen_gebruik", "kapot", "weggegeven", "correctie"];

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

// Fase 3 — AI-agent
const AGENT_ROLLEN = ["user", "assistant", "tool"];
// LET OP: deze lijst moet meegroeien met elke nieuwe stel_*_voor-tool in
// pb_hooks/agent_logica.js. Staat een actie_type hier niet in, dan weigert
// PocketBase het voorstel bij het opslaan — de agent doet dan zichtbaar zijn
// werk en er komt niets in de bevestigingskaart. Dat is eerder misgegaan bij
// "onderhoud" en "order" (zie WERKLOG), en zou bij "meting"/"oogst" opnieuw
// zijn gebeurd.
const AGENT_ACTIE_TYPES = [
  "tankboek_boeking",
  "observatie",
  "uitval",
  "kelderlog",
  "analyse",
  "bottelronde",
  "voorraad_mutatie",
  "onderhoud",
  "order",
  // Fase 13 Blok G
  "meting",
  "oogst",
  // Assistent over de hele app (besluit Thomas, 26 juli 2026)
  "fenologie",
  "gezondheid",
  "werkuren",
  "bodem",
  "proefnotitie",
];
const AGENT_ACTIE_STATUSSEN = ["voorgesteld", "bevestigd", "afgewezen", "uitgevoerd", "mislukt"];
const INZICHT_TYPES = [
  "brix_verloop",
  "gisting_snelheid",
  "uitval_cluster",
  "gdd_afwijking",
  "fenologie_vergelijking",
  "spuit_effectiviteit",
];
const FEEDBACK_OORDELEN = ["klopte", "klopte_niet", "deels"];
// Fase 10 Blok 3: snooze = tijdelijk verbergen (tot snooze_tot),
// genegeerd = permanent wegklikken.
const SIGNAAL_ACTIES = ["gesnoozed", "genegeerd"];

const GEBRUIKERS = [
  { email: "invoerder1@tappenmars.nl", name: "Invoerder 1" },
  { email: "invoerder2@tappenmars.nl", name: "Invoerder 2" },
  { email: "invoerder3@tappenmars.nl", name: "Invoerder 3" },
];

let adminToken = "";

async function api(path, { method = "GET", body, token = adminToken, form } = {}) {
  // In de uitleesstand mag er niets gewijzigd worden. Lezen (GET) gaat gewoon
  // door — de driftcontrole heeft de live staat nodig — maar elke schrijfactie
  // wordt geblokkeerd en beantwoord met een onschuldige stub, zodat het script
  // door kan lopen tot het einde en alle definities langskomen.
  if (droog && method !== "GET" && !path.includes("auth-with-password")) {
    return { id: "droog", fields: [], items: [] };
  }
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
  // uitleesstand: opschrijven wat dit script aan velden verwacht, niets doen
  if (droog) {
    driftVelden.push({ collectie: collectionNaam, velden });
    return;
  }
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
  // Uitleesstand: de definitie vastleggen. Dit is precies het punt waar de
  // drift ontstaat — hieronder wordt een bestaande collectie ongemoeid
  // gelaten, dus wat hier in `def` staat is wat het schema ZOU moeten zijn,
  // en dat wordt bij een bestaande collectie nergens afgedwongen.
  if (droog) {
    driftDefinities.push(def);
    try {
      return await api(`/api/collections/${def.name}`);
    } catch {
      return { id: "droog", name: def.name, fields: [] };
    }
  }
  try {
    const bestaand = await api(`/api/collections/${def.name}`);
    console.log(`  ✓ collectie "${def.name}" bestaat al`);
    const naRegels = await synchroniseerRegels(bestaand, def);
    return await synchroniseerKeuzelijsten(naRegels, def);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const created = await api("/api/collections", { method: "POST", body: def });
  console.log(`  + collectie "${def.name}" aangemaakt`);
  return created;
}

const REGELSOORTEN = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

/**
 * Brengt de API-regels van een BESTAANDE collectie in lijn met de definitie.
 *
 * ensureCollection() is create-only en corrigeert een bestaande collectie
 * nooit — precies de driftbron die AUDIT-VELDGEREEDHEID.md §3.1 beschrijft.
 * Voor velden bestaat ensureVelden() al als migratiepad; voor API-REGELS
 * bestond dat niet, waardoor een regelwijziging in de code wel gecommit maar
 * nooit toegepast werd. Dat kwam aan het licht bij het verwijderen van het
 * inloggen (26 juli 2026): AUTH_RULE aanpassen veranderde in de database
 * niets.
 *
 * Bewust alleen de vijf regelvelden, en alleen bij een echt verschil: dit
 * script moet idempotent blijven en mag geen veldwijzigingen forceren.
 */
async function synchroniseerRegels(bestaand, def) {
  const wijzigingen = {};
  for (const soort of REGELSOORTEN) {
    if (!(soort in def)) continue;
    const gewenst = def[soort];
    const huidig = bestaand[soort];
    // null en "" zijn in PocketBase wezenlijk verschillend: null = niemand
    // (alleen hooks/superuser), "" = iedereen. Daarom strikt vergelijken.
    if (huidig === gewenst) continue;
    wijzigingen[soort] = gewenst;
  }
  if (Object.keys(wijzigingen).length === 0) return bestaand;

  const bijgewerkt = await api(`/api/collections/${bestaand.id}`, {
    method: "PATCH",
    body: wijzigingen,
  });
  const omschrijf = (v) => (v === null ? "null (alleen hooks)" : v === "" ? "open" : v);
  for (const [soort, waarde] of Object.entries(wijzigingen)) {
    console.log(`    ↻ ${def.name}.${soort}: ${omschrijf(waarde)}`);
  }
  return bijgewerkt;
}

/**
 * Vult ONTBREKENDE keuzelijstwaarden aan op een bestaande collectie.
 *
 * Derde keer raak (26 juli 2026). Een nieuw actie_type toevoegen in de code
 * deed in de database niets, want ensureCollection() raakt een bestaande
 * collectie niet aan en ensureVelden() voegt alleen ONTBREKENDE VELDEN toe —
 * een bestaand veld met een gewijzigde `values`-lijst valt door beide mazen.
 * Gevolg: de agent bouwt netjes een voorstel, PocketBase weigert het bij het
 * opslaan, en op het scherm gebeurt er simpelweg niets. Dat is eerder gebeurd
 * bij "onderhoud" en "order" (WERKLOG) en zou nu bij "meting"/"oogst" opnieuw
 * zijn gebeurd.
 *
 * BEWUST ALLEEN TOEVOEGEN, NOOIT VERWIJDEREN. Een waarde weghalen die in
 * bestaande records voorkomt maakt die records ongeldig; dat mag nooit een
 * bijwerking van een routinematige schema-run zijn. Verwijderen blijft dus
 * handwerk, met de driftcontrole als signaal.
 */
async function synchroniseerKeuzelijsten(bestaand, def) {
  if (!Array.isArray(def.fields) || !Array.isArray(bestaand.fields)) return bestaand;
  const velden = bestaand.fields.map((v) => ({ ...v }));
  const toegevoegd = [];

  for (const gewenst of def.fields) {
    if (gewenst.type !== "select" || !Array.isArray(gewenst.values)) continue;
    const huidig = velden.find((v) => v.name === gewenst.name && v.type === "select");
    if (!huidig || !Array.isArray(huidig.values)) continue;
    const missend = gewenst.values.filter((w) => !huidig.values.includes(w));
    if (missend.length === 0) continue;
    huidig.values = [...huidig.values, ...missend];
    toegevoegd.push(`${gewenst.name}: +${missend.join(", +")}`);
  }

  if (toegevoegd.length === 0) return bestaand;
  const bijgewerkt = await api(`/api/collections/${bestaand.id}`, {
    method: "PATCH",
    body: { fields: velden },
  });
  for (const regel of toegevoegd) console.log(`    ↻ ${def.name}.${regel}`);
  return bijgewerkt;
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

  // Fase 10 Blok 1 — app_instellingen: operationele voorkeuren (drempels,
  // plafonds), bewust GESCHEIDEN van regelgeving_instellingen. Die laatste is
  // gereserveerd voor wettelijk/officieel geverifieerde waarden (elk record
  // heeft een laatst_gecontroleerd-datum + bron die een echte controle
  // impliceren) - een operationele voorkeur als "vanaf welke backup-leeftijd
  // waarschuwen" heeft geen bron om te verifiëren en zou dat contract
  // verwateren. Zie ONTWERP-2-DATAMODEL.md §3.
  await ensureCollection({
    name: "app_instellingen",
    type: "base",
    fields: [
      { name: "sleutel", type: "text", required: true },
      { name: "waarde", type: "number" },
      { name: "eenheid", type: "text" },
      { name: "notitie", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // 3a-8b. Kelderuitbreiding: velden uit Logboek_leeg.xlsx die vóór de eerste
  // analyse al ingevuld worden (Ph/Totaal zuur bovenaan het logboek) plus twee
  // vinkjes (ontstelen/voorklaren) en twee vrije-tekstvelden. "gist" stond al
  // in het Fase 0-2-schema (zie hierboven) en wordt hier bewust niet dubbel
  // toegevoegd.
  await ensureVelden("partijen", [
    { name: "ontstelen", type: "bool" },
    { name: "voorklaren", type: "bool" },
    { name: "ph_bij_aanmaak", type: "number" },
    { name: "totaal_zuur_bij_aanmaak", type: "number" },
    { name: "standtijd", type: "text" },
    { name: "koeling", type: "text" },
  ]);

  // 3a-8d. Voedingswaarde-/etiketberekening — losstaande rekentool gekoppeld aan
  // een partij (voor het energielabel bij botteling), géén bottelfunctionaliteit
  // zelf. Elke berekening is een los, nooit overschreven record (historie).
  // Zelfde AUTH_RULE-niveau als analyses/kelderlog.
  const voedingswaardeCol = await ensureCollection({
    name: "voedingswaarde_berekeningen",
    type: "base",
    fields: [
      {
        name: "partij",
        type: "relation",
        required: true,
        collectionId: partijenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "berekening_datum", type: "text", required: true },
      { name: "alcohol_gram_liter", type: "number" },
      { name: "restsuiker_gram_liter", type: "number" },
      { name: "zuur_gram_liter", type: "number" },
      { name: "glycerine_gram_liter", type: "number" },
      { name: "kcal_totaal", type: "number" },
      { name: "kj_totaal", type: "number" },
      { name: "etiket_tekst", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // 3a-9. Fase 4 — Botteling & Voorraad. Zie DECISIONS-FASE4.md voor de
  // afwijkingen t.o.v. de letterlijke opdracht (Nederlandse veldnamen,
  // van_tank toegevoegd, geen "operator"-relatie naar users, geen
  // "deleted"-veld op voorraad_mutaties). createRule = null op alle drie:
  // schrijven kan uitsluitend via de atomische server-endpoints hieronder.
  const bottelrondesCol = await ensureCollection({
    name: "bottelrondes",
    type: "base",
    fields: [
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
      {
        name: "van_tank",
        type: "relation",
        required: true,
        collectionId: tanksCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "botteldatum", type: "text", required: true },
      { name: "aantal_flessen", type: "number", required: true, onlyInt: true },
      { name: "flesinhoud_ml", type: "number", required: true },
      { name: "flestype", type: "text" },
      { name: "kleur_fles", type: "text" },
      { name: "parelwijn", type: "bool" },
      { name: "lotnummer", type: "text" },
      {
        name: "voedingswaarde_berekening",
        type: "relation",
        collectionId: voedingswaardeCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "notities", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      { name: "deleted", type: "bool" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  const voorraadFlessenCol = await ensureCollection({
    name: "voorraad_flessen",
    type: "base",
    fields: [
      {
        name: "bottelronde",
        type: "relation",
        required: true,
        collectionId: bottelrondesCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
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
      { name: "wijnnaam", type: "text", required: true },
      { name: "jaargang", type: "number", onlyInt: true },
      { name: "aantal_beginvoorraad", type: "number", required: true, onlyInt: true },
      // niet required: PocketBase behandelt 0 als leeg (zelfde valkuil als
      // tanks.capaciteit_l), en 0 is hier juist de legitieme "uitverkocht"-waarde
      { name: "aantal_huidig", type: "number", onlyInt: true },
      { name: "locatie", type: "text" },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: VOORRAAD_STATUSSEN,
      },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // Fase 10 Blok 4 — per-wijn voorraaddrempel. Nu al toegevoegd (besluit
  // Thomas) ook al start hij met de globale standaard uit app_instellingen:
  // zo is er later geen migratie nodig. Leeg = gebruik de globale waarde.
  await ensureVelden("voorraad_flessen", [{ name: "drempel_aantal", type: "number" }]);

  await ensureCollection({
    name: "voorraad_mutaties",
    type: "base",
    fields: [
      {
        name: "voorraad",
        type: "relation",
        required: true,
        collectionId: voorraadFlessenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "mutatie_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: VOORRAAD_MUTATIE_TYPES,
      },
      { name: "aantal", type: "number", required: true, onlyInt: true },
      { name: "datum", type: "text", required: true },
      { name: "afnemer_of_reden", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      { name: "notities", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
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

  // Fase 13 Blok A — vastleggen WELKE analysevelden zijn ingevuld.
  // Onderzocht op PocketBase 0.39: een optioneel number-veld komt altijd als 0
  // terug, of je het nu weglaat, null stuurt of leeg laat. Er is dus geen
  // opslagniveau-onderscheid tussen "niet gemeten" en "gemeten, waarde 0".
  // Voor pH/°Oe/Brix/SG/zuur is 0 fysiek onmogelijk en dus zelf al bewijs,
  // maar voor alcohol, SO₂ en restsuiker is 0 een geldige uitkomst — daar is
  // deze expliciete registratie de enige manier om het verschil te bewaren.
  // Kommagescheiden veldnamen; leeg bij analyses van vóór deze versie.
  await ensureVelden("analyses", [{ name: "gemeten_velden", type: "text" }]);

  // Fase 13 Blok B — oogsten binnen de veiligheidstermijn wordt niet
  // geblokkeerd (op een plukdag moet je door kunnen), maar wél vastgelegd:
  // wie heeft wat bevestigd, met welk middel, welke termijn en welke bron.
  // Zonder dat veld is de afweging achteraf niet te reconstrueren, en juist
  // dát is wat een controleur zou willen zien.
  await ensureVelden("oogst", [{ name: "wachttijd_bevestigd", type: "text" }]);

  // Fase 13 Blok C — taken kunnen afronden. Een taak is een kelderlogregel
  // waarvan de notitie met "TAAK:" begint (leidend begrip; agent_acties is
  // slechts het bevestigingsmechanisme dat zo'n regel aanmaakt). De afronding
  // komt in APARTE velden ernaast: de oorspronkelijke notitie wordt nooit
  // herschreven. Kelderlog is bewust wél wijzigbaar — anders dan `tankboek`,
  // dat het wettelijke register is; kelderlog is een werklogboek.
  //
  // `taak_sluit_bij` maakt automatisch afronden algemeen in plaats van een
  // SO₂-uitzondering: "<soort>:<veld>", bijv. "analyse:so2_vrij" betekent
  // "sluit zodra er voor deze partij een analyse is mét vrij SO₂ gemeten,
  // op of ná de taakdatum".
  // Fase 13 Blok D — een inzicht bewaarde alleen een leesbaar LABEL in
  // `onderwerp` ("Rij 22", of een partijnaam), geen verwijzing. Daardoor kon de
  // melding "Rij 22 heeft bovengemiddelde uitval" nergens anders heen linken
  // dan naar de assistent. `onderwerp_id` maakt van dat label een echte
  // verwijzing; `onderwerp_soort` zegt naar welke collectie hij wijst.
  await ensureVelden("inzichten", [
    { name: "onderwerp_id", type: "text" },
    { name: "onderwerp_soort", type: "text" },
  ]);

  await ensureVelden("kelderlog", [
    { name: "taak_status", type: "select", maxSelect: 1, values: ["open", "afgerond"] },
    { name: "taak_afgerond_op", type: "text" },
    { name: "taak_afgerond_door", type: "text" },
    { name: "taak_sluit_bij", type: "text" },
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

  // ingebouwde auth-collectie, nodig als relation-doel voor agent-collecties
  const usersCol = await api("/api/collections/users");

  // Fase 10 Blok 3 — signaal_status: server-side snooze/dismiss van signalen.
  // Bewust NIET localStorage (besluit Thomas): hij werkt op telefoon in de
  // wijngaard én op desktop, iets wegklikken moet overal gelden, en
  // localStorage verdwijnt bij het legen van de cache. OPEN_RULE conform de
  // rest van de app (bewust ook zonder login bruikbaar, Fase 3/8-besluit) -
  // snoozen is geen gevoelige actie. Zie ONTWERP-2-DATAMODEL.md §4.
  await ensureCollection({
    name: "signaal_status",
    type: "base",
    fields: [
      { name: "signaal_id", type: "text", required: true },
      { name: "actie", type: "select", required: true, maxSelect: 1, values: SIGNAAL_ACTIES },
      { name: "snooze_tot", type: "text" },
      {
        name: "gebruiker",
        type: "relation",
        collectionId: usersCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      ...autodateFields(),
    ],
    indexes: [
      "CREATE INDEX idx_signaal_status_signaal_id ON signaal_status (signaal_id)",
      "CREATE INDEX idx_signaal_status_snooze_tot ON signaal_status (snooze_tot)",
    ],
    listRule: OPEN_RULE,
    viewRule: OPEN_RULE,
    createRule: OPEN_RULE,
    updateRule: OPEN_RULE,
    deleteRule: OPEN_RULE,
  });

  // 3a-10. AI-agent (Fase 3): gesprekken, berichten, bevestigingsacties, inzichten,
  // adviesfeedback. Schrijfacties gaan NOOIT direct de vakcollecties in — de
  // agent stelt voor via agent_acties (status "voorgesteld"); pas na expliciete
  // bevestiging voert het bevestig-endpoint de bestaande atomische
  // endpoints/hooks aan (zie pb_hooks/agent.pb.js). Regels 1-8 uit Fase 2
  // blijven ongewijzigd de bron van waarheid voor kelderboekingen.
  const agentGesprekkenCol = await ensureCollection({
    name: "agent_gesprekken",
    type: "base",
    fields: [
      {
        name: "gebruiker",
        type: "relation",
        collectionId: usersCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "titel", type: "text" },
      { name: "laatste_bericht_op", type: "text" },
      { name: "deleted", type: "bool" },
      ...autodateFields(),
    ],
    // Open (geen AUTH_RULE): de assistent werkt bewust ook zonder inloggen,
    // net als de rest van de app (zie CLAUDE.md — "login weer optioneel").
    // Geen multi-tenant scheiding nodig: één bedrijf, één PocketBase-instantie.
    listRule: OPEN_RULE,
    viewRule: OPEN_RULE,
    createRule: OPEN_RULE,
    updateRule: OPEN_RULE,
    deleteRule: OPEN_RULE,
  });

  const gesprekRelatie = {
    name: "gesprek_id",
    type: "relation",
    required: true,
    collectionId: agentGesprekkenCol.id,
    cascadeDelete: true,
    maxSelect: 1,
  };

  const agentBerichtenCol = await ensureCollection({
    name: "agent_berichten",
    type: "base",
    fields: [
      gesprekRelatie,
      { name: "rol", type: "select", required: true, maxSelect: 1, values: AGENT_ROLLEN },
      { name: "inhoud", type: "text" },
      { name: "tool_calls", type: "json" },
      { name: "tool_resultaten", type: "json" },
      { ...fotoVeld, maxSize: 10485760 },
      { name: "deleted", type: "bool" },
      ...autodateFields(),
    ],
    listRule: OPEN_RULE,
    viewRule: OPEN_RULE,
    createRule: OPEN_RULE,
    updateRule: OPEN_RULE,
    deleteRule: OPEN_RULE,
  });

  await ensureCollection({
    name: "agent_acties",
    type: "base",
    fields: [
      { ...gesprekRelatie, cascadeDelete: false },
      {
        name: "bericht_id",
        type: "relation",
        collectionId: agentBerichtenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "actie_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: AGENT_ACTIE_TYPES,
      },
      { name: "payload", type: "json", required: true },
      { name: "samenvatting", type: "text", required: true },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: AGENT_ACTIE_STATUSSEN,
      },
      { name: "fout", type: "text" },
      { name: "uitgevoerd_record_id", type: "text" },
      {
        name: "bevestigd_door",
        type: "relation",
        collectionId: usersCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "bevestigd_op", type: "text" },
      ...autodateFields(),
    ],
    // Lezen open (geen login nodig, zelfde als de andere agent-collecties).
    // Schrijven blijft dicht (null = uitsluitend de hook-context): dat is een
    // bedrijfsregel ("bevestigen kan alleen via het echte bevestigingspad"),
    // geen inlog-vereiste — staat los van OPEN_RULE hierboven.
    listRule: OPEN_RULE,
    viewRule: OPEN_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  await ensureCollection({
    name: "inzichten",
    type: "base",
    fields: [
      { name: "inzicht_type", type: "select", required: true, maxSelect: 1, values: INZICHT_TYPES },
      { name: "onderwerp", type: "text", required: true },
      { name: "periode", type: "text" },
      { name: "berekend_op", type: "text", required: true },
      { name: "waarde", type: "json" },
      { name: "samenvatting_nl", type: "text", required: true },
      { name: "deleted", type: "bool" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  await ensureCollection({
    name: "advies_feedback",
    type: "base",
    fields: [
      {
        name: "bericht_id",
        type: "relation",
        required: true,
        collectionId: agentBerichtenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "oordeel", type: "select", required: true, maxSelect: 1, values: FEEDBACK_OORDELEN },
      { name: "toelichting", type: "text" },
      {
        name: "gegeven_door",
        type: "relation",
        collectionId: usersCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      ...autodateFields(),
    ],
    listRule: OPEN_RULE,
    viewRule: OPEN_RULE,
    createRule: OPEN_RULE,
    updateRule: OPEN_RULE,
    deleteRule: OPEN_RULE,
  });

  // 3a-EINDSPRINT. Blokken B/G/K/L/M/O uit de eindsprint-prompt (juli 2026).
  // Zelfde idempotente patroon als alles hierboven; zie WERKLOG.md.

  // Blok B — rollen op de bestaande auth-collectie. Bestaande accounts krijgen
  // via de migratie hieronder "beheerder" (géén functionaliteitsverlies t.o.v.
  // vandaag, waar iedereen alles mag); Thomas degradeert zelf wie medewerker
  // of alleen_lezen moet worden. Handhaving zit in de hook-endpoints, niet
  // alleen in de UI.
  await ensureVelden("users", [
    {
      name: "rol",
      type: "select",
      maxSelect: 1,
      values: ["beheerder", "medewerker", "alleen_lezen"],
    },
    { name: "weergavenaam", type: "text" },
  ]);
  {
    const zonderRol = await api(
      `/api/collections/users/records?perPage=200&filter=${encodeURIComponent("rol = ''")}`,
    );
    for (const u of zonderRol.items) {
      await api(`/api/collections/users/records/${u.id}`, {
        method: "PATCH",
        body: { rol: "beheerder", weergavenaam: u.name || u.email },
      });
    }
    if (zonderRol.items.length > 0)
      console.log(`  + ${zonderRol.items.length} bestaande account(s) op rol "beheerder" gezet`);
  }

  // Blok G — bodemgezondheid, uitbreiding binnen de wijngaardmodule.
  await ensureCollection({
    name: "bodem_observaties",
    type: "base",
    fields: [
      {
        name: "rij",
        type: "relation",
        collectionId: rijenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "blok", type: "text" },
      { name: "datum", type: "text", required: true },
      { name: "seizoen", type: "number", onlyInt: true },
      {
        name: "bodemvocht",
        type: "select",
        maxSelect: 1,
        values: ["droog", "vochtig", "nat", "verzadigd"],
      },
      { name: "bodemvocht_pct", type: "number" },
      { name: "ph_veld", type: "number" },
      { name: "organische_stof", type: "text" },
      { name: "structuur", type: "text" },
      { name: "verslemping", type: "bool" },
      { name: "bodemleven", type: "text" },
      {
        name: "gebreksverschijnselen",
        type: "select",
        maxSelect: 7,
        values: ["N", "Mg", "K", "Fe", "B", "Zn", "Mn"],
      },
      { name: "drainage", type: "text" },
      fotoVeld,
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

  // Fase 7 Blok F1 — Ctgb-middelen (gevuld via scripts/import-ctgb.mjs uit een
  // handmatig gedownloade Ctgb-toelatingenexport; geen live koppeling).
  await ensureCollection({
    name: "middelen",
    type: "base",
    fields: [
      { name: "naam", type: "text", required: true },
      { name: "toelatingsnummer", type: "text", required: true },
      { name: "actieve_stof", type: "text" },
      { name: "max_dosering", type: "number" },
      { name: "max_dosering_eenheid", type: "text" },
      { name: "max_toepassingen_seizoen", type: "number", onlyInt: true },
      { name: "veiligheidstermijn_dagen", type: "number", onlyInt: true },
      { name: "herbetreding_uren", type: "number" },
      { name: "geldig_tot", type: "text" },
      { name: "bron", type: "text" },
      { name: "geimporteerd_op", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // Fase 7 Blok G — sensoriek: één simpel proefformulier-model per partij.
  await ensureCollection({
    name: "proefnotities",
    type: "base",
    fields: [
      {
        name: "partij",
        type: "relation",
        collectionId: partijenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
        required: true,
      },
      { name: "datum", type: "text", required: true },
      { name: "proever", type: "text", required: true },
      { name: "helderheid", type: "text" },
      { name: "kleur", type: "text" },
      { name: "geur", type: "text" },
      { name: "smaak", type: "text" },
      { name: "balans", type: "text" },
      { name: "score", type: "number", onlyInt: true, min: 1, max: 10 },
      { name: "gebotteld_exemplaar", type: "bool" },
      { name: "notities", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // Fase 7 Blok F3 — sensor-metingen (IoT-voorbereiding; alleen het endpoint
  // in pb_hooks/sensor.pb.js schrijft hier, met een apart sensor-token).
  const tanksColF7 = await api("/api/collections/tanks");
  await ensureCollection({
    name: "sensor_metingen",
    type: "base",
    fields: [
      {
        name: "tank",
        type: "relation",
        collectionId: tanksColF7.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "temperatuur_c", type: "number", required: true },
      { name: "gemeten_op", type: "text", required: true },
      { name: "sensor_id", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // Blok L — verkoop licht. Orders muteren voorraad UITSLUITEND via het
  // server-endpoint (order-leveren, voorraad.pb.js) — de orderregels zelf
  // zijn concept-administratie en mogen vrij bewerkt worden zolang de order
  // niet geleverd is (dat bewaakt het endpoint).
  const klantenCol = await ensureCollection({
    name: "klanten",
    type: "base",
    fields: [
      { name: "naam", type: "text", required: true },
      {
        name: "type",
        type: "select",
        maxSelect: 1,
        values: ["particulier", "horeca", "winkel", "evenement"],
      },
      { name: "contact", type: "text" },
      { name: "notities", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });
  await ensureCollection({
    name: "orders",
    type: "base",
    fields: [
      {
        name: "klant",
        type: "relation",
        required: true,
        collectionId: klantenCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "datum", type: "text", required: true },
      { name: "regels", type: "json", required: true },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["concept", "geleverd", "betaald"],
      },
      { name: "notities", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // Blok M — materieel & onderhoud (logboek, geen assetmanagement).
  const materieelCol = await ensureCollection({
    name: "materieel",
    type: "base",
    fields: [
      { name: "naam", type: "text", required: true },
      {
        name: "type",
        type: "select",
        maxSelect: 1,
        values: ["tractor", "spuit", "bottellijn", "koeling", "overig"],
      },
      { name: "bouwjaar", type: "number", onlyInt: true },
      { name: "notities", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });
  await ensureCollection({
    name: "onderhoudslog",
    type: "base",
    fields: [
      {
        name: "materieel",
        type: "relation",
        required: true,
        collectionId: materieelCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "datum", type: "text", required: true },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["onderhoud", "reparatie", "keuring"],
      },
      { name: "omschrijving", type: "text", required: true },
      { name: "kosten", type: "number" },
      { name: "volgende_keer", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
  });

  // Blok O — archief voor jaarafsluitingen: alleen vastleggen, nooit wijzigen
  // (zelfde append-only-principe als tankboek; een fout archief vervang je
  // door een nieuw record, niet door bewerken).
  await ensureCollection({
    name: "archief",
    type: "base",
    fields: [
      { name: "jaar", type: "number", required: true, onlyInt: true },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["jaaroverzicht", "overig"],
      },
      {
        name: "bestand",
        type: "file",
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["application/pdf"],
      },
      { name: "samenvatting", type: "json" },
      { name: "notitie", type: "text" },
      { name: "ingevoerd_door", type: "text" },
      ...autodateFields(),
    ],
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: null,
    deleteRule: null,
  });

  // Blok K — regelgeving-seeds: sleutels aanmaken ZONDER bedragen. De echte
  // tarieven vult Thomas in na verificatie bij de Douane; de app rekent pas
  // als waarde > 0 én laatst_gecontroleerd ingevuld is (zie accijns-UI).
  const REGELGEVING_SEEDS = [
    {
      sleutel: "agent_berichten_per_uur_per_ip",
      waarde: 30,
      eenheid: "berichten/uur",
      bron: "Eindsprint Blok C — kostenrem AI-agent",
    },
    {
      sleutel: "accijns_stille_wijn_per_hl",
      eenheid: "EUR/hl",
      bron: "Invullen na verificatie bij de Douane (tarief stille wijn)",
    },
    {
      sleutel: "accijns_mousserende_wijn_per_hl",
      eenheid: "EUR/hl",
      bron: "Invullen na verificatie bij de Douane (tarief mousserende wijn)",
    },
    {
      sleutel: "agp_drempel_liters_per_jaar",
      eenheid: "L/jaar",
      bron: "Invullen na verificatie: AGP-/vrijstellingsdrempel",
    },
    // Fase 7 Blok A — AVG-bewaartermijn klanten zonder orders (opschoonlijst)
    {
      sleutel: "klant_bewaartermijn_maanden",
      waarde: 24,
      eenheid: "maanden",
      bron: "Fase 7 Blok A — AVG: klanten zonder orders ouder dan dit verschijnen in de opschoonlijst op /verkoop",
    },
    // Fase 7 Blok C — wijnbouwzone + oenologische limieten (Thomas verifieert en vult)
    {
      sleutel: "wijnbouwzone",
      waarde: 1,
      eenheid: "zone (1 = A)",
      bron: "Aanname: Nederland = wijnbouwzone A (EU-verordening 2013/1308 bijlage VII). Instelling, geen code.",
    },
    {
      sleutel: "verrijking_max_volpct_zone",
      eenheid: "vol% alcohol",
      bron: "Invullen na verificatie: max. verrijking (chaptalisatie) wijnbouwzone A, EU-verordening",
    },
    {
      sleutel: "aanzuring_max_g_l",
      eenheid: "g/L wijnsteenzuur",
      bron: "Invullen na verificatie: max. aanzuring wijnbouwzone A, EU-verordening",
    },
    {
      sleutel: "ontzuring_max_g_l",
      eenheid: "g/L wijnsteenzuur-equivalent",
      bron: "Invullen na verificatie: max. ontzuring wijnbouwzone A, EU-verordening",
    },
    {
      sleutel: "so2_streef_moleculair_mg_l",
      waarde: 0.8,
      eenheid: "mg/L moleculair SO2",
      bron: "Gangbare streefwaarde stille wijn (0,8 mg/L); instelbaar per wijnstijl in de calculator",
    },
  ];
  for (const seed of REGELGEVING_SEEDS) {
    const bestaand = await api(
      `/api/collections/regelgeving_instellingen/records?perPage=1&filter=${encodeURIComponent(`sleutel='${seed.sleutel}'`)}`,
    );
    if (bestaand.totalItems === 0) {
      await api("/api/collections/regelgeving_instellingen/records", {
        method: "POST",
        body: seed,
      });
      console.log(`  + regelgeving-sleutel "${seed.sleutel}" aangemaakt`);
    }
  }

  // Fase 10 Blok 1 — app_instellingen-seeds. Alle vier sleutels in één keer
  // geseed (ook al worden signaal_max_zichtbaar/voorraad_drempel_standaard
  // pas in latere bouwstappen gebruikt) zodat er niet drie losse
  // schema-migraties nodig zijn.
  const APP_INSTELLINGEN_SEEDS = [
    {
      sleutel: "backup_waarschuwing_dagen",
      waarde: 2,
      eenheid: "dagen",
      notitie: "Vanaf welke leeftijd van de laatste backup een signaal verschijnt.",
    },
    {
      sleutel: "agp_waarschuwing_percentage",
      waarde: 80,
      eenheid: "%",
      notitie:
        "Vanaf welk percentage van de AGP-drempel gewaarschuwd wordt. De AGP-drempel zelf (wettelijk) staat in regelgeving_instellingen.",
    },
    {
      sleutel: "voorraad_drempel_standaard",
      waarde: 12,
      eenheid: "flessen",
      notitie: "Globale voorraad-bijna-op-drempel voor wijnen zonder eigen drempel_aantal.",
    },
    {
      sleutel: "signaal_max_zichtbaar",
      waarde: 6,
      eenheid: "stuks",
      notitie: "Plafond op het aantal gelijktijdig getoonde signalen in de Vandaag-widget.",
    },
  ];
  for (const seed of APP_INSTELLINGEN_SEEDS) {
    const bestaand = await api(
      `/api/collections/app_instellingen/records?perPage=1&filter=${encodeURIComponent(`sleutel='${seed.sleutel}'`)}`,
    );
    if (bestaand.totalItems === 0) {
      await api("/api/collections/app_instellingen/records", {
        method: "POST",
        body: seed,
      });
      console.log(`  + app-instelling "${seed.sleutel}" aangemaakt`);
    }
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
    "voedingswaarde_berekeningen",
    "bottelrondes",
    "voorraad_flessen",
    "voorraad_mutaties",
    "agent_gesprekken",
    "agent_berichten",
    "agent_acties",
    "inzichten",
    "advies_feedback",
    // Eindsprint B/G/K/L/M/O
    "bodem_observaties",
    "klanten",
    "orders",
    "materieel",
    "onderhoudslog",
    "archief",
    // Fase 7
    "middelen",
    "sensor_metingen",
    "proefnotities",
    // Fase 10
    "app_instellingen",
    "signaal_status",
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
  // Fase 11: dit blok patchte eerder ALLEEN "rijen". RAS_VALUES wordt echter
  // in 6 collecties gebruikt, en ensureCollection() is create-only — het werkt
  // select-waarden van een bestaande collectie nooit bij. Gevolg (live gevonden
  // in Fase 11): rijen.ras stond correct op "Souvignier Gris", maar fenologie,
  // oogst, werkuren, steekproef_planten en werkkalender hingen nog op de oude
  // tikfout "Souveginier Gris". Elke schrijfactie voor die 17 rijen faalde met
  // HTTP 400 "Invalid value Souvignier Gris" — onzichtbaar tot je het probeert.
  // Daarom nu generiek over álle collecties met een ras-select.
  {
    const alle = await api("/api/collections?perPage=200");
    for (const col of alle.items ?? []) {
      if (col.name.startsWith("_")) continue;
      const rasVeld = (col.fields ?? []).find((f) => f.name === "ras" && f.type === "select");
      if (!rasVeld) continue;
      if (JSON.stringify(rasVeld.values) === JSON.stringify(RAS_VALUES)) continue;
      const velden = col.fields.map((f) =>
        f.name === "ras" && f.type === "select" ? { ...f, values: RAS_VALUES } : f,
      );
      await api(`/api/collections/${col.id}`, { method: "PATCH", body: { fields: velden } });
      console.log(`  ✓ ras-select bijgewerkt in "${col.name}"`);
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

function schrijfDriftDump(onvolledig) {
  writeFileSync(
    DRIFT_DUMP,
    JSON.stringify({ onvolledig, collecties: driftDefinities, velden: driftVelden }, null, 2),
  );
  console.log(
    `\nUitleesstand: ${driftDefinities.length} collectiedefinities en ${driftVelden.length} veldsets weggeschreven naar ${DRIFT_DUMP}` +
      (onvolledig ? " (ONVOLLEDIG — script liep vast, zie melding hierboven)" : ""),
  );
}

main()
  .then(() => {
    if (droog) schrijfDriftDump(false);
  })
  .catch((e) => {
    // In de uitleesstand is vastlopen te verwachten: het script wil ook records
    // en gebruikers aanmaken, en die schrijfacties zijn geblokkeerd. Alles wat
    // tot dat punt is verzameld is nog steeds bruikbaar, dus wél wegschrijven.
    if (droog) {
      console.error(`\n(uitleesstand) script gestopt bij: ${e.message.slice(0, 200)}`);
      schrijfDriftDump(true);
      process.exit(0);
    }
    console.error("\n❌ Fout:", e.message);
    process.exit(1);
  });
