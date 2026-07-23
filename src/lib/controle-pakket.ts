// Fase 7 Blok E — controle-pakket: één ZIP met alle registers over een
// periode, voor een Douane-/NVWA-controle of de accountant. Bundelt de
// bestaande exportdata (CSV's) + een voorblad; er wordt niets nieuws
// berekend, alleen gebundeld.

import { format } from "date-fns";
import { APP_NAAM, BEDRIJFSNAAM } from "@/config/app";
import { csvAlsString } from "./csv-export";
import {
  fetchBottelrondes,
  fetchKelderlog,
  fetchTankboek,
  fetchTanks,
  fetchVoorraadFlessen,
} from "./kelder-data";
import { fetchPartijen } from "./partijen-data";
import { fetchWerkuren } from "./extra-data";
import { getPb } from "./data";

export interface PakketPeriode {
  van: string;
  tot: string;
  label: string;
}

export async function maakControlePakket(
  periode: PakketPeriode,
  accijnsRegels: unknown[][],
): Promise<void> {
  // Lazy geladen: jszip is alleen nodig als iemand daadwerkelijk exporteert
  // (Fase 9 Blok A) — anders zit die hele bibliotheek in de accijns-chunk.
  const { default: JSZip } = await import("jszip");
  const pb = getPb();
  const [tankboek, kelderlog, voorraad, bottelrondes, partijen, tanks, werkuren] =
    await Promise.all([
      fetchTankboek({ vanaf: periode.van, tot: periode.tot }),
      fetchKelderlog({ vanaf: periode.van, tot: periode.tot }),
      fetchVoorraadFlessen(),
      fetchBottelrondes(),
      fetchPartijen(),
      fetchTanks(),
      fetchWerkuren(),
    ]);
  const mutaties = pb
    ? await pb.collection("voorraad_mutaties").getFullList({
        filter: `datum >= "${periode.van}" && datum <= "${periode.tot}"`,
        sort: "datum",
      })
    : [];

  const partijNaam = new Map(partijen.map((p) => [p.id, p.naam]));
  const partijLot = new Map(partijen.map((p) => [p.id, p.lotnummer ?? ""]));
  const tankCode = new Map(tanks.map((t) => [t.id, t.code]));
  const voorraadNaam = new Map(voorraad.map((v) => [v.id, `${v.wijnnaam} ${v.jaargang}`]));

  const zip = new JSZip();
  const inhoud: string[] = [];
  const voeg = (naam: string, kolommen: string[], rijen: unknown[][]) => {
    zip.file(naam, csvAlsString(kolommen, rijen));
    inhoud.push(naam);
  };

  voeg(
    "tankboek.csv",
    [
      "Datum",
      "Actie",
      "Partij",
      "Lot",
      "Van tank",
      "Naar tank",
      "Volume L",
      "Verantwoordelijke",
      "Notitie",
    ],
    tankboek.map((r) => [
      r.datum,
      r.actie,
      partijNaam.get(r.partij) ?? r.partij,
      partijLot.get(r.partij) ?? "",
      r.van_tank ? (tankCode.get(r.van_tank) ?? "") : "",
      r.naar_tank ? (tankCode.get(r.naar_tank) ?? "") : "",
      r.volume_l,
      r.verantwoordelijke,
      r.notitie ?? "",
    ]),
  );

  voeg(
    "kelderlog.csv",
    [
      "Datum",
      "Actie",
      "Partij",
      "Tank",
      "Middel",
      "Hoeveelheid",
      "Eenheid",
      "Notitie",
      "Invoerder",
    ],
    kelderlog.map((r) => [
      r.datum,
      r.actie,
      r.partij ? (partijNaam.get(r.partij) ?? "") : "",
      r.tank ? (tankCode.get(r.tank) ?? "") : "",
      r.middel ?? "",
      r.hoeveelheid ?? "",
      r.eenheid ?? "",
      r.notitie ?? "",
      r.ingevoerd_door ?? "",
    ]),
  );

  voeg(
    "reinigingslog.csv",
    ["Datum", "Tank", "Middel", "Methode/notitie", "Invoerder"],
    kelderlog
      .filter((r) => r.actie === "reiniging")
      .map((r) => [
        r.datum,
        r.tank ? (tankCode.get(r.tank) ?? "") : "",
        r.middel ?? "",
        r.notitie ?? "",
        r.ingevoerd_door ?? "",
      ]),
  );

  voeg(
    "voorraadregister.csv",
    ["Wijn", "Jaargang", "Lot", "Gebotteld", "Huidig", "Status"],
    voorraad.map((v) => [
      v.wijnnaam,
      v.jaargang,
      partijLot.get(v.partij) ?? "",
      v.aantal_beginvoorraad,
      v.aantal_huidig,
      v.status,
    ]),
  );

  voeg(
    "voorraadmutaties.csv",
    ["Datum", "Voorraad", "Type", "Aantal", "Afnemer/reden", "Notitie"],
    mutaties.map((m) => [
      m["datum"],
      voorraadNaam.get(m["voorraad"]) ?? m["voorraad"],
      m["mutatie_type"],
      m["aantal"],
      m["afnemer_of_reden"] ?? "",
      m["notities"] ?? "",
    ]),
  );

  voeg("accijnsoverzicht.csv", ["Onderdeel", "Waarde"], accijnsRegels);

  // Traceerbaarheid per in de periode gebotteld lot: bottelronde + volledige
  // tankboekhistorie van de partij (één stap terug, één stap vooruit).
  const gebotteld = bottelrondes.filter(
    (b) => b.botteldatum >= periode.van && b.botteldatum <= periode.tot,
  );
  const heleTankboek = gebotteld.length > 0 ? await fetchTankboek() : [];
  for (const b of gebotteld) {
    const lot = (b.lotnummer || partijLot.get(b.partij) || b.id).replace(/[^\w-]/g, "_");
    voeg(
      `traceerbaarheid_${lot}.csv`,
      ["Datum", "Actie", "Van tank", "Naar tank", "Volume L", "Verantwoordelijke", "Notitie"],
      [
        [
          b.botteldatum,
          `BOTTELRONDE lot ${b.lotnummer ?? ""} — ${b.aantal_flessen} flessen à ${b.flesinhoud_ml} ml (partij ${partijNaam.get(b.partij) ?? ""})`,
          b.van_tank ? (tankCode.get(b.van_tank) ?? "") : "",
          "",
          "",
          "",
          "",
        ],
        ...heleTankboek
          .filter((r) => r.partij === b.partij)
          .map((r) => [
            r.datum,
            r.actie,
            r.van_tank ? (tankCode.get(r.van_tank) ?? "") : "",
            r.naar_tank ? (tankCode.get(r.naar_tank) ?? "") : "",
            r.volume_l,
            r.verantwoordelijke,
            r.notitie ?? "",
          ]),
      ],
    );
  }

  voeg(
    "spuitregister.csv",
    [
      "Datum",
      "Middel",
      "Dosering",
      "Eenheid",
      "Reden",
      "Wachttijd (dagen)",
      "Rij/ras",
      "Invoerder",
    ],
    werkuren
      .filter((w) => w.taak === "Spuiten" && w.datum >= periode.van && w.datum <= periode.tot)
      .map((w) => [
        w.datum,
        w.middel ?? "",
        w.dosering ?? "",
        w.dosering_eenheid ?? "",
        w.reden ?? "",
        w.wachttijd_dagen ?? "",
        w.ras ?? "",
        w.ingevoerd_door,
      ]),
  );

  // Voorblad met bedrijfsgegevens, periode en inhoudsopgave (HTML: opent en
  // print overal; de losse registers hebben hun eigen print-PDF-weergaven in
  // de app zelf).
  const voorblad = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Controle-pakket ${periode.label}</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:3rem auto;line-height:1.5}h1{font-size:1.4rem}li{margin:.15rem 0}</style></head><body>
<h1>Controle-pakket — ${BEDRIJFSNAAM}</h1>
<p><b>Periode:</b> ${periode.label} (${periode.van} t/m ${periode.tot})<br>
<b>Gegenereerd:</b> ${format(new Date(), "yyyy-MM-dd HH:mm")} door ${APP_NAAM}<br>
<b>Bedrijf:</b> ${BEDRIJFSNAAM}, Den Ham (Overijssel)</p>
<h2>Inhoud</h2>
<ol>${inhoud.map((n) => `<li>${n}</li>`).join("")}</ol>
<p style="color:#666;font-size:.85rem">Alle bestanden zijn CSV (UTF-8, te openen in Excel). Het tankboek en de
voorraadmutaties zijn in de administratie onwijzigbaar; correcties staan er als aparte regels in.
Accijnsbedragen zijn indicatief — de aangifte zelf loopt via de Douane.</p>
</body></html>`;
  zip.file("voorblad.html", voorblad);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `controle-pakket_${periode.van}_${periode.tot}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
