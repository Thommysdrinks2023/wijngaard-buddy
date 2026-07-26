// Fase 10 — proactieve assistent, de signaallaag (ONTWERP-3-API.md §1-2).
// Eén gedeeld contract + één array van producenten, ipv losse, verspreide
// checks (die stonden voorheen dubbel in index.tsx en meldingen.tsx).
//
// Regel-signalen worden hier BEREKEND, niet opgeslagen: elke producent leest
// bestaande data en levert een verse Signaal[] op. Geen serverstaat, geen
// AI-aanroep, geen kosten. Zie ONTWERP-1-ARCHITECTUUR.md voor de motivatie.

import { getPb, isIngelogd } from "./data";
import { fetchMaterieel, fetchOnderhoud, onderhoudBinnenkort } from "./materieel-data";
import { fetchRegelgevingInstellingen, REGELGEVING_SLEUTELS } from "./regelgeving-data";
import { fetchPartijen } from "./partijen-data";
import { fetchAnalyses, fetchKelderlog, fetchVoorraadFlessen } from "./kelder-data";
import {
  bepaalTaakStatus,
  isTaak,
  omschrijfAchterstand,
  type SluitGebeurtenis,
  type TaakRegel,
} from "./taken";
import { meetwaarde, parseGemetenVelden, type MeetVeld } from "./meetwaarde";

// Welke analysevelden kunnen een taak sluiten. Bewust een expliciete lijst:
// zo is meteen zichtbaar waar het mechanisme op werkt.
const ANALYSE_SLUITVELDEN: MeetVeld[] = [
  "so2_vrij",
  "so2_totaal",
  "dichtheid_oechsle",
  "ph",
  "totaalzuur_g_l",
  "restsuiker_g_l",
  "alcohol_pct",
];
import { APP_INSTELLING_SLEUTELS, fetchAppInstellingen, vindWaarde } from "./app-instellingen-data";
import { fetchMiddelen } from "./middelen-data";
import { fetchWerkuren } from "./extra-data";
import { fetchRijen } from "./data";
import { berekenWachttijden, omschrijfWachttijd, type RijWachttijd } from "./wachttijd";
import { addDays, format } from "date-fns";

export type SignaalErnst = "kritiek" | "waarschuwing" | "info";

export interface Signaal {
  // Stabiel id: `<bron>-<onderwerp-id>`. Bepaalt snooze/dismiss-identiteit -
  // MOET identiek blijven aan de bestaande meldingen.tsx-id's (migratie).
  id: string;
  bron: string;
  ernst: SignaalErnst;
  titel: string;
  detail?: string;
  link?: string;
  // De "waarom": een kant-en-klare string, opgebouwd uit dezelfde data die
  // het signaal detecteerde. Geen aparte call nodig om 'm te tonen.
  waarom: string;
  /**
   * Fase 13 — het record waar dit signaal over gaat. Nodig om een taak te
   * kunnen afvinken (Blok C) en om naar het juiste detailscherm te linken
   * (Blok D). Ontbreekt bij signalen die niet over één record gaan, zoals de
   * backup-waarschuwing.
   */
  bronRecord?: { collectie: string; id: string };
  datum?: string; // yyyy-MM-dd, voor recentheid-sortering binnen dezelfde ernst
  taakVoorstel?: {
    actie_type: "kelderlog";
    samenvatting: string;
    payload: Record<string, unknown>;
  };
}

export type SignaalProducent = () => Promise<Signaal[]>;

/**
 * Fase 13 Blok D — van bronrecord naar detailscherm.
 *
 * De melding "Rij 22 heeft bovengemiddelde uitval" linkte naar /assistent, en
 * de SO₂-taak naar het algemene kelderdashboard: de melding wist wél over welk
 * record hij ging, maar gooide dat bij het linken weg. Eén tabel houdt dat
 * consistent en maakt meteen zichtbaar welke collecties géén detailscherm
 * hebben (materieel, voorraadmutaties) — daar is het overzicht het beste doel.
 */
const DETAILROUTE: Record<string, (id: string) => string> = {
  rijen: (id) => `/rij/${id}`,
  partijen: (id) => `/kelder/partijen/${id}`,
  tanks: (id) => `/kelder/tanks/${id}`,
  voorraad_flessen: (id) => `/voorraad/${id}`,
};

