// Fase 13 Blok E — van oogst naar partij.
//
// AANLEIDING: de oogst gaat de kelder in, maar de app wist dat niet. Je
// registreerde kilo's op /oogst en typte daarna in de kelder handmatig een
// partij over: rassen, verhouding, startdichtheid, volume. Alles wat de app al
// wist stond er al, maar op de verkeerde plek. En omdat `oogst.partij` optioneel
// is en niets eraan herinnerde, bleef die koppeling in de praktijk leeg —
// waarmee de traceerbaarheid van fles terug naar rij stilletjes wegviel.
//
// DIT BESTAND IS PURE REKENLOGICA. Geen fetches, geen React: alleen "gegeven
// deze oogstregels en metingen, wat is een redelijk voorstel voor een partij".
// Zo is elk randgeval hieronder in een test vast te leggen (zie
// oogst-naar-partij.test.ts) en blijft het scherm dom.
//
// DRIE DINGEN DIE BEWUST EEN *VOORSTEL* ZIJN EN GEEN WAARHEID:
//
//  1. Het rendement (liter most per 100 kg druiven) is een vuistregel. Het
//     hangt af van pers, ras, rijpheid en hoe hard je perst. De app toont het
//     als aanpasbare aanname mét het getal in beeld, nooit als vaststaand feit.
//  2. De startdichtheid komt uit VELDmetingen (refractometer op een handvol
//     trossen), niet uit een most-monster na het persen. Die twee verschillen
//     in de praktijk. Daarom wordt de meetdatum er altijd bij getoond.
//  3. De samenstelling is gebaseerd op geregistreerde kilo's. Wie niet alles
//     woog, krijgt een scheve verhouding — vandaar dat het aantal oogstregels
//     waarop het voorstel rust, zichtbaar is.
//
// Alles is dus overschrijfbaar in het formulier. Het doel is tikwerk besparen
// en de koppeling laten ontstaan, niet de kelderman vertellen wat waar is.

import { vanBrix } from "./dichtheid";
import { meetwaarde } from "./meetwaarde";

/** Liter most per 100 kg druiven — vuistregel, in de UI aanpasbaar. */
export const STANDAARD_RENDEMENT_L_PER_100KG = 70;

/**
 * Hoe oud mag een veldmeting zijn om nog iets over de oogstdichtheid te zeggen?
 *
 * GEVONDEN TIJDENS HET TESTEN (26 juli 2026), en de reden dat deze grens
 * bestaat: een rij waarvan de laatste bruikbare Brix-meting van 14 JUNI was,
 * bepaalde mee de startdichtheid van een oogst op 20 SEPTEMBER. De regel
 * "gebruik de laatste meting vóór de oogst" leek redelijk, maar zonder
 * bovengrens pakt hij net zo lief een meting van vóór de véraison — een moment
 * waarop de suikeropbouw nog niet eens begonnen is. Het voorstel oogde
 * geloofwaardig (één getal, netjes gewogen) en was inhoudelijk onzin.
 *
 * Drie weken is ruim genoeg om een normale meetronde vóór de pluk te vangen, en
 * kort genoeg om een meting van een heel ander groeistadium buiten te sluiten.
 * Rijen die afvallen worden geteld en getoond, niet stilzwijgend genegeerd.
 */
export const MAX_MEETOUDERDOM_DAGEN = 21;

const MS_PER_DAG = 86400000;

