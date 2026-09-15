// Fase 7 Blok F1 — Ctgb-import: leest een handmatig gedownloade export van de
// Ctgb-toelatingendatabank (CSV) in naar de `middelen`-collectie. Bewust géén
// live koppeling: er is geen stabiele publieke API gegarandeerd.
//
// Gebruik:
//   node scripts/import-ctgb.mjs <csv-bestand> <admin-email> <admin-wachtwoord> [pocketbase-url]
//
// Verwacht CSV-format (kop, ; of , als scheidingsteken — zie docs/ctgb-voorbeeld.csv):
//   naam;toelatingsnummer;actieve_stof;max_dosering;max_dosering_eenheid;
//   max_toepassingen_seizoen;veiligheidstermijn_dagen;herbetreding_uren;geldig_tot
//
// Upsert op toelatingsnummer; draaien is idempotent en veilig te herhalen na
// elke nieuwe download. Zet per rij `geimporteerd_op` op vandaag.

import { readFileSync } from "node:fs";

const [, , csvPad, email, wachtwoord, urlArg] = process.argv;
const PB_URL = urlArg || process.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
if (!csvPad || !email || !wachtwoord) {
  console.error(
    "Gebruik: node scripts/import-ctgb.mjs <csv-bestand> <admin-email> <admin-wachtwoord> [url]",
  );
  process.exit(1);
}

function parseCsv(tekst) {
  const regels = tekst
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((r) => r.trim());
  const scheiding = regels[0].includes(";") ? ";" : ",";
  const splits = (regel) => {
    // eenvoudige CSV-splitser met quote-ondersteuning
    const velden = [];
    let huidig = "";
    let inQuote = false;
    for (let i = 0; i < regel.length; i++) {
      const c = regel[i];
      if (c === '"') {
        if (inQuote && regel[i + 1] === '"') {
          huidig += '"';
          i++;
        } else inQuote = !inQuote;
      } else if (c === scheiding && !inQuote) {
        velden.push(huidig);
        huidig = "";
      } else huidig += c;
    }
    velden.push(huidig);
    return velden.map((v) => v.trim());
  };
  const kop = splits(regels[0]).map((k) => k.toLowerCase().replace(/\s+/g, "_"));
  return regels.slice(1).map((r) => {
    const velden = splits(r);
    const obj = {};
    kop.forEach((k, i) => (obj[k] = velden[i] ?? ""));
    return obj;
  });
}

const nummer = (v) => {
  const n = Number(String(v).replace(",", "."));
  return isNaN(n) || v === "" ? null : n;
};

async function api(pad, opties = {}, token) {
  const res = await fetch(`${PB_URL}${pad}`, {
    ...opties,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...opties.headers,
    },
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  if (!res.ok) throw new Error(`${pad}: ${res.status} ${await res.text()}`);
  return res.json();
}

const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: { identity: email, password: wachtwoord },
});
const token = auth.token;

const rijen = parseCsv(readFileSync(csvPad, "utf8"));
const vandaag = new Date().toISOString().slice(0, 10);
let nieuw = 0;
let bijgewerkt = 0;
let overgeslagen = 0;

for (const rij of rijen) {
  const toelatingsnummer = rij.toelatingsnummer || rij.toelatingnummer || "";
  if (!rij.naam || !toelatingsnummer) {
    overgeslagen++;
    continue;
  }
  const record = {
    naam: rij.naam,
    toelatingsnummer,
    actieve_stof: rij.actieve_stof ?? "",
    max_dosering: nummer(rij.max_dosering),
    max_dosering_eenheid: rij.max_dosering_eenheid ?? "",
    max_toepassingen_seizoen: nummer(rij.max_toepassingen_seizoen),
    veiligheidstermijn_dagen: nummer(rij.veiligheidstermijn_dagen),
    herbetreding_uren: nummer(rij.herbetreding_uren),
    geldig_tot: rij.geldig_tot ?? "",
    bron: "Ctgb-toelatingenexport",
    geimporteerd_op: vandaag,
  };
  const bestaand = await api(
    `/api/collections/middelen/records?perPage=1&filter=${encodeURIComponent(`toelatingsnummer='${toelatingsnummer}'`)}`,
    {},
    token,
  );
  if (bestaand.totalItems > 0) {
    await api(
      `/api/collections/middelen/records/${bestaand.items[0].id}`,
      { method: "PATCH", body: record },
      token,
    );
    bijgewerkt++;
  } else {
    await api("/api/collections/middelen/records", { method: "POST", body: record }, token);
    nieuw++;
  }
}

console.log(
  `Ctgb-import klaar: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt, ${overgeslagen} overgeslagen (geen naam/toelatingsnummer).`,
);