/** Beste bestemming voor een signaal: het record zelf, anders het overzicht. */
export function signaalLink(
  bronRecord: { collectie: string; id: string } | undefined,
  terugval: string,
): string {
  if (!bronRecord?.id) return terugval;
  const maak = DETAILROUTE[bronRecord.collectie];
  return maak ? maak(bronRecord.id) : terugval;
}

// ============= Onderhoud binnen 30 dagen (verhuisd uit meldingen.tsx) =============
export async function onderhoudSignalen(): Promise<Signaal[]> {
  if (!isIngelogd()) return []; // auth-only bronnen, zie Fase 8-patroon
  const [onderhoud, materieel] = await Promise.all([fetchOnderhoud(), fetchMaterieel()]);
  const binnenkort = onderhoudBinnenkort(onderhoud);
  const materieelNaam = new Map(materieel.map((m) => [m.id, m.naam]));
  return binnenkort.map((r) => {
    const naam = materieelNaam.get(r.materieel) ?? "machine";
    return {
      id: `onderhoud-${r.materieel}-${r.volgende_keer}`,
      bron: "onderhoud",
      ernst: "info" as const,
      titel: `Onderhoud gepland: ${naam} vóór ${r.volgende_keer}.`,
      waarom: `${naam} heeft onderhoud gepland vóór ${r.volgende_keer} — dat valt binnen de 30-dagen-vooruitblik.`,
      // materieel heeft (nog) geen detailscherm; het overzicht is het beste doel
      bronRecord: { collectie: "materieel", id: r.materieel },
      link: signaalLink({ collectie: "materieel", id: r.materieel }, "/materieel"),
      datum: r.volgende_keer,
      // Fase 10 Blok 5: promoveerbaar tot taak via de bestaande
      // agent_acties-bevestigingsflow (besluit 4, geen nieuwe statusmachine).
      taakVoorstel: {
        actie_type: "kelderlog" as const,
        samenvatting: `TAAK: onderhoud ${naam} vóór ${r.volgende_keer}`,
        payload: {
          datum: r.volgende_keer,
          actie: "overig",
          notitie: `TAAK: onderhoud ${naam} inplannen (uiterlijk ${r.volgende_keer})`,
        },
      },
    };
  });
}

// ============= Backup-waarschuwing (verhuisd uit meldingen.tsx/index.tsx) =============
// De permanente statusregel op de hub (BackupWidget in index.tsx) blijft
// ongewijzigd bestaan naast dit signaal (besluit Thomas: "stilte is
// dubbelzinnig bij backups") - dit signaal toont ALLEEN de waarschuwing.
export async function backupWaarschuwingSignaal(): Promise<Signaal[]> {
  if (!isIngelogd()) return [];
  const [regelgeving, appInstellingen] = await Promise.all([
    fetchRegelgevingInstellingen(),
    fetchAppInstellingen(),
  ]);
  const record = regelgeving.find((r) => r.sleutel === "laatste_backup");
  if (!record?.laatst_gecontroleerd) return [];
  const laatst = new Date(record.laatst_gecontroleerd.replace(" ", "T"));
  if (isNaN(laatst.getTime())) return [];
  const dagen = Math.floor((Date.now() - laatst.getTime()) / 86400000);
  const drempel = vindWaarde(appInstellingen, APP_INSTELLING_SLEUTELS.backupWaarschuwingDagen, 2);
  if (dagen <= drempel) return [];
  return [
    {
      id: `backup-${record.laatst_gecontroleerd}`,
      bron: "backup",
      ernst: "waarschuwing",
      titel: `Laatste geslaagde backup is ${dagen} dagen oud — controleer de backuptaak.`,
      waarom: `De laatste geslaagde backup is ${dagen} dagen oud — dat is meer dan de ingestelde waarschuwingsdrempel van ${drempel} dagen (zie docs/backup.md).`,
    },
  ];
}

