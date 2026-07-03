// Testdata voor Fase 3 (AI-agent): 2 partijen, 3 gevulde tanks, 10 metingen,
// 5 observaties — genoeg om de testchecklist en bereken-inzichten.mjs zinvol
// te kunnen draaien. Schrijft welke record-id's zijn aangemaakt naar
// scripts/.seed-testdata-agent.json (gitignored) zodat --cleanup precies weet
// wat weer weg moet, zonder op naam te hoeven zoeken.
//
// Gebruik:
//   node scripts/seed-testdata-agent.mjs <email> <wachtwoord> [pocketbase-url]
//   node scripts/seed-testdata-agent.mjs <email> <wachtwoord> [pocketbase-url] --cleanup
//
// (url is optioneel als VITE_POCKETBASE_URL in .env staat)
//
// Boekingen lopen bewust via de bestaande atomische endpoints
// (/api/tappenmars/partij-aanmaken, /tankboek-boeking) — nooit rechtstreeks
// naar de tanks-collectie, anders raakt de tankcache los van het tankboek
// (zie ARCHITECTURE.md §7.6 en CLAUDE.md).

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_BESTAND = join(__dirname, ".seed-testdata-agent.json");

function leesEnvVar(naam) {
  try {
    const inhoud = readFileSync(join(__dirname, "..", ".env"), "utf8");
    for (const regel of inhoud.split("\n")) {
      const m = regel.match(new RegExp(`^${naam}=(.*)$`));
      if (m) return m[1].trim();
    }
  } catch {
    /* geen .env aanwezig */
  }
  return undefined;
}

const args = process.argv.slice(2);
const cleanup = args.includes("--cleanup");
const [email, wachtwoord, urlArg] = args.filter((a) => !a.startsWith("--"));
const base = (urlArg || leesEnvVar("VITE_POCKETBASE_URL") || "").replace(/\/+$/, "");
if (!email || !wachtwoord || !base) {
  console.error(
    "Gebruik: node scripts/seed-testdata-agent.mjs <email> <wachtwoord> [pocketbase-url] [--cleanup]",
  );
  process.exit(1);
}

let token = "";
async function api(path, opts = {}) {
  const res = await fetch(base + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(
      `${opts.method || "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`,
    );
    err.status = res.status;
    throw err;
  }
  return json;
}

async function inloggen() {
  const su = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: { identity: email, password: wachtwoord },
  }).catch(() => null);
  if (su) return su.token;
  const gewoon = await api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: email, password: wachtwoord },
  });
  return gewoon.token;
}

