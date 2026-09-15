// Schema-driftcontrole (Fase 12 Blok 2).
//
// AANLEIDING: `ensureCollection()` in setup-pocketbase.mjs maakt een collectie
// aan als die ontbreekt, maar corrigeert een bestaande collectie NOOIT. Een
// schemawijziging die wel in de code staat maar nooit naar de draaiende
// database is gemigreerd, is daardoor onzichtbaar. Zo bleef de rasnaam-tikfout
// maandenlang staan en blokkeerde die 17 van de 69 rijen voor vijf soorten
// registratie (zie AUDIT-VELDGEREEDHEID.md §3.1).
//
// WAT DIT SCRIPT DOET: het draait setup-pocketbase.mjs in de uitleesstand
// (DRIFT_DUMP), waarin dat script alle collectiedefinities opschrijft zonder
// iets te wijzigen, en vergelijkt die met de werkelijke database. Bewust géén
// tweede kopie van de definities: die zou zelf gaan driften.
//
// Vergeleken worden: aanwezigheid, veldnamen, types, verplicht-vlaggen,
// keuzelijstwaarden, min/max/patroon, relatiedoelen + cascade, indexen en de
// vijf API-regels.
//
// Gebruik:
//   node scripts/check-schema-drift.mjs <pocketbase-url> <admin-email> <admin-wachtwoord>
//
// Exitcode 0 = geen drift of alleen drift van lage ernst, 1 = drift met ernst
// "hoog" gevonden. Draai dit VOOR elke fase die het schema raakt.

import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const [baseUrl, adminEmail, adminPass] = process.argv.slice(2);
if (!baseUrl || !adminEmail || !adminPass) {
  console.error(
    "Gebruik: node scripts/check-schema-drift.mjs <url> <admin-email> <admin-wachtwoord>",
  );
  process.exit(2);
}
const base = baseUrl.replace(/\/+$/, "");
const hier = path.dirname(fileURLToPath(import.meta.url));
const dumpPad = path.join(os.tmpdir(), `wg-schema-dump-${process.pid}.json`);

// ---------- 1. gewenste staat ophalen uit het setup-script ----------
console.log("Gewenste staat uitlezen uit setup-pocketbase.mjs (uitleesstand)...");
const run = spawnSync(
  process.execPath,
  [path.join(hier, "setup-pocketbase.mjs"), base, adminEmail, adminPass],
  { env: { ...process.env, DRIFT_DUMP: dumpPad }, encoding: "utf8" },
);
if (!existsSync(dumpPad)) {
  console.error("Uitlezen mislukt — geen dump geschreven.");
  console.error((run.stderr || run.stdout || "").slice(-2000));
  process.exit(2);
}
const dump = JSON.parse(readFileSync(dumpPad, "utf8"));
unlinkSync(dumpPad);
if (dump.onvolledig) {
  console.log(
    "  let op: het setup-script is voortijdig gestopt (verwacht in de uitleesstand);\n" +
      "  de collectiedefinities die daarvóór langskwamen zijn wel meegenomen.",
  );
}
console.log(`  ${dump.collecties.length} collectiedefinities, ${dump.velden.length} veldsets\n`);

// ---------- 2. live staat ophalen ----------
let token = "";
async function api(p, opties = {}) {
  const res = await fetch(base + p, {
    ...opties,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(opties.body ? { "Content-Type": "application/json" } : {}),
      ...(opties.headers || {}),
    },
  });
  const tekst = await res.text();
  if (!res.ok) throw new Error(`${p} -> ${res.status}: ${tekst.slice(0, 200)}`);
  return tekst ? JSON.parse(tekst) : null;
}

const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: JSON.stringify({ identity: adminEmail, password: adminPass }),
});
token = auth.token;

const live = await api("/api/collections?perPage=200");
const liveOp = new Map((live.items ?? []).map((c) => [c.name, c]));

// ---------- 3. vergelijken ----------
const bevindingen = [];
function meld(ernst, collectie, wat, gewenst, werkelijk, toelichting = "") {
  bevindingen.push({ ernst, collectie, wat, gewenst, werkelijk, toelichting });
}

// Velden die PocketBase zelf beheert of die per installatie mogen verschillen.
const NEGEER_VELDSLEUTELS = new Set(["id", "system", "presentable", "hidden", "help"]);

function normaliseerVeld(f) {
  const uit = {};
  for (const [k, v] of Object.entries(f)) {
    if (NEGEER_VELDSLEUTELS.has(k)) continue;
    if (v === "" || v === null || v === undefined || v === false || v === 0) continue;
    uit[k] = v;
  }
  return uit;
}

// Welke veldeigenschappen wegen zwaar? Een afwijking hierin kan schrijfacties
// weigeren of stil data afkappen — dat is het kaliber van de rasnaam-bug.
const ZWAAR = new Set([
  "type",
  "required",
  "values",
  "maxSelect",
  "collectionId",
  "pattern",
  "max",
]);

