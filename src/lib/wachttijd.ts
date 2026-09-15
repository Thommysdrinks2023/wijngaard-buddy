// Fase 13 Blok B — spuitwachttijd (veiligheidstermijn) vóór de oogst.
//
// AANLEIDING: `wachttijd_dagen` werd wél vastgelegd bij de spuitregistratie,
// maar nergens gebruikt om te waarschuwen. Je kon een rij vandaag spuiten met
// een middel met 21 dagen termijn en over twee weken diezelfde rij oogsten
// zonder één woord van de app. Dit is de enige integratie in de app met
// juridische gevolgen: druiven die binnen de veiligheidstermijn geplukt zijn,
// maken de wijn onverkoopbaar.
//
// TWEE BRONNEN voor de termijn, in deze volgorde:
//   1. de handmatig ingevulde `wachttijd_dagen` bij de bespuiting;
//   2. de `veiligheidstermijn_dagen` van het middel uit de Ctgb-lijst, als
//      het ingetypte middel daarin herkend wordt.
// Welke bron gebruikt is wordt meegegeven, zodat het scherm dat kan tonen —
// een Ctgb-termijn is een aanname op basis van naamherkenning, geen invoer.
//
// REIKWIJDTE van een bespuiting: `werkuren.rij` is optioneel. Is hij gevuld,
// dan raakt de bespuiting die ene rij; is hij leeg, dan is het "Hele
// wijngaard" en raakt hij ALLE rijen. Het veld `ras` op werkuren wordt door
// het formulier afgeleid uit de rij en is dus geen zelfstandige reikwijdte.

export interface SpuitRegistratie {
  id: string;
  datum: string; // yyyy-MM-dd
  taak: string;
  rij?: string | null;
  middel?: string;
  wachttijd_dagen?: number | null;
}

export interface MiddelTermijn {
  naam: string;
  veiligheidstermijn_dagen: number | null;
}

export type TermijnBron = "handmatig" | "ctgb";

export interface WachttijdBron {
  werkuurId: string;
  spuitdatum: string;
  middel: string;
  termijnDagen: number;
  bron: TermijnBron;
  heleWijngaard: boolean;
  /** eerste dag waarop weer geoogst mag worden (inclusief) */
  vrijVanaf: string;
}

export interface RijWachttijd {
  rijId: string;
  /** de laatste datum die vrijgeeft — bepaald door de zwaarste bespuiting */
  vrijVanaf: string;
  dagenTeGaan: number;
  bepalend: WachttijdBron;
  alleBronnen: WachttijdBron[];
}

const MS_PER_DAG = 86400000;

function datumPlusDagen(datum: string, dagen: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return datum;
  return new Date(d.getTime() + dagen * MS_PER_DAG).toISOString().slice(0, 10);
}

export function dagenTussen(van: string, tot: string): number {
  const a = new Date(`${van}T00:00:00Z`).getTime();
  const b = new Date(`${tot}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAG);
}

/** Zoekt de Ctgb-termijn bij een vrij ingetypte middelnaam (ruime match). */
function ctgbTermijn(middelen: MiddelTermijn[], invoer: string): number | null {
  const zoek = (invoer ?? "").trim().toLowerCase();
  if (!zoek) return null;
  const exact = middelen.find((m) => m.naam.trim().toLowerCase() === zoek);
  const deel =
    exact ??
    middelen.find((m) => {
      const n = m.naam.trim().toLowerCase();
      return n.length > 2 && (n.includes(zoek) || zoek.includes(n));
    });
  return deel?.veiligheidstermijn_dagen ?? null;
}

/**
 * Bepaalt per rij tot wanneer er niet geoogst mag worden.
 * Rijen zonder lopende termijn komen NIET in de uitkomst voor — daarmee
 * verdwijnt een waarschuwing vanzelf zodra de termijn verstreken is.
 */
export function berekenWachttijden(
  werkuren: SpuitRegistratie[],
  middelen: MiddelTermijn[],
  alleRijIds: string[],
  vandaag: string,
): Map<string, RijWachttijd> {
  const perRij = new Map<string, WachttijdBron[]>();

  for (const w of werkuren) {
    if (w.taak !== "Spuiten") continue;
    if (!w.datum) continue;

    const handmatig = w.wachttijd_dagen != null && w.wachttijd_dagen > 0 ? w.wachttijd_dagen : null;
    const uitCtgb = handmatig === null ? ctgbTermijn(middelen, w.middel ?? "") : null;
    const termijn = handmatig ?? uitCtgb;
    // Geen termijn bekend uit beide bronnen: dan valt er niets te bewaken.
    // Bewust géén aanname van een standaardtermijn — een verzonnen termijn is
    // net zo misleidend als geen termijn.
    if (termijn === null || termijn <= 0) continue;

    const heleWijngaard = !w.rij;
    const bron: WachttijdBron = {
      werkuurId: w.id,
      spuitdatum: w.datum,
      middel: w.middel?.trim() || "onbekend middel",
      termijnDagen: termijn,
      bron: handmatig !== null ? "handmatig" : "ctgb",
      heleWijngaard,
      vrijVanaf: datumPlusDagen(w.datum, termijn),
    };

    const doelen = heleWijngaard ? alleRijIds : [w.rij as string];
    for (const rijId of doelen) {
      if (!perRij.has(rijId)) perRij.set(rijId, []);
      perRij.get(rijId)!.push(bron);
    }
  }

  const uit = new Map<string, RijWachttijd>();
  for (const [rijId, bronnen] of perRij) {
    // alleen bespuitingen die NU nog lopen
    const lopend = bronnen.filter((b) => b.vrijVanaf > vandaag);
    if (lopend.length === 0) continue;
    // de zwaarste bepaalt: de laatste datum die vrijgeeft
    const bepalend = lopend.reduce((a, b) => (b.vrijVanaf > a.vrijVanaf ? b : a));
    uit.set(rijId, {
      rijId,
      vrijVanaf: bepalend.vrijVanaf,
      dagenTeGaan: dagenTussen(vandaag, bepalend.vrijVanaf),
      bepalend,
      alleBronnen: lopend.sort((a, b) => b.vrijVanaf.localeCompare(a.vrijVanaf)),
    });
  }
  return uit;
}

/** Eén regel uitleg voor op het scherm en in het vastgelegde record. */
export function omschrijfWachttijd(w: RijWachttijd, rijnummer?: number): string {
  const b = w.bepalend;
  const rij = rijnummer != null ? `Rij ${rijnummer}` : "Deze rij";
  const bronTekst =
    b.bron === "ctgb"
      ? `${b.termijnDagen} dagen volgens de Ctgb-lijst`
      : `${b.termijnDagen} dagen (handmatig ingevuld)`;
  const reikwijdte = b.heleWijngaard ? " (bespuiting hele wijngaard)" : "";
  return (
    `${rij} is behandeld met ${b.middel} op ${b.spuitdatum}${reikwijdte}. ` +
    `Veiligheidstermijn ${bronTekst}: niet oogsten vóór ${b.vrijVanaf} ` +
    `(nog ${w.dagenTeGaan} ${w.dagenTeGaan === 1 ? "dag" : "dagen"}).`
  );
}