// ============= AGP-drempel (verhuisd uit meldingen.tsx) =============
// Jaarproductie (som startvolumes huidige jaargang) vs. de wettelijke
// AGP-drempel (regelgeving_instellingen). Het WAARSCHUWINGSPERCENTAGE (80%)
// is een operationele keuze van Thomas en komt uit app_instellingen; de
// drempel zelf (liters) blijft wettelijk/geverifieerd in
// regelgeving_instellingen. Zie ONTWERP-2-DATAMODEL.md §3.
export async function agpSignaal(): Promise<Signaal[]> {
  if (!isIngelogd()) return [];
  const [partijen, regelgeving, appInstellingen] = await Promise.all([
    fetchPartijen(),
    fetchRegelgevingInstellingen(),
    fetchAppInstellingen(),
  ]);
  const drempel = regelgeving.find((r) => r.sleutel === REGELGEVING_SLEUTELS.agpDrempel)?.waarde;
  if (!drempel) return [];
  const percentage = vindWaarde(
    appInstellingen,
    APP_INSTELLING_SLEUTELS.agpWaarschuwingPercentage,
    80,
  );
  const jaar = new Date().getFullYear();
  const productie = partijen
    .filter((p) => p.jaargang === jaar)
    .reduce((acc, p) => acc + (p.start_volume_l ?? 0), 0);
  if (productie <= drempel * (percentage / 100)) return [];
  return [
    {
      id: `agp-${jaar}`,
      bron: "agp",
      ernst: "waarschuwing",
      titel: `Jaarproductie ${jaar} (${Math.round(productie)} L) nadert of overschrijdt de AGP-drempel (${drempel} L) — controleer je accijnspositie.`,
      waarom: `De jaarproductie van ${jaar} (${Math.round(productie)} L, som van de startvolumes van alle partijen dit jaar) zit boven ${percentage}% van de AGP-drempel (${drempel} L).`,
      link: "/kelder/accijns",
      datum: `${jaar}-12-31`,
    },
  ];
}

// ============= Kelderlog-taken (verhuisd uit meldingen.tsx) =============
// Conventie: notitie begint met "TAAK:"; tonen zodra de datum binnen 7 dagen
// ligt of verstreken is.
export async function kelderlogTaakSignalen(): Promise<Signaal[]> {
  if (!isIngelogd()) return [];
  // Fase 13 Blok C: analyses meelezen, want een taak kan zichzelf sluiten
  // zodra de bijbehorende meting is vastgelegd (zie src/lib/taken.ts).
  const [kelderlog, analyses] = await Promise.all([fetchKelderlog(), fetchAnalyses()]);
  const vandaag = format(new Date(), "yyyy-MM-dd");
  const taakGrens = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const gebeurtenissen: SluitGebeurtenis[] = analyses.map((a) => ({
    id: a.id,
    soort: "analyse",
    datum: a.datum,
    partij: a.partij,
    // alleen ECHT gemeten velden tellen als sluiter — een leeg PocketBase-veld
    // komt als 0 terug en zou een taak anders ten onrechte afsluiten (Blok A)
    velden: new Set(
      ANALYSE_SLUITVELDEN.filter(
        (v) => meetwaarde(v, a[v], parseGemetenVelden(a.gemeten_velden)) !== null,
      ),
    ),
  }));

  const signalen: Signaal[] = [];
  for (const r of kelderlog) {
    if (!isTaak(r.notitie)) continue;
    if (r.datum > taakGrens) continue;
    const status = bepaalTaakStatus(r as TaakRegel, gebeurtenissen, vandaag);
    // Afgeronde taken verdwijnen — of dat nu met de hand of doordat het werk
    // gedaan is. Dát was het hele punt: het werk dóén moet de taak sluiten.
    if (status.afgerond) continue;
    const teLaat = status.urgentie === "te_laat";
    signalen.push({
      id: `taak-${r.id}`,
      bron: "kelderlog_taak",
      ernst: teLaat ? "waarschuwing" : "info",
      titel: `${status.omschrijving} — ${omschrijfAchterstand(status)}`,
      waarom: teLaat
        ? `Deze taak stond gepland voor ${r.datum} en is nu ${omschrijfAchterstand(status)}.` +
          (r.taak_sluit_bij
            ? ` Hij sluit vanzelf zodra de bijbehorende meting is vastgelegd (${r.taak_sluit_bij}).`
            : "")
        : `Deze taak staat gepland voor ${r.datum} (${omschrijfAchterstand(status)}).`,
      // Het bronrecord is de kelderlogregel (nodig om af te vinken), maar
      // kelderlog heeft geen eigen detailscherm — de partij waar de taak bij
      // hoort is de plek waar je hem uitvoert. Vandaar hier een eigen doel
      // in plaats van signaalLink().
      link: signaalLink(r.partij ? { collectie: "partijen", id: r.partij } : undefined, "/kelder"),
      bronRecord: { collectie: "kelderlog", id: r.id },
      datum: r.datum,
    });
  }
  return signalen;
}