function vandaagMinus(dagen) {
  const d = new Date();
  d.setDate(d.getDate() - dagen);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  token = await inloggen();
  console.log(`Ingelogd op ${base}`);

  const producenten = await api("/api/collections/producenten/records?perPage=1");
  const producent = producenten.items[0];
  if (!producent) throw new Error("Geen producent gevonden — draai eerst setup-pocketbase.mjs.");

  const tanks = await api(
    `/api/collections/tanks/records?perPage=3&sort=code&filter=${encodeURIComponent('status="leeg"')}`,
  );
  if (tanks.items.length < 3)
    throw new Error("Niet genoeg lege tanks beschikbaar voor de testdata.");
  const [tank1, tank2, tank3] = tanks.items;

  const rijen = await api("/api/collections/rijen/records?perPage=6&sort=rijnummer");
  if (rijen.items.length < 6) throw new Error("Niet genoeg rijen gevonden.");
  const [rijA, rijB, rijC, rijD, rijE, rijUitval] = rijen.items;

  const jaargang = new Date().getFullYear();
  const staat = { partijen: [], tankboek: [], analyses: [], metingen: [], observaties: [] };

  // ---------- 2 partijen (elk met eerste vulling = 1e en 2e gevulde tank) ----------
  const partijGisting = await api("/api/tappenmars/partij-aanmaken", {
    method: "POST",
    body: {
      naam: "2026-PIN-01-TEST",
      jaargang,
      type: "rood",
      status: "gisting",
      lotnummer: "PINTEST01",
      producent: producent.id,
      start_tank: tank1.id,
      start_volume_l: 300,
      verantwoordelijke: "Testscript",
      pers_datum: vandaagMinus(4),
    },
  });
  staat.partijen.push(partijGisting.id);
  staat.tankboek.push({ tankboekActie: "vullen (via partij-aanmaken)", partij: partijGisting.id });

  const partijOpvoeding = await api("/api/tappenmars/partij-aanmaken", {
    method: "POST",
    body: {
      naam: "2026-MUS-01-TEST",
      jaargang,
      type: "wit",
      status: "opvoeding",
      lotnummer: "MUSTEST01",
      producent: producent.id,
      start_tank: tank2.id,
      start_volume_l: 200,
      verantwoordelijke: "Testscript",
      pers_datum: vandaagMinus(20),
    },
  });
  staat.partijen.push(partijOpvoeding.id);

  // ---------- 3e tank vullen: overhevelen van tank1 naar tank3 (partij blijft gelijk) ----------
  const overheveling = await api("/api/tappenmars/tankboek-boeking", {
    method: "POST",
    body: {
      datum: vandaagMinus(2),
      partij: partijGisting.id,
      producent: producent.id,
      actie: "overhevelen",
      van_tank: tank1.id,
      naar_tank: tank3.id,
      volume_l: 100,
      verantwoordelijke: "Testscript",
      notitie: "Testdata Fase 3 — verdeling over 3 tanks",
    },
  });
  staat.tankboek.push({ regelId: overheveling.regelId, actie: "overhevelen" });

  // ---------- 2 analyses op de gistende partij: stagnerende daling (0,8°Oe in 4 dagen) ----------
  const analyse1 = await api("/api/collections/analyses/records", {
    method: "POST",
    body: {
      datum: vandaagMinus(4),
      partij: partijGisting.id,
      tank: tank1.id,
      dichtheid_oechsle: 75.0,
      dichtheid_brix: 17.8,
      dichtheid_sg: 1.075,
      methode: "eigen_meting",
      ingevoerd_door: "Testscript",
      notitie: "Testdata Fase 3",
    },
  });
  staat.analyses.push(analyse1.id);
  const analyse2 = await api("/api/collections/analyses/records", {
    method: "POST",
    body: {
      datum: vandaagMinus(0),
      partij: partijGisting.id,
      tank: tank1.id,
      dichtheid_oechsle: 74.2,
      dichtheid_brix: 17.6,
      dichtheid_sg: 1.0742,
      methode: "eigen_meting",
      ingevoerd_door: "Testscript",
      notitie: "Testdata Fase 3 — stagnatie-voorbeeld",
    },
  });
  staat.analyses.push(analyse2.id);

  // ---------- 10 metingen, verspreid over 5 rijen (2 per rij) ----------
  const metingRijen = [rijA, rijB, rijC, rijD, rijE];
  let brix = 16.5;
  for (let i = 0; i < 10; i++) {
    const rij = metingRijen[i % metingRijen.length];
    brix += i % 2 === 0 ? 0.3 : -0.1;
    const m = await api("/api/collections/metingen/records", {
      method: "POST",
      body: {
        rij: rij.id,
        datum: vandaagMinus(9 - i),
        seizoen: jaargang,
        brix: Math.round(brix * 10) / 10,
        ph: 3.2,
        zuurgraad: 8.5,
        rijpheid_score: 3,
        ingevoerd_door: "Testscript",
        notitie: "Testdata Fase 3",
      },
    });
    staat.metingen.push(m.id);
  }

  // ---------- 5 observaties: 3x uitval op dezelfde rij (cluster) + 2 losse ----------
  for (let i = 0; i < 3; i++) {
    const o = await api("/api/collections/observaties/records", {
      method: "POST",
      body: {
        rij: rijUitval.id,
        datum: vandaagMinus(i),
        seizoen: jaargang,
        type: "uitval",
        notitie: `Uitval: ${2 + i} planten. Reden: testdata Fase 3.`,
        ingevoerd_door: "Testscript",
      },
    });
    staat.observaties.push(o.id);
  }
  const oZiekte = await api("/api/collections/observaties/records", {
    method: "POST",
    body: {
      rij: rijA.id,
      datum: vandaagMinus(1),
      seizoen: jaargang,
      type: "ziekte",
      notitie: "Bladvlekken, mogelijk schimmel — testdata Fase 3.",
      ingevoerd_door: "Testscript",
    },
  });
  staat.observaties.push(oZiekte.id);
  const oGezond = await api("/api/collections/observaties/records", {
    method: "POST",
    body: {
      rij: rijB.id,
      datum: vandaagMinus(1),
      seizoen: jaargang,
      type: "gezond",
      notitie: "Geen bijzonderheden — testdata Fase 3.",
      ingevoerd_door: "Testscript",
    },
  });
  staat.observaties.push(oGezond.id);

  staat.rijUitvalNummer = rijUitval.rijnummer;
  writeFileSync(STATE_BESTAND, JSON.stringify(staat, null, 2));
  console.log(
    `Testdata aangemaakt: ${staat.partijen.length} partijen, 3 gevulde tanks, ` +
      `${staat.metingen.length} metingen, ${staat.observaties.length} observaties.`,
  );
  console.log(`Details opgeslagen in ${STATE_BESTAND} (nodig voor --cleanup).`);
}

