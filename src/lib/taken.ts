// Fase 13 Blok C — taken kunnen afronden.
//
// AANLEIDING: een taak was een kelderlogregel waarvan de notitie met "TAAK:"
// begint, zonder afrondstatus. Je kon hem alleen uitstellen of wegklikken.
// De SO₂-nametingtaak van 19 juli stond op 25 juli nog te zeuren, en de
// meting dóén sloot hem niet. Zo leer je jezelf aan meldingen weg te tikken,
// en dan is de Vandaag-widget over een maand meubilair.
//
// UITGEZOCHT VOORAF (zoals de opdracht eiste):
//
//  1. Er zijn GEEN twee concurrerende taakbegrippen. De calculators schrijven
//     rechtstreeks een kelderlogregel met "TAAK:"; de signaalpromotie uit
//     Fase 10 maakt een agent_acties-VOORSTEL dat na bevestiging óók een
//     kelderlogregel schrijft (agent_uitvoering.js, case "kelderlog").
//     agent_acties is dus een bevestigingsmechanisme, geen tweede taakmodel.
//     LEIDEND BEGRIP: de kelderlogregel met "TAAK:"-prefix.
//
//  2. Het kelderlog is NIET onwijzigbaar. Alleen `tankboek` heeft
//     create/update/delete = null; kelderlog draait op AUTH_RULE. Het is een
//     werklogboek (ARCHITECTURE.md §1.6), geen wettelijk register.
//
// KEUZE: afronden via STATUSVELDEN op de taakregel zelf, niet via een tweede
// "afgerond"-regel. Motivatie: de afronding is een eigenschap van die taak,
// geen los werkfeit. Een extra regel zou het werklogboek vervuilen met
// gebeurtenissen die geen werk zijn, en je zou twee regels moeten koppelen om
// de status te kennen. De oorspronkelijke `notitie` wordt nooit herschreven —
// alleen aparte velden ernaast worden gezet.
//
// AUTOMATISCH SLUITEN is een ALGEMEEN mechanisme, geen SO₂-uitzondering: de
// taak draagt in `taak_sluit_bij` een verwijzing naar de gebeurtenis die hem
// sluit. Dat wordt BEREKEND, niet weggeschreven — zelfde principe als de
// signaallaag (Fase 10): geen schrijfactie tijdens het renderen, en de
// uitkomst corrigeert zichzelf als er later data bijkomt of verdwijnt.

export const TAAK_PREFIX = "TAAK:";

export type TaakUrgentie = "toekomst" | "binnenkort" | "vandaag" | "te_laat";

export interface TaakRegel {
  id: string;
  datum: string; // yyyy-MM-dd, geplande datum
  notitie: string;
  partij?: string | null;
  taak_status?: string; // "" | "open" | "afgerond"
  taak_afgerond_op?: string;
  taak_afgerond_door?: string;
  /** Bijv. "analyse:so2_vrij" — zie sluitregelVoldaan(). */
  taak_sluit_bij?: string;
}

/** Een gebeurtenis die een taak kan sluiten. */
export interface SluitGebeurtenis {
  soort: string; // "analyse"
  datum: string; // yyyy-MM-dd
  partij?: string | null;
  /** Welke velden bij deze gebeurtenis daadwerkelijk gemeten/ingevuld zijn. */
  velden: Set<string>;
  id: string;
}

export interface TaakStatus {
  taak: TaakRegel;
  /** Tekst van de taak zonder de "TAAK:"-prefix. */
  omschrijving: string;
  afgerond: boolean;
  /** "handmatig" of "automatisch"; leeg als de taak nog open staat. */
  afgerondWijze: "" | "handmatig" | "automatisch";
  afgerondOp: string;
  afgerondDoor: string;
  urgentie: TaakUrgentie;
  /** Positief = zoveel dagen te laat; 0 = vandaag; negatief = nog te gaan. */
  dagenTeLaat: number;
}

const MS_PER_DAG = 86400000;