for (const def of dump.collecties) {
  const echt = liveOp.get(def.name);
  if (!echt) {
    meld("hoog", def.name, "collectie ontbreekt", "aanwezig", "ontbreekt");
    continue;
  }

  // --- API-regels ---
  for (const regel of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
    if (!(regel in def)) continue;
    const g = def[regel] === undefined ? null : def[regel];
    const w = echt[regel] === undefined ? null : echt[regel];
    if (JSON.stringify(g) !== JSON.stringify(w)) {
      // null = alleen via hooks; dat losser maken is een beveiligingsgat
      const ernst = g === null && w !== null ? "hoog" : "midden";
      meld(ernst, def.name, `API-regel ${regel}`, g, w);
    }
  }

  // --- velden ---
  const echtVelden = new Map((echt.fields ?? []).map((f) => [f.name, f]));
  for (const gewenstVeld of def.fields ?? []) {
    const echtVeld = echtVelden.get(gewenstVeld.name);
    if (!echtVeld) {
      meld("hoog", def.name, `veld "${gewenstVeld.name}" ontbreekt`, gewenstVeld.type, "ontbreekt");
      continue;
    }
    const g = normaliseerVeld(gewenstVeld);
    const w = normaliseerVeld(echtVeld);
    for (const sleutel of new Set([...Object.keys(g), ...Object.keys(w)])) {
      if (sleutel === "name") continue;
      const gw = JSON.stringify(g[sleutel]);
      const ww = JSON.stringify(w[sleutel]);
      if (gw === ww) continue;
      meld(
        ZWAAR.has(sleutel) ? "hoog" : "laag",
        def.name,
        `veld "${gewenstVeld.name}".${sleutel}`,
        g[sleutel],
        w[sleutel],
      );
    }
  }
  // velden die live wél bestaan maar niet in de definitie: meestal later
  // toegevoegd via ensureVelden; die worden hieronder apart gecontroleerd.

  // --- indexen ---
  const gewensteIdx = (def.indexes ?? []).map((i) => i.replace(/\s+/g, " ").trim());
  const echteIdx = (echt.indexes ?? []).map((i) => i.replace(/\s+/g, " ").trim());
  for (const idx of gewensteIdx) {
    if (!echteIdx.some((e) => e.toLowerCase() === idx.toLowerCase())) {
      meld("midden", def.name, "index ontbreekt", idx, "ontbreekt");
    }
  }
}

// --- velden uit ensureVelden() ---
for (const set of dump.velden) {
  const echt = liveOp.get(set.collectie);
  if (!echt) {
    meld("hoog", set.collectie, "collectie ontbreekt (voor ensureVelden)", "aanwezig", "ontbreekt");
    continue;
  }
  const echtVelden = new Map((echt.fields ?? []).map((f) => [f.name, f]));
  for (const v of set.velden) {
    const e = echtVelden.get(v.name);
    if (!e) {
      meld("hoog", set.collectie, `veld "${v.name}" ontbreekt`, v.type, "ontbreekt");
      continue;
    }
    if (e.type !== v.type) {
      meld("hoog", set.collectie, `veld "${v.name}".type`, v.type, e.type);
    }
    if (v.values && JSON.stringify(v.values) !== JSON.stringify(e.values)) {
      meld("hoog", set.collectie, `veld "${v.name}".values`, v.values, e.values);
    }
  }
}

// ---------- 4. rapport ----------
const volgorde = { hoog: 0, midden: 1, laag: 2 };
bevindingen.sort(
  (a, b) => volgorde[a.ernst] - volgorde[b.ernst] || a.collectie.localeCompare(b.collectie),
);

const tel = { hoog: 0, midden: 0, laag: 0 };
for (const b of bevindingen) tel[b.ernst]++;

console.log("=".repeat(72));
console.log(`SCHEMA-DRIFT: ${bevindingen.length} verschil(len)`);
console.log(`  hoog: ${tel.hoog}   midden: ${tel.midden}   laag: ${tel.laag}`);
console.log("=".repeat(72));

let vorigeCollectie = "";
for (const b of bevindingen) {
  if (b.collectie !== vorigeCollectie) {
    console.log(`\n[${b.collectie}]`);
    vorigeCollectie = b.collectie;
  }
  const kort = (v) => {
    const s = JSON.stringify(v);
    return s === undefined ? "(niet gezet)" : s.length > 110 ? s.slice(0, 110) + "…" : s;
  };
  console.log(`  ${b.ernst.toUpperCase().padEnd(6)} ${b.wat}`);
  console.log(`         code : ${kort(b.gewenst)}`);
  console.log(`         live : ${kort(b.werkelijk)}`);
  if (b.toelichting) console.log(`         ${b.toelichting}`);
}

if (bevindingen.length === 0) {
  console.log("\nGeen drift gevonden: de draaiende database komt overeen met het setup-script.");
}
console.log("");
// exitCode i.p.v. process.exit(): dat laatste breekt op Windows af terwijl er
// nog fetch-handles openstaan (libuv-assertie in async.c).
process.exitCode = tel.hoog > 0 ? 1 : 0;