async function cleanupTestdata() {
  if (!existsSync(STATE_BESTAND)) {
    console.log("Geen testdata-bestand gevonden — niets op te ruimen.");
    return;
  }
  token = await inloggen();
  const staat = JSON.parse(readFileSync(STATE_BESTAND, "utf8"));

  async function verwijderAlles(collectie, ids) {
    for (const id of ids) {
      try {
        await api(`/api/collections/${collectie}/records/${id}`, { method: "DELETE" });
      } catch (e) {
        console.warn(`  ! kon ${collectie}/${id} niet verwijderen: ${e.message}`);
      }
    }
  }

  await verwijderAlles("observaties", staat.observaties || []);
  await verwijderAlles("metingen", staat.metingen || []);
  await verwijderAlles("analyses", staat.analyses || []);

  // tankboek staat dicht voor create/update/delete op API-rule-niveau, maar
  // een superuser-token omzeilt API-rules van nature (PocketBase-gedrag) —
  // dat is hier bewust gebruikt om testdata volledig te kunnen opruimen.
  // Filter op ALLE testpartijen (elke partij heeft z'n eigen "vullen"-regel
  // vanuit partij-aanmaken) — anders blijft een tankboekregel de tweede
  // partij vasthouden en weigert PocketBase die te verwijderen (required
  // relatie), zoals hier tijdens het testen ook echt gebeurde.
  if (staat.partijen?.length) {
    const filter = staat.partijen.map((id) => `partij = "${id}"`).join(" || ");
    const alleRegels = await api(
      `/api/collections/tankboek/records?perPage=200&filter=${encodeURIComponent(filter)}`,
    );
    await verwijderAlles(
      "tankboek",
      alleRegels.items.map((r) => r.id),
    );
  }
  await verwijderAlles("partijen", staat.partijen || []);

  // tankcaches liepen los van het tankboek doordat we net regels weggehaald
  // hebben buiten het normale boekingsendpoint om — herberekenen als vangnet.
  await api("/api/tappenmars/tanks-herbereken", { method: "POST", body: {} });

  // eventuele inzichten die naar de (nu verwijderde) testpartijen/testrij
  // verwijzen, ruimen we ook op zodat er geen misleidende historie achterblijft.
  // Let op: onderwerp bevat de leesbare vorm ("Rij 6"), niet het record-id.
  const inzichten = await api("/api/collections/inzichten/records?perPage=200");
  const testInzichten = inzichten.items.filter(
    (i) =>
      String(i.onderwerp).includes("TEST") ||
      (staat.rijUitvalNummer != null && i.onderwerp === `Rij ${staat.rijUitvalNummer}`),
  );
  await verwijderAlles(
    "inzichten",
    testInzichten.map((i) => i.id),
  );

  unlinkSync(STATE_BESTAND);
  console.log("Testdata opgeruimd (inclusief tankboekregels, tankcaches herberekend).");
}

(cleanup ? cleanupTestdata() : seed()).catch((e) => {
  console.error("FOUT:", e.message);
  process.exit(1);
});
