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
import { fetchKelderlog, fetchVoorraadFlessen } from "./kelder-data";
import { APP_INSTELLING_SLEUTELS, fetchAppInstellingen, vindWaarde } from "./app-instellingen-data";
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
  datum?: string; // yyyy-MM-dd, voor recentheid-sortering binnen dezelfde ernst
  taakVoorstel?: {
    actie_type: "kelderlog";
    samenvatting: string;
    payload: Record<string, unknown>;
  };
}

export type SignaalProducent = () => Promise<Signaal[]>;

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
      link: "/materieel",
      datum: r.volgende_keer,
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
  const kelderlog = await fetchKelderlog();
  const vandaag = format(new Date(), "yyyy-MM-dd");
  const taakGrens = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const signalen: Signaal[] = [];
  for (const r of kelderlog) {
    if (!r.notitie?.startsWith("TAAK:")) continue;
    if (r.datum > taakGrens) continue;
    const verlopen = r.datum <= vandaag;
    signalen.push({
      id: `taak-${r.id}`,
      bron: "kelderlog_taak",
      ernst: verlopen ? "waarschuwing" : "info",
      titel: `${r.datum}: ${r.notitie.slice(5).trim()}`,
      waarom: verlopen
        ? `Deze taak stond gepland voor ${r.datum} — dat is vandaag of eerder.`
        : `Deze taak staat gepland binnen 7 dagen (${r.datum}).`,
      link: "/kelder",
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
      .map((r) => ({
        id: `inzicht-${r.id}`,
        bron: "inzicht",
        ernst: "waarschuwing" as const,
        titel: r["samenvatting_nl"] as string,
        waarom: r["samenvatting_nl"] as string,
        link: "/assistent",
        datum: r["berekend_op"] as string,
      }));
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
      link: "/voorraad",
    });
  }
  return signalen;
}

const PRODUCENTEN: SignaalProducent[] = [
  onderhoudSignalen,
  backupWaarschuwingSignaal,
  agpSignaal,
  kelderlogTaakSignalen,
  kritiekeInzichtSignalen,
  voorraadBijnaOpSignalen,
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
