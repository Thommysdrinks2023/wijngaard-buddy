// Blok E — wekelijkse inzichten-berekening voor de AI-agent (Fase 3).
// Berekent 5 simpele, uitlegbare patronen (geen ML, gewoon aggregaties) en
// schrijft ze als `inzichten`-records weg; de agent citeert ze via de
// zoek_inzichten-tool. Draait handmatig, wekelijks, totdat de Raspberry Pi
// live is — dan wordt dit een cron/systemd-timer (zie CLAUDE.md).
//
// Gebruik:
//   node scripts/bereken-inzichten.mjs <email> <wachtwoord> [pocketbase-url]
// (url is optioneel als VITE_POCKETBASE_URL in .env staat)
//
// Ontbreekt de historische vergelijkingsbasis voor een berekening (bv. nog
// geen vorig seizoen), dan wordt die berekening overgeslagen — geen
// verzonnen vergelijking, consistent met het kernprincipe van de agent zelf.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const [email, wachtwoord, urlArg] = process.argv.slice(2);
const base = (urlArg || leesEnvVar("VITE_POCKETBASE_URL") || "").replace(/\/+$/, "");
if (!email || !wachtwoord || !base) {
  console.error(
    "Gebruik: node scripts/bereken-inzichten.mjs <email> <wachtwoord> [pocketbase-url]\n" +
      "(url is optioneel als VITE_POCKETBASE_URL in .env staat)",
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

async function getAll(collectie, extraParams = {}) {
  const items = [];
  let page = 1;
  for (;;) {
    const qs = new URLSearchParams({ page: String(page), perPage: "200", ...extraParams });
    const res = await api(`/api/collections/${collectie}/records?${qs}`);
    items.push(...res.items);
    if (page >= res.totalPages) break;
    page++;
  }
  return items;
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

function round1(n) {
  return Math.round(n * 10) / 10;
}
function gemiddelde(getallen) {
  return getallen.reduce((a, b) => a + b, 0) / getallen.length;
}
function standaardafwijking(getallen, gem) {
  const variantie = gemiddelde(getallen.map((n) => (n - gem) ** 2));
  return Math.sqrt(variantie);
}
function dagVanJaar(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.round((d.getTime() - start) / 86400000);
}
// ISO-weeknummer, bv. "2026-W27" — voor onderlinge vergelijking t.o.v. vorige jaren.
function isoWeek(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - jaarStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function schrijfInzicht(inzicht_type, onderwerp, periode, waarde, samenvatting_nl) {
  await api("/api/collections/inzichten/records", {
    method: "POST",
    body: {
      inzicht_type,
      onderwerp,
      periode: periode || "",
      berekend_op: new Date().toISOString(),
      waarde,
      samenvatting_nl,
    },
  });
  console.log(
    `  + [${inzicht_type}] ${onderwerp}${periode ? " · " + periode : ""}: ${samenvatting_nl}`,
  );
}

// ============= 1. brix_verloop =============
// Gemiddeld Brix per ras in de meest recente meetweek dit seizoen, vergeleken
// met het gemiddelde van diezelfde weeknaam in eerdere seizoenen.
async function berekenBrixVerloop(metingen, rijenPerId, huidigJaar) {
  const perRas = new Map();
  for (const m of metingen) {
    if (m.brix == null) continue;
    const rij = rijenPerId.get(m.rij);
    if (!rij) continue;
    const lijst = perRas.get(rij.ras) ?? [];
    lijst.push({ ...m, week: isoWeek(m.datum), jaar: Number(m.datum.slice(0, 4)) });
    perRas.set(rij.ras, lijst);
  }

  for (const [ras, lijst] of perRas) {
    const ditSeizoen = lijst.filter((m) => m.jaar === huidigJaar);
    if (ditSeizoen.length === 0) continue;
    const laatsteWeek = ditSeizoen.reduce((a, b) => (b.week > a ? b.week : a), ditSeizoen[0].week);
    const dezeWeek = ditSeizoen.filter((m) => m.week === laatsteWeek);
    const gemDitJaar = round1(gemiddelde(dezeWeek.map((m) => m.brix)));

    const weeknr = laatsteWeek.split("-W")[1];
    const eerdereJaren = lijst.filter(
      (m) => m.jaar !== huidigJaar && m.week.endsWith(`-W${weeknr}`),
    );
    if (eerdereJaren.length === 0) {
      console.log(
        `  · [brix_verloop] ${ras}: geen historische data voor week ${weeknr} — geen vergelijking mogelijk, overgeslagen.`,
      );
      continue;
    }
    const gemEerder = round1(gemiddelde(eerdereJaren.map((m) => m.brix)));
    const verschil = round1(gemDitJaar - gemEerder);
    const richting = verschil > 0 ? "hoger" : verschil < 0 ? "lager" : "gelijk aan";
    await schrijfInzicht(
      "brix_verloop",
      ras,
      laatsteWeek,
      { gemiddelde_dit_seizoen: gemDitJaar, gemiddelde_eerdere_seizoenen: gemEerder, verschil },
      `${ras} week ${weeknr}: gemiddeld ${gemDitJaar}°Bx dit seizoen, ${Math.abs(verschil)}°Bx ${richting} dan het gemiddelde van eerdere seizoenen (${gemEerder}°Bx).`,
    );
  }
}

// ============= 2. gisting_snelheid =============
// Dichtheidsdaling per dag tussen de laatste twee analyses van elke actief
// gistende partij; < 0,5 °Oe/dag over 3+ dagen = stagnatie.
const STAGNATIE_DREMPEL_PER_DAG = 0.5;

async function berekenGistingSnelheid(partijen, analysesPerPartij) {
  const gistend = partijen.filter((p) => p.status === "gisting");
  for (const partij of gistend) {
    const analyses = (analysesPerPartij.get(partij.id) ?? [])
      .filter((a) => a.dichtheid_oechsle != null)
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if (analyses.length < 2) continue;
    const laatste = analyses[analyses.length - 1];
    const vorige = analyses[analyses.length - 2];
    const dagen = Math.max(1, dagVanJaar(laatste.datum) - dagVanJaar(vorige.datum));
    const daling = round1(vorige.dichtheid_oechsle - laatste.dichtheid_oechsle);
    const perDag = daling / dagen;
    const stagneert = dagen >= 3 && perDag < STAGNATIE_DREMPEL_PER_DAG;
    const samenvatting = stagneert
      ? `Gisting partij ${partij.naam} stagneert: ${daling}°Oe daling in ${dagen} dagen.`
      : `Gisting partij ${partij.naam}: ${daling}°Oe daling in ${dagen} dagen (${round1(perDag)}°Oe/dag, normaal tempo).`;
    await schrijfInzicht(
      "gisting_snelheid",
      partij.naam,
      `${vorige.datum} t/m ${laatste.datum}`,
      { daling_oechsle: daling, dagen, per_dag: round1(perDag), stagneert },
      samenvatting,
    );
  }
}

// ============= 3. uitval_cluster =============
// Rijen met een opvallend hoog aantal uitval-observaties dit seizoen
// (> gemiddelde + 1 standaarddeviatie over alle rijen).
async function berekenUitvalCluster(rijen, observaties, huidigJaar) {
  const tellingPerRij = new Map(rijen.map((r) => [r.id, 0]));
  for (const o of observaties) {
    if (o.type !== "uitval") continue;
    if (Number(o.datum.slice(0, 4)) !== huidigJaar) continue;
    if (tellingPerRij.has(o.rij)) tellingPerRij.set(o.rij, tellingPerRij.get(o.rij) + 1);
  }
  const tellingen = Array.from(tellingPerRij.values());
  const gem = gemiddelde(tellingen);
  const std = standaardafwijking(tellingen, gem);
  const drempel = gem + std;
  const rijenPerId = new Map(rijen.map((r) => [r.id, r]));

  let gevonden = 0;
  for (const [rijId, telling] of tellingPerRij) {
    if (telling === 0 || telling <= drempel) continue;
    const rij = rijenPerId.get(rijId);
    gevonden++;
    await schrijfInzicht(
      "uitval_cluster",
      `Rij ${rij.rijnummer}`,
      String(huidigJaar),
      { telling, gemiddelde: round1(gem), drempel: round1(drempel) },
      `Rij ${rij.rijnummer} (${rij.ras}) heeft bovengemiddelde uitval: ${telling} melding(en) tegen een gemiddelde van ${round1(gem)} over alle rijen (drempel ${round1(drempel)}).`,
    );
  }
  if (gevonden === 0) console.log("  · [uitval_cluster] geen rij springt er statistisch uit.");
}

// ============= 4. gdd_afwijking =============
// Cumulatieve GDD dit seizoen t/m vandaag vs. het gemiddelde van dezelfde
// kalenderdag in de voorgaande 3 seizoenen (Open-Meteo archive, gratis).
const BASIS_TEMPERATUUR = 10;

async function cumulatieveGdd(lat, lon, jaar, totEnMet) {
  const start = `${jaar}-04-01`;
  if (totEnMet < start) return null;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${totEnMet}` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FBerlin`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.daily) return null;
  let cumulatief = 0;
  let dagenMetData = 0;
  for (let i = 0; i < d.daily.time.length; i++) {
    const tmax = d.daily.temperature_2m_max[i];
    const tmin = d.daily.temperature_2m_min[i];
    if (tmax == null || tmin == null) continue;
    cumulatief += Math.max(0, (tmax + tmin) / 2 - BASIS_TEMPERATUUR);
    dagenMetData++;
  }
  return dagenMetData > 0 ? cumulatief : null;
}

async function berekenGddAfwijking(lat, lon, huidigJaar) {
  const vandaag = new Date().toISOString().slice(0, 10);
  const seizoenBegonnen = vandaag >= `${huidigJaar}-04-01`;
  if (!seizoenBegonnen) {
    console.log("  · [gdd_afwijking] groeiseizoen is nog niet begonnen (vóór 1 april).");
    return;
  }
  const ditJaar = await cumulatieveGdd(lat, lon, huidigJaar, vandaag);
  if (ditJaar == null) {
    console.log("  · [gdd_afwijking] geen weerdata beschikbaar voor dit seizoen.");
    return;
  }
  // dag-in-het-jaar gelijktrekken voor een eerlijke vergelijking
  const dagInJaar = dagVanJaar(vandaag);
  const eerdereJaren = [];
  for (let terug = 1; terug <= 3; terug++) {
    const jaar = huidigJaar - terug;
    const vergelijkbareDatum = new Date(Date.UTC(jaar, 0, dagInJaar)).toISOString().slice(0, 10);
    const waarde = await cumulatieveGdd(lat, lon, jaar, vergelijkbareDatum);
    if (waarde != null) eerdereJaren.push(waarde);
  }
  if (eerdereJaren.length === 0) {
    console.log(
      "  · [gdd_afwijking] geen historische seizoenen beschikbaar om mee te vergelijken.",
    );
    return;
  }
  const gemEerder = round1(gemiddelde(eerdereJaren));
  const verschil = round1(ditJaar - gemEerder);
  const richting = verschil > 0 ? "boven" : verschil < 0 ? "onder" : "gelijk aan";
  await schrijfInzicht(
    "gdd_afwijking",
    String(huidigJaar),
    vandaag,
    {
      cumulatieve_gdd: round1(ditJaar),
      gemiddelde_eerdere_seizoenen: gemEerder,
      aantal_vergeleken_seizoenen: eerdereJaren.length,
      verschil,
    },
    `Cumulatieve GDD dit seizoen (${round1(ditJaar)}) ligt ${Math.abs(verschil)} punten ${richting} het ${eerdereJaren.length}-jaarsgemiddelde op dezelfde datum (${gemEerder}).`,
  );
}

// ============= 5. fenologie_vergelijking =============
// Per (ras, moment) met dit seizoen een record: dagverschil t.o.v. het
// gemiddelde van datzelfde (ras, moment) in eerdere seizoenen.
async function berekenFenologieVergelijking(fenologie, huidigJaar) {
  const perRasMoment = new Map();
  for (const f of fenologie) {
    const sleutel = `${f.ras}|${f.moment}`;
    const lijst = perRasMoment.get(sleutel) ?? [];
    lijst.push({ ...f, jaar: Number(f.datum.slice(0, 4)), dagInJaar: dagVanJaar(f.datum) });
    perRasMoment.set(sleutel, lijst);
  }

  for (const [sleutel, lijst] of perRasMoment) {
    const [ras, moment] = sleutel.split("|");
    const ditJaar = lijst.find((f) => f.jaar === huidigJaar);
    if (!ditJaar) continue;
    const eerder = lijst.filter((f) => f.jaar !== huidigJaar);
    if (eerder.length === 0) {
      console.log(
        `  · [fenologie_vergelijking] ${ras} · ${moment}: geen eerdere seizoenen om mee te vergelijken.`,
      );
      continue;
    }
    const gemDagEerder = gemiddelde(eerder.map((f) => f.dagInJaar));
    const verschilDagen = Math.round(ditJaar.dagInJaar - gemDagEerder);
    const richting =
      verschilDagen < 0 ? "vroeger" : verschilDagen > 0 ? "later" : "op dezelfde dag";
    await schrijfInzicht(
      "fenologie_vergelijking",
      `${ras} · ${moment}`,
      String(huidigJaar),
      { dit_jaar: ditJaar.datum, gemiddelde_dag_in_jaar_eerder: Math.round(gemDagEerder) },
      `${moment} bij ${ras} dit jaar op ${ditJaar.datum}, gemiddeld ${Math.abs(verschilDagen)} dag(en) ${richting} dan voorgaande seizoenen.`,
    );
  }
}

async function main() {
  token = await inloggen();
  console.log(`Inzichten berekenen op ${base}`);

  const huidigJaar = new Date().getFullYear();
  const [rijen, metingen, observaties, fenologie, partijen, analyses, instellingen] =
    await Promise.all([
      getAll("rijen"),
      getAll("metingen"),
      getAll("observaties"),
      getAll("fenologie"),
      getAll("partijen"),
      getAll("analyses"),
      getAll("vineyard_settings"),
    ]);
  const rijenPerId = new Map(rijen.map((r) => [r.id, r]));
  const analysesPerPartij = new Map();
  for (const a of analyses) {
    const lijst = analysesPerPartij.get(a.partij) ?? [];
    lijst.push(a);
    analysesPerPartij.set(a.partij, lijst);
  }
  const config = instellingen[0] || { lat: 52.47292, lon: 6.48405 };

  console.log(
    `Data geladen: ${rijen.length} rijen, ${metingen.length} metingen, ${observaties.length} observaties, ${fenologie.length} fenologiemomenten, ${partijen.length} partijen, ${analyses.length} analyses.`,
  );

  await berekenBrixVerloop(metingen, rijenPerId, huidigJaar);
  await berekenGistingSnelheid(partijen, analysesPerPartij);
  await berekenUitvalCluster(rijen, observaties, huidigJaar);
  await berekenGddAfwijking(config.lat, config.lon, huidigJaar);
  await berekenFenologieVergelijking(fenologie, huidigJaar);

  console.log("Klaar.");
}

main().catch((e) => {
  console.error("FOUT:", e.message);
  process.exit(1);
});
