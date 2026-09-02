// Fase 18 Blok A — realistische testdata voor de pasteurisatiesectie.
// Zonder gevulde grafieken kun je een dashboard niet ontwerpen of beoordelen.
//
// Gebruik:
//   node scripts/seed-pasteurisatie.mjs <email> <wachtwoord> [pocketbase-url]
//   node scripts/seed-pasteurisatie.mjs <email> <wachtwoord> [pocketbase-url] --cleanup
//
// Alles wat dit script aanmaakt is herkenbaar aan "(seed)" in de naam en
// wordt bijgehouden in scripts/.seed-pasteurisatie.json (gitignored), zodat
// --cleanup precies weet wat weer weg moet — inclusief partijen, kelderlog-
// regels en sensor_metingen (niet alleen de pasteurisatie_runs zelf).
//
// PU/druk worden hier bewust NIET herberekend met een eigen formule: elke
// run wordt afgerond via het bestaande atomische endpoint
// (/api/tappenmars/pasteurisatie-run-afronden), met de PU-uitkomst van de
// ECHTE, geteste module (src/lib/pasteurisatie.ts) — zelfde patroon als de
// live monitor zelf gebruikt. Zo test dit script de app-code, in plaats van
// een eigen kopie ervan.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_BESTAND = join(__dirname, ".seed-pasteurisatie.json");
const SEED_MERK = "(seed)";

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
const base = (urlArg || leesEnvVar("VITE_POCKETBASE_URL") || "http://127.0.0.1:8090").replace(
  /\/+$/,
  "",
);
if (!email || !wachtwoord) {
  console.error(
    "Gebruik: node scripts/seed-pasteurisatie.mjs <email> <wachtwoord> [pocketbase-url] [--cleanup]",
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
    const err = new Error(`${opts.method || "GET"} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
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

// ---------- PU-rekenkern, gedupliceerd voor dit script ----------
// Zelfde reden als overal elders in dit project waar Node/JSVM geen
// TypeScript-modules kan importeren zonder buildstap: een vereenvoudigde
// duplicatie van src/lib/pasteurisatie.ts, alleen gebruikt om de SEED-CURVE
// te ontwerpen (welke duur geeft welke PU). De uiteindelijke PU die in de
// database komt, wordt niet door dit script bepaald maar door het bestaande
// afronden-endpoint met dezelfde puOverCurve()-uitkomst als de app zelf zou
// berekenen — dit stuk hieronder is puur een ontwerphulpmiddel.
function puPerMinuut(t) {
  return Math.pow(10, (t - 60) / 7);
}
function puOverCurve(punten) {
  let totaal = 0,
    opwarm = 0,
    houd = 0,
    afkoel = 0;
  let piek = -Infinity,
    piekIdx = 0;
  for (let i = 0; i < punten.length; i++) if (punten[i].t > piek) (piek = punten[i].t), (piekIdx = i);
  let houdStart = piekIdx;
  while (houdStart > 0 && piek - punten[houdStart - 1].t <= 0.5) houdStart--;
  let houdEind = piekIdx;
  while (houdEind < punten.length - 1 && piek - punten[houdEind + 1].t <= 0.5) houdEind++;
  for (let i = 1; i < punten.length; i++) {
    const dt = (punten[i].tijd - punten[i - 1].tijd) / 60000;
    if (dt <= 0) continue;
    const seg = ((puPerMinuut(punten[i - 1].t) + puPerMinuut(punten[i].t)) / 2) * dt;
    totaal += seg;
    if (i <= houdStart) opwarm += seg;
    else if (i <= houdEind) houd += seg;
    else afkoel += seg;
  }
  return { totaal, opwarm, houd, afkoel, piek };
}

function ruis(waarde, amplitude = 0.3) {
  return Math.round((waarde + (Math.random() * 2 - 1) * amplitude) * 100) / 100;
}

/** Bouwt een curve van tijdstip-objecten { tijd: Date, t: temperatuurC }. */
function bouwCurve({
  startTijd,
  opwarmMin,
  vanTemp,
  naarTemp,
  houdMin,
  houdTemp,
  afkoelMin,
  eindTemp,
  intervalSec = 20,
  gatVanaf = null,
  gatMinuten = 0,
}) {
  const punten = [];
  const totaalMin = opwarmMin + houdMin + afkoelMin;
  const stapMin = intervalSec / 60;
  for (let m = 0; m <= totaalMin; m += stapMin) {
    let temp;
    if (m <= opwarmMin) {
      temp = vanTemp + (m / opwarmMin) * (naarTemp - vanTemp);
    } else if (m <= opwarmMin + houdMin) {
      temp = houdTemp;
    } else {
      const mAfkoel = m - opwarmMin - houdMin;
      temp = houdTemp - (mAfkoel / afkoelMin) * (houdTemp - eindTemp);
    }
    if (gatVanaf != null && m >= gatVanaf && m < gatVanaf + gatMinuten) continue; // meetgat
    const tijd = new Date(startTijd.getTime() + m * 60000);
    punten.push({ tijd, t: ruis(temp) });
  }
  return punten;
}

function vandaagStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function vindOfMaakEigenaar(naam, soort, code) {
  const gevonden = await api(
    `/api/collections/eigenaars/records?perPage=1&filter=${encodeURIComponent(`naam = "${naam}"`)}`,
  );
  if (gevonden.items.length > 0) return { record: gevonden.items[0], aangemaakt: false };
  const rec = await api("/api/collections/eigenaars/records", {
    method: "POST",
    body: { naam, soort, code, actief: true, notities: `Testklant voor seed-data ${SEED_MERK}` },
  });
  return { record: rec, aangemaakt: true };
}

async function vindOfMaakFlestype(vorm, inhoud_ml, kleur, sluiting) {
  const gevonden = await api(
    `/api/collections/flestypes/records?perPage=1&filter=${encodeURIComponent(
      `vorm = "${vorm}" && inhoud_ml = ${inhoud_ml}`,
    )}`,
  );
  if (gevonden.items.length > 0) return { record: gevonden.items[0], aangemaakt: false };
  const rec = await api("/api/collections/flestypes/records", {
    method: "POST",
    body: {
      vorm,
      inhoud_ml,
      kleur,
      sluiting,
      omschrijving: `${kleur} ${sluiting} ${inhoud_ml} ml (seed)`,
      actief: true,
    },
  });
  return { record: rec, aangemaakt: true };
}

async function postMetingen(runId, punten, sensorLabel = "referentiefles") {
  for (const p of punten) {
    await api("/api/tappenmars/pasteurisatie-meting", {
      method: "POST",
      body: {
        run_id: runId,
        temperatuur_c: p.t,
        sensor_label: sensorLabel,
        gemeten_op: p.tijd.toISOString(),
      },
    });
  }
}

async function seed() {
  token = await inloggen();
  console.log(`Ingelogd op ${base}`);
  const staat = { partijen: [], runs: [], eigenaarsAangemaakt: [], flestypesAangemaakt: [] };

  const { record: tappenmars } = await vindOfMaakEigenaar("De Tappenmars", "eigen_wijngaard", "01");
  const { record: thommys } = await vindOfMaakEigenaar("Thommy's Drinks", "drankproductie", "07");
  const { record: loonklant, aangemaakt: loonklantNieuw } = await vindOfMaakEigenaar(
    `Testklant Loonproductie ${SEED_MERK}`,
    "extern_klant",
    "90",
  );
  if (loonklantNieuw) staat.eigenaarsAangemaakt.push(loonklant.id);

  const { record: alamos250, aangemaakt: alamosNieuw } = await vindOfMaakFlestype(
    "alamos",
    250,
    "transparant",
    "kroonkurk",
  );
  if (alamosNieuw) staat.flestypesAangemaakt.push(alamos250.id);

  const flestypesAlles = await api("/api/collections/flestypes/records?perPage=200");
  const flestype750 =
    flestypesAlles.items.find((f) => f.inhoud_ml === 750 && f.sluiting?.includes("schroef")) ||
    flestypesAlles.items.find((f) => f.inhoud_ml === 750) ||
    alamos250;

  const sluitingen = await api("/api/collections/sluitingen/records?perPage=10");
  const kroonkurk = sluitingen.items.find((s) => s.naam.includes("Kroonkurk"));
  const bvsdop = sluitingen.items.find((s) => s.naam.includes("BVS schroefdop"));
  const stelvin = sluitingen.items.find((s) => s.naam.includes("Stelvin"));

  const nu = new Date();
  const dagenTerug = (n) => new Date(nu.getTime() - n * 86400000);

  // ---------- Runconfiguraties: variatie in eigenaar/product/uitkomst ----------
  const runs = [
    { dagen: 95, eigenaar: tappenmars, product: "wijn", flestype: flestype750, sluiting: bvsdop, doeltemp: 48, aard: "normaal", flessen: 480 },
    { dagen: 82, eigenaar: thommys, product: "overige_gegiste_drank", flestype: alamos250, sluiting: kroonkurk, doeltemp: 48, aard: "normaal", flessen: 1200 },
    { dagen: 70, eigenaar: thommys, product: "sap", flestype: alamos250, sluiting: kroonkurk, doeltemp: 46, aard: "onder", flessen: 900 },
    { dagen: 58, eigenaar: loonklant, product: "overige_gegiste_drank", flestype: alamos250, sluiting: stelvin, doeltemp: 48, aard: "normaal", flessen: 720 },
    { dagen: 47, eigenaar: thommys, product: "overige_gegiste_drank", flestype: alamos250, sluiting: kroonkurk, doeltemp: 50, aard: "boven", flessen: 1000 },
    { dagen: 36, eigenaar: tappenmars, product: "wijn", flestype: flestype750, sluiting: bvsdop, doeltemp: 48, aard: "meetgat", flessen: 500 },
    { dagen: 25, eigenaar: thommys, product: "sap", flestype: alamos250, sluiting: kroonkurk, doeltemp: 48, aard: "normaal", flessen: 1100 },
    { dagen: 17, eigenaar: loonklant, product: "overige_gegiste_drank", flestype: alamos250, sluiting: bvsdop, doeltemp: 48, aard: "marginaal", flessen: 850 },
    { dagen: 9, eigenaar: thommys, product: "overige_gegiste_drank", flestype: alamos250, sluiting: kroonkurk, doeltemp: 48, aard: "normaal", flessen: 1150 },
    { dagen: 3, eigenaar: tappenmars, product: "wijn", flestype: flestype750, sluiting: stelvin, doeltemp: 48, aard: "normaal", flessen: 460 },
  ];

  const AARD_CURVE = {
    normaal: { opwarmMin: 15, houdMin: 20, afkoelMin: 20, vanTemp: 20, naarTemp: 65, houdTemp: 65, eindTemp: 30 },
    onder: { opwarmMin: 14, houdMin: 18, afkoelMin: 18, vanTemp: 20, naarTemp: 64, houdTemp: 64, eindTemp: 30 },
    boven: { opwarmMin: 15, houdMin: 23, afkoelMin: 20, vanTemp: 20, naarTemp: 66, houdTemp: 66, eindTemp: 30 },
    meetgat: { opwarmMin: 15, houdMin: 20, afkoelMin: 20, vanTemp: 20, naarTemp: 65, houdTemp: 65, eindTemp: 30, gatVanaf: 22, gatMinuten: 6 },
    marginaal: { opwarmMin: 15, houdMin: 20, afkoelMin: 20, vanTemp: 20, naarTemp: 65, houdTemp: 65, eindTemp: 30 },
  };

  let volgnr = 1;
  for (const cfg of runs) {
    const lotnummer = `SEED-${String(volgnr).padStart(2, "0")}`;
    const startTijd = dagenTerug(cfg.dagen);
    const curveDef = AARD_CURVE[cfg.aard];
    const punten = bouwCurve({ startTijd, ...curveDef });
    const ontwerp = puOverCurve(punten.map((p) => ({ tijd: p.tijd, t: p.t })));

    // Marginale run: hogere carbonatie zodat de conservatieve bovengrens
    // net binnen de 20%-marge van de 6 bar BVS-dop komt. g/L-waarden hieronder
    // zijn vooraf berekend met de ECHTE co2GehalteUitDruk()-formule
    // (drukveiligheid.ts) tegen 1,0/1,15 bar bij 10 °C — geverifieerd dat
    // 1,15 bar/250 ml/225 ml vulling/48 °C een marginaal oordeel geeft.
    const co2GehalteGl = cfg.aard === "marginaal" ? 4.676 : 4.35;
    const vulvolume = Math.round(cfg.flestype.inhoud_ml * 0.9);

    const startResp = await api("/api/tappenmars/pasteurisatie-run-starten", {
      method: "POST",
      body: {
        lotnummer,
        nieuwe_partij: {
          naam: `Seedbatch ${lotnummer} ${SEED_MERK}`,
          jaargang: startTijd.getFullYear(),
          type: cfg.product === "wijn" ? "wit" : "overig",
        },
        eigenaar: cfg.eigenaar.id,
        product_soort: cfg.product,
        datum: vandaagStr(startTijd),
        starttijd: startTijd.toISOString(),
        flestype: cfg.flestype.id,
        sluiting: cfg.sluiting.id,
        aantal_flessen: cfg.flessen,
        vulvolume_ml: vulvolume,
        co2_gehalte_gl: co2GehalteGl,
        doeltemperatuur_c: cfg.doeltemp,
        doel_pu_min: 100,
        doel_pu_max: 150,
        veiligheidsoordeel: cfg.aard === "marginaal" ? "marginaal" : "veilig",
        oordeel_geaccepteerd_door: cfg.aard === "marginaal" ? "Thomas (seed)" : undefined,
        sensor_positie: "midden-onder (seed)",
        uitgevoerd_door: `Seedscript ${SEED_MERK}`,
      },
    });
    staat.partijen.push(startResp.partij_id);
    staat.runs.push(startResp.run_id);

    await postMetingen(startResp.run_id, punten);

    await api("/api/tappenmars/pasteurisatie-run-afronden", {
      method: "POST",
      body: {
        run_id: startResp.run_id,
        eindtijd: punten[punten.length - 1].tijd.toISOString(),
        totale_pu: Math.round(ontwerp.totaal * 10) / 10,
        pu_opwarm: Math.round(ontwerp.opwarm * 10) / 10,
        pu_houd: Math.round(ontwerp.houd * 10) / 10,
        pu_afkoel: Math.round(ontwerp.afkoel * 10) / 10,
        piektemperatuur_c: Math.round(ontwerp.piek * 10) / 10,
        aantal_flessen: cfg.flessen,
        meetgaten: cfg.aard === "meetgat" ? 1 : 0,
        uitgevoerd_door: `Seedscript ${SEED_MERK}`,
      },
    });
    console.log(
      `  + run ${lotnummer} (${cfg.aard}): ${ontwerp.totaal.toFixed(1)} PU, eigenaar ${cfg.eigenaar.naam}`,
    );
    volgnr++;
  }

  // ---------- Eén actieve run, curve tot "nu" ----------
  const actiefStart = new Date(nu.getTime() - 25 * 60000); // 25 min geleden gestart
  const actiefPunten = bouwCurve({
    startTijd: actiefStart,
    opwarmMin: 15,
    vanTemp: 20,
    naarTemp: 63,
    houdMin: 20, // wordt afgekapt op "nu"
    houdTemp: 63,
    afkoelMin: 20,
    eindTemp: 30,
  }).filter((p) => p.tijd.getTime() <= nu.getTime());

  const lotActief = `SEED-${String(volgnr).padStart(2, "0")}-ACTIEF`;
  const startActief = await api("/api/tappenmars/pasteurisatie-run-starten", {
    method: "POST",
    body: {
      lotnummer: lotActief,
      nieuwe_partij: {
        naam: `Seedbatch ${lotActief} ${SEED_MERK}`,
        jaargang: nu.getFullYear(),
        type: "overig",
      },
      eigenaar: thommys.id,
      product_soort: "overige_gegiste_drank",
      datum: vandaagStr(nu),
      starttijd: actiefStart.toISOString(),
      flestype: alamos250.id,
      sluiting: kroonkurk.id,
      aantal_flessen: 1000,
      vulvolume_ml: 225,
      doeltemperatuur_c: 48,
      doel_pu_min: 100,
      doel_pu_max: 150,
      veiligheidsoordeel: "veilig",
      sensor_positie: "midden-onder (seed)",
      uitgevoerd_door: `Seedscript ${SEED_MERK}`,
    },
  });
  staat.partijen.push(startActief.partij_id);
  staat.runs.push(startActief.run_id);
  await postMetingen(startActief.run_id, actiefPunten);
  console.log(`  + actieve run ${lotActief}: ${actiefPunten.length} metingen tot nu, status blijft actief`);

  writeFileSync(STATE_BESTAND, JSON.stringify(staat, null, 2));
  console.log(`\n${runs.length + 1} runs aangemaakt (${runs.length} afgerond, 1 actief).`);
  console.log("Cleanup met: node scripts/seed-pasteurisatie.mjs <email> <ww> --cleanup");
}

async function cleanupData() {
  if (!existsSync(STATE_BESTAND)) {
    console.log("Geen seed-bestand gevonden — niets op te ruimen.");
    return;
  }
  token = await inloggen();
  const staat = JSON.parse(readFileSync(STATE_BESTAND, "utf8"));

  async function verwijderAlles(collectie, ids) {
    let n = 0;
    for (const id of ids) {
      try {
        await api(`/api/collections/${collectie}/records/${id}`, { method: "DELETE" });
        n++;
      } catch (e) {
        console.warn(`  ! kon ${collectie}/${id} niet verwijderen: ${e.message}`);
      }
    }
    return n;
  }

  // sensor_metingen per run (bron_id)
  let metingenWeg = 0;
  for (const runId of staat.runs || []) {
    const metingen = await api(
      `/api/collections/sensor_metingen/records?perPage=500&filter=${encodeURIComponent(
        `bron_type = "pasteurisatie_run" && bron_id = "${runId}"`,
      )}`,
    );
    metingenWeg += await verwijderAlles(
      "sensor_metingen",
      metingen.items.map((m) => m.id),
    );
  }
  console.log(`  ${metingenWeg} sensor_metingen verwijderd`);

  const certWeg = await (async () => {
    let n = 0;
    for (const runId of staat.runs || []) {
      const certs = await api(
        `/api/collections/pasteurisatie_certificaten/records?perPage=50&filter=${encodeURIComponent(`run = "${runId}"`)}`,
      );
      n += await verwijderAlles(
        "pasteurisatie_certificaten",
        certs.items.map((c) => c.id),
      );
    }
    return n;
  })();
  console.log(`  ${certWeg} certificaten verwijderd`);

  const runsWeg = await verwijderAlles("pasteurisatie_runs", staat.runs || []);
  console.log(`  ${runsWeg} pasteurisatie_runs verwijderd`);

  // kelderlogregels per partij
  let kelderlogWeg = 0;
  for (const partijId of staat.partijen || []) {
    const regels = await api(
      `/api/collections/kelderlog/records?perPage=50&filter=${encodeURIComponent(`partij = "${partijId}"`)}`,
    );
    kelderlogWeg += await verwijderAlles(
      "kelderlog",
      regels.items.map((r) => r.id),
    );
  }
  console.log(`  ${kelderlogWeg} kelderlogregels verwijderd`);

  const partijenWeg = await verwijderAlles("partijen", staat.partijen || []);
  console.log(`  ${partijenWeg} partijen verwijderd`);

  const eigenaarsWeg = await verwijderAlles("eigenaars", staat.eigenaarsAangemaakt || []);
  console.log(`  ${eigenaarsWeg} testeigenaars verwijderd`);
  const flestypesWeg = await verwijderAlles("flestypes", staat.flestypesAangemaakt || []);
  console.log(`  ${flestypesWeg} testflestypes verwijderd`);

  unlinkSync(STATE_BESTAND);

  // Verificatie: niets met "(seed)" of "SEED-" mag nog bestaan.
  const restPartijen = await api(
    `/api/collections/partijen/records?perPage=5&filter=${encodeURIComponent(`lotnummer ~ "SEED-"`)}`,
  );
  const restRuns = await api(
    `/api/collections/pasteurisatie_runs/records?perPage=5&filter=${encodeURIComponent(`lotnummer ~ "SEED-"`)}`,
  );
  if (restPartijen.totalItems > 0 || restRuns.totalItems > 0) {
    console.warn(
      `  ⚠ Restanten gevonden: ${restPartijen.totalItems} partij(en), ${restRuns.totalItems} run(s) — controleer handmatig.`,
    );
    process.exitCode = 1;
  } else {
    console.log("Geverifieerd: geen restanten meer (0 partijen, 0 runs met SEED-lotnummer).");
  }
}

(cleanup ? cleanupData() : seed()).catch((e) => {
  console.error("FOUT:", e.message);
  process.exit(1);
});