// ============= Kritieke inzichten (verhuisd uit meldingen.tsx) =============
const KRITIEKE_INZICHTEN = new Set(["gisting_snelheid", "uitval_cluster"]);

export async function kritiekeInzichtSignalen(): Promise<Signaal[]> {
  const pb = getPb();
  if (!pb || !isIngelogd()) return [];
  try {
    // Fase 10 besluit: inzichten worden NIET meer opgeschoond (onbeperkte
    // historie voor jaar-op-jaar-vergelijking), dus deze query moet expliciet
    // een venster meegeven i.p.v. de hele (groeiende) tabel op te halen -
    // zie ONTWERP-2-DATAMODEL.md §9.
    const { items } = await pb.collection("inzichten").getList(1, 20, {
      filter: "deleted != true",
      sort: "-berekend_op",
      // requestKey: null — meerdere aanroepers kunnen dit tegelijk opvragen;
      // zonder dit annuleren ze elkaars identieke GET (PocketBase
      // auto-cancellation, zie CLAUDE.md).
      requestKey: null,
    });
    return items
      .filter((r) => KRITIEKE_INZICHTEN.has(r["inzicht_type"]))
      .slice(0, 5)
      .map((r) => {
        // Fase 13 Blok D: een inzicht bewaarde alleen een leesbaar label
        // ("Rij 22"), dus linkte "Rij 22 heeft bovengemiddelde uitval" naar de
        // assistent in plaats van naar die rij. Sinds deze fase legt
        // bereken-inzichten.mjs ook de echte verwijzing vast. Oudere inzichten
        // hebben die niet — die vallen terug op /assistent, waar de tekst
        // tenminste besproken kan worden.
        const soort = (r["onderwerp_soort"] as string) || "";
        const id = (r["onderwerp_id"] as string) || "";
        const bronRecord = soort && id ? { collectie: soort, id } : undefined;
        return {
          id: `inzicht-${r.id}`,
          bron: "inzicht",
          ernst: "waarschuwing" as const,
          titel: r["samenvatting_nl"] as string,
          waarom: r["samenvatting_nl"] as string,
          bronRecord,
          link: signaalLink(bronRecord, "/assistent"),
          datum: r["berekend_op"] as string,
        };
      });
  } catch {
    return []; // niet ingelogd of offline — geen signalen
  }
}

// ============= Voorraad bijna op (Fase 10 Blok 4, nieuw signaal) =============
// Client-side filter omdat de drempel per wijn kan verschillen (eigen
// drempel_aantal óf de globale standaard) — dat past in geen enkele
// PocketBase-filterexpressie. Zie ONTWERP-2-DATAMODEL.md §9.
export async function voorraadBijnaOpSignalen(): Promise<Signaal[]> {
  if (!isIngelogd()) return [];
  const [voorraad, appInstellingen] = await Promise.all([
    fetchVoorraadFlessen(),
    fetchAppInstellingen(),
  ]);
  const standaard = vindWaarde(
    appInstellingen,
    APP_INSTELLING_SLEUTELS.voorraadDrempelStandaard,
    12,
  );
  const signalen: Signaal[] = [];
  for (const v of voorraad) {
    // Uitverkocht is geen "bijna op" meer — dat is een andere situatie en
    // zou als vals signaal blijven staan tot het record verwijderd wordt.
    if (v.aantal_huidig <= 0) continue;
    const drempel = v.drempel_aantal ?? standaard;
    if (v.aantal_huidig >= drempel) continue;
    const naam = `${v.wijnnaam}${v.jaargang ? ` ${v.jaargang}` : ""}`;
    signalen.push({
      id: `voorraad-${v.id}`,
      bron: "voorraad_bijna_op",
      ernst: "info",
      titel: `${naam} nadert einde voorraad (${v.aantal_huidig} flessen).`,
      waarom: `Er zijn nog ${v.aantal_huidig} flessen ${naam} — dat is onder de drempel van ${drempel}${v.drempel_aantal ? " (eigen drempel voor deze wijn)" : " (globale standaard)"}.`,
      bronRecord: { collectie: "voorraad_flessen", id: v.id },
      link: signaalLink({ collectie: "voorraad_flessen", id: v.id }, "/voorraad"),
    });
  }
  return signalen;
}