function dagenVerschil(van: string, tot: string): number | null {
  const a = new Date(`${van}T00:00:00Z`).getTime();
  const b = new Date(`${tot}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MS_PER_DAG);
}

export interface OogstPost {
  id: string;
  rij?: string | null;
  ras: string;
  datum: string;
  kg: number;
  partij?: string | null;
}

/** Een veldmeting; alleen `brix` doet hier iets. */
export interface RijpheidsMeting {
  rij: string;
  datum: string;
  brix?: number | null;
}

export interface RasAandeel {
  ras: string;
  kg: number;
  /** 0–100, afgerond op hele procenten. */
  aandeel: number;
}

export interface DichtheidVoorstel {
  brix: number;
  oechsle: number;
  sg: number;
  /** Datum van de oudste meting die is meegewogen. */
  vanDatum: string;
  /** Datum van de meest recente meting die is meegewogen. */
  totDatum: string;
  /** Hoeveel rijen een bruikbare meting hadden. */
  rijenMetMeting: number;
  /** Hoeveel rijen in de oogst zaten (noemer voor "hoe compleet is dit"). */
  rijenTotaal: number;
  /** Rijen die alleen een te oude meting hadden (zie MAX_MEETOUDERDOM_DAGEN). */
  rijenTeOud: number;
  /** Ouderdom in dagen van de oudste meegewogen meting, t.o.v. de oogst. */
  oudsteMetingDagen: number;
}

export interface PartijVoorstel {
  /** De oogstregels waarop dit voorstel rust. */
  oogstIds: string[];
  totaalKg: number;
  rassen: RasAandeel[];
  /** Bijv. "Johanniter 60% · Solaris 40%" — direct bruikbaar als samenstelling. */
  samenstelling: string;
  naam: string;
  jaargang: number;
  /** Laatste oogstdatum; het meest waarschijnlijke persmoment. */
  persDatum: string;
  rendement: number;
  startVolumeL: number;
  /** Null als geen enkele betrokken rij een bruikbare Brix-meting had. */
  dichtheid: DichtheidVoorstel | null;
}

function afgerond(n: number, decimalen = 1): number {
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

/**
 * Verdeelt de geoogste kilo's over rassen, grootste eerst.
 *
 * De percentages worden zo afgerond dat ze samen exact 100 zijn: de grootste
 * post vangt het afrondingsverschil op. Zonder die correctie leest een
 * samenstelling als "34% · 33% · 32%" — en dat ziet er op een etiket of in een
 * controledossier uit als een fout.
 */
export function verdeelRassen(oogsten: OogstPost[]): RasAandeel[] {
  const perRas = new Map<string, number>();
  for (const o of oogsten) {
    if (!o.ras || !(o.kg > 0)) continue;
    perRas.set(o.ras, (perRas.get(o.ras) ?? 0) + o.kg);
  }
  const totaal = [...perRas.values()].reduce((s, k) => s + k, 0);
  if (totaal <= 0) return [];

  const lijst = [...perRas.entries()]
    .map(([ras, kg]) => ({ ras, kg: afgerond(kg), aandeel: Math.round((kg / totaal) * 100) }))
    .sort((a, b) => b.kg - a.kg || a.ras.localeCompare(b.ras));

  const som = lijst.reduce((s, r) => s + r.aandeel, 0);
  if (som !== 100 && lijst.length > 0) lijst[0].aandeel += 100 - som;
  return lijst;
}

export function omschrijfSamenstelling(rassen: RasAandeel[]): string {
  return rassen.map((r) => `${r.ras} ${r.aandeel}%`).join(" · ");
}

/**
 * Gewogen startdichtheid uit de laatste veldmeting per betrokken rij.
 *
 * Weging op kilo's, niet het gemiddelde van de rijen: een rij die 400 kg
 * leverde hoort zwaarder te tellen dan een rij die 40 kg leverde. Per rij telt
 * alleen de LAATSTE meting op of vóór de oogstdatum — een meting van ná de
 * oogst gaat over druiven die er niet meer hangen, en een meting van drie weken
 * eerder is achterhaald zodra er een nieuwere is.
 *
 * Brix van 0 wordt via meetwaarde() als "niet gemeten" gelezen (Blok A). Dat is
 * hier belangrijk: één nulmeting zou de gewogen dichtheid omlaag trekken en een
 * partij laten starten op een suikergehalte dat nooit gemeten is.
 */
export function gewogenStartdichtheid(
  oogsten: OogstPost[],
  metingen: RijpheidsMeting[],
): DichtheidVoorstel | null {
  const rijen = new Set(oogsten.map((o) => o.rij).filter((r): r is string => !!r));
  if (rijen.size === 0) return null;

  // kg per rij (een rij kan in meerdere oogstregels voorkomen)
  const kgPerRij = new Map<string, number>();
  const laatsteOogstDatum = new Map<string, string>();
  for (const o of oogsten) {
    if (!o.rij || !(o.kg > 0)) continue;
    kgPerRij.set(o.rij, (kgPerRij.get(o.rij) ?? 0) + o.kg);
    const huidig = laatsteOogstDatum.get(o.rij);
    if (!huidig || o.datum > huidig) laatsteOogstDatum.set(o.rij, o.datum);
  }

  let somGewicht = 0;
  let somBrixMaal = 0;
  let vanDatum = "";
  let totDatum = "";
  let rijenMetMeting = 0;
  let rijenTeOud = 0;
  let oudsteMetingDagen = 0;

  for (const [rij, kg] of kgPerRij) {
    const grens = laatsteOogstDatum.get(rij) ?? "";
    const kandidaten = metingen
      .filter((m) => m.rij === rij)
      .filter((m) => !!m.datum && (!grens || m.datum <= grens))
      .filter((m) => meetwaarde("dichtheid_brix", m.brix) !== null)
      .sort((a, b) => a.datum.localeCompare(b.datum));
    const laatste = kandidaten[kandidaten.length - 1];
    if (!laatste) continue;

    // Te oud = geen meting. Zie MAX_MEETOUDERDOM_DAGEN voor waarom dit erin zit.
    const ouderdom = grens ? dagenVerschil(laatste.datum, grens) : 0;
    if (ouderdom !== null && ouderdom > MAX_MEETOUDERDOM_DAGEN) {
      rijenTeOud++;
      continue;
    }

    const brix = meetwaarde("dichtheid_brix", laatste.brix)!;
    somGewicht += kg;
    somBrixMaal += brix * kg;
    rijenMetMeting++;
    if (ouderdom !== null && ouderdom > oudsteMetingDagen) oudsteMetingDagen = ouderdom;
    if (!vanDatum || laatste.datum < vanDatum) vanDatum = laatste.datum;
    if (!totDatum || laatste.datum > totDatum) totDatum = laatste.datum;
  }

  if (rijenMetMeting === 0 || somGewicht <= 0) return null;

  const brix = afgerond(somBrixMaal / somGewicht, 1);
  const d = vanBrix(brix);
  return {
    brix,
    oechsle: afgerond(d.oechsle, 0),
    sg: d.sg,
    vanDatum,
    totDatum,
    rijenMetMeting,
    rijenTotaal: rijen.size,
    rijenTeOud,
    oudsteMetingDagen,
  };
}

export function schatVolume(totaalKg: number, rendementLPer100Kg: number): number {
  if (!(totaalKg > 0) || !(rendementLPer100Kg > 0)) return 0;
  return Math.round((totaalKg * rendementLPer100Kg) / 100);
}

/**
 * Stelt een naam voor. Eén ras => de rasnaam; meerdere => de grootste met
 * "cuvée" erachter, want dat is wat het dan feitelijk is.
 */
export function stelNaamVoor(rassen: RasAandeel[]): string {
  if (rassen.length === 0) return "";
  if (rassen.length === 1) return rassen[0].ras;
  return `${rassen[0].ras} cuvée`;
}

/**
 * Het volledige voorstel. `rendement` is aanpasbaar zodat het scherm live kan
 * herrekenen wanneer Thomas een andere opbrengst verwacht.
 */
export function stelPartijVoor(
  oogsten: OogstPost[],
  metingen: RijpheidsMeting[],
  rendement: number = STANDAARD_RENDEMENT_L_PER_100KG,
): PartijVoorstel | null {
  const bruikbaar = oogsten.filter((o) => o.kg > 0);
  if (bruikbaar.length === 0) return null;

  const rassen = verdeelRassen(bruikbaar);
  const totaalKg = afgerond(bruikbaar.reduce((s, o) => s + o.kg, 0));
  const persDatum = bruikbaar.map((o) => o.datum).sort()[bruikbaar.length - 1] ?? "";
  const jaargang = Number(persDatum.slice(0, 4)) || new Date().getFullYear();

  return {
    oogstIds: bruikbaar.map((o) => o.id),
    totaalKg,
    rassen,
    samenstelling: omschrijfSamenstelling(rassen),
    naam: stelNaamVoor(rassen),
    jaargang,
    persDatum,
    rendement,
    startVolumeL: schatVolume(totaalKg, rendement),
    dichtheid: gewogenStartdichtheid(bruikbaar, metingen),
  };
}

/** Oogstregels van dit seizoen die nog aan geen enkele partij hangen. */
export function ongekoppeldeOogst(oogsten: OogstPost[], seizoen?: number): OogstPost[] {
  return oogsten
    .filter((o) => !o.partij)
    .filter((o) => (seizoen ? o.datum.startsWith(String(seizoen)) : true))
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.ras.localeCompare(b.ras));
}