function dagenTussen(van: string, tot: string): number {
  const a = new Date(`${van}T00:00:00Z`).getTime();
  const b = new Date(`${tot}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAG);
}

export function isTaak(notitie: string | undefined | null): boolean {
  return Boolean(notitie?.trimStart().startsWith(TAAK_PREFIX));
}

export function taakOmschrijving(notitie: string): string {
  return notitie.trimStart().slice(TAAK_PREFIX.length).trim();
}

/**
 * Voldoet een gebeurtenis aan de sluitregel van deze taak?
 * Regelformaat: "<soort>:<veld>" — bijv. "analyse:so2_vrij" betekent: een
 * analyse voor dezelfde partij waarin het veld so2_vrij daadwerkelijk gemeten
 * is, op of ná de geplande taakdatum.
 */
export function sluitregelVoldaan(taak: TaakRegel, gebeurtenis: SluitGebeurtenis): boolean {
  const regel = (taak.taak_sluit_bij ?? "").trim();
  if (!regel) return false;
  const [soort, veld] = regel.split(":").map((s) => s.trim());
  if (!soort || gebeurtenis.soort !== soort) return false;
  // Een gebeurtenis van vóór de taak kan hem niet afsluiten: die was er al
  // toen de taak werd ingepland.
  if (gebeurtenis.datum < taak.datum) return false;
  // Taak hoort bij een partij? Dan telt alleen een gebeurtenis van die partij.
  if (taak.partij && gebeurtenis.partij && gebeurtenis.partij !== taak.partij) return false;
  if (veld && !gebeurtenis.velden.has(veld)) return false;
  return true;
}

function urgentieVan(dagenTeLaat: number): TaakUrgentie {
  if (dagenTeLaat > 0) return "te_laat";
  if (dagenTeLaat === 0) return "vandaag";
  if (dagenTeLaat >= -7) return "binnenkort";
  return "toekomst";
}

/**
 * Bepaalt de status van één taak: handmatig afgerond, automatisch afgerond
 * door een gebeurtenis, of nog open — met de achterstand in dagen.
 */
export function bepaalTaakStatus(
  taak: TaakRegel,
  gebeurtenissen: SluitGebeurtenis[],
  vandaag: string,
): TaakStatus {
  const dagenTeLaat = dagenTussen(taak.datum, vandaag);
  const basis = {
    taak,
    omschrijving: taakOmschrijving(taak.notitie ?? ""),
    urgentie: urgentieVan(dagenTeLaat),
    dagenTeLaat,
  };

  // Handmatig afvinken wint: als iemand zegt dat het gedaan is, is het gedaan.
  if (taak.taak_status === "afgerond") {
    return {
      ...basis,
      afgerond: true,
      afgerondWijze: "handmatig",
      afgerondOp: taak.taak_afgerond_op ?? "",
      afgerondDoor: taak.taak_afgerond_door ?? "",
    };
  }

  // Anders: is er een gebeurtenis die aan de sluitregel voldoet?
  const sluiters = gebeurtenissen
    .filter((g) => sluitregelVoldaan(taak, g))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  if (sluiters.length > 0) {
    const g = sluiters[0];
    return {
      ...basis,
      afgerond: true,
      afgerondWijze: "automatisch",
      afgerondOp: g.datum,
      afgerondDoor: `automatisch — ${g.soort} van ${g.datum}`,
    };
  }

  return { ...basis, afgerond: false, afgerondWijze: "", afgerondOp: "", afgerondDoor: "" };
}

/** Korte tekst over de achterstand, voor op het scherm. */
export function omschrijfAchterstand(status: TaakStatus): string {
  const d = status.dagenTeLaat;
  if (d > 0) return `${d} ${d === 1 ? "dag" : "dagen"} te laat`;
  if (d === 0) return "vandaag";
  const teGaan = -d;
  return `over ${teGaan} ${teGaan === 1 ? "dag" : "dagen"}`;
}