// ============= Rijen in spuitwachttijd (Fase 13 Blok B) =============
// De enige signaalsoort met juridische gevolgen: druiven binnen de
// veiligheidstermijn maken de wijn onverkoopbaar. Verdwijnt vanzelf zodra de
// termijn verstreken is, want berekenWachttijden() geeft alleen lopende
// termijnen terug.
export async function wachttijdSignalen(): Promise<Signaal[]> {
  if (!isIngelogd()) return [];
  const [werkuren, middelen, rijen] = await Promise.all([
    fetchWerkuren(),
    fetchMiddelen(),
    fetchRijen(),
  ]);
  const vandaag = format(new Date(), "yyyy-MM-dd");
  const perRij = berekenWachttijden(
    werkuren,
    middelen,
    rijen.map((r) => r.id),
    vandaag,
  );
  if (perRij.size === 0) return [];

  const nummerVan = new Map(rijen.map((r) => [r.id, r.rijnummer]));
  // Eén signaal per vrijgavedatum in plaats van per rij: bij een bespuiting
  // van de hele wijngaard zouden anders 69 identieke regels in de widget
  // staan en is hij onleesbaar.
  const perDatum = new Map<string, string[]>();
  const bepalendPerDatum = new Map<string, RijWachttijd>();
  for (const w of perRij.values()) {
    if (!perDatum.has(w.vrijVanaf)) perDatum.set(w.vrijVanaf, []);
    perDatum.get(w.vrijVanaf)!.push(String(nummerVan.get(w.rijId) ?? "?"));
    if (!bepalendPerDatum.has(w.vrijVanaf)) bepalendPerDatum.set(w.vrijVanaf, w);
  }

  return [...perDatum.entries()].map(([vrijVanaf, rijnummers]) => {
    const voorbeeld = bepalendPerDatum.get(vrijVanaf)!;
    const b = voorbeeld.bepalend;
    const rijTekst = b.heleWijngaard
      ? "Hele wijngaard"
      : `Rij ${rijnummers.sort((x, y) => Number(x) - Number(y)).join(", ")}`;
    // Fase 13 Blok D: gaat het over één rij, dan is die rij het doel. Bij meer
    // rijen (of de hele wijngaard) is de kaart de enige zinnige bestemming —
    // daar zie je in één oogopslag wat er wél en niet geplukt mag worden.
    const eenRij = !b.heleWijngaard && perRij.size === 1;
    const bronRecord = eenRij ? { collectie: "rijen", id: voorbeeld.rijId } : undefined;
    return {
      id: `wachttijd-${vrijVanaf}`,
      bron: "wachttijd",
      ernst: "waarschuwing" as SignaalErnst,
      titel: `${rijTekst}: niet oogsten vóór ${vrijVanaf} (nog ${voorbeeld.dagenTeGaan} ${voorbeeld.dagenTeGaan === 1 ? "dag" : "dagen"})`,
      waarom: omschrijfWachttijd(voorbeeld, b.heleWijngaard ? undefined : Number(rijnummers[0])),
      bronRecord,
      link: signaalLink(bronRecord, "/perceelkaart"),
      datum: vrijVanaf,
    };
  });
}

const PRODUCENTEN: SignaalProducent[] = [
  onderhoudSignalen,
  backupWaarschuwingSignaal,
  agpSignaal,
  kelderlogTaakSignalen,
  kritiekeInzichtSignalen,
  voorraadBijnaOpSignalen,
  wachttijdSignalen,
];

// Verzamelt alle signalen; een falende producent blokkeert de rest nooit
// (Fase 3-eis: één kapotte bron mag nooit de hele Vandaag-widget breken).
export async function verzamelSignalen(): Promise<Signaal[]> {
  const resultaten = await Promise.all(
    PRODUCENTEN.map(async (p) => {
      try {
        return await p();
      } catch (e) {
        console.warn("signaalproducent faalde, overgeslagen", e);
        return [];
      }
    }),
  );
  return sorteerSignalen(resultaten.flat());
}

const ERNST_VOLGORDE: Record<SignaalErnst, number> = { kritiek: 0, waarschuwing: 1, info: 2 };

export function sorteerSignalen(signalen: Signaal[]): Signaal[] {
  return [...signalen].sort((a, b) => {
    const ernstVerschil = ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst];
    if (ernstVerschil !== 0) return ernstVerschil;
    return (b.datum ?? "").localeCompare(a.datum ?? "");
  });
}
