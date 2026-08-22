// Fase 14 Blok C — gistingsprogramma (temperatuurcurve per partij).
//
// AANLEIDING: een gisting op één vaste temperatuur zetten is een versimpeling
// — in de praktijk wil je vaak koel starten, warm laten doorgisten en aan het
// eind weer afkoelen. Dat is een CURVE, geen getal. Dit is grotendeels
// software en nu al bruikbaar zonder hardware: als iets om tegen af te lezen
// ("we zaten 2° boven programma"), ook vóórdat er een sensor hangt die het
// automatisch checkt.
//
// TWEE ANKERTYPES, EXPRES BEIDE ONDERSTEUND: gisting verloopt niet lineair in
// tijd — twee identieke partijen op een verschillende dag gestart lopen qua
// KALENDERDATUM uit elkaar, maar qua DICHTHEIDSVERLOOP vaak gelijk op. Een
// programma dat alleen op tijd verankert ("dag 3: 22°C") is dus soms handiger
// (je weet vooraf wanneer je iets moet doen) en een programma op dichtheid
// ("bij 40 °Oe: 22°C") is soms handiger (het volgt de gisting zelf, ongeacht
// vertraging). Geen van beide dekt alles, dus allebei.
//
// "Dag" is dagen sinds pers_datum, geen absolute datum: dat maakt een
// programma herbruikbaar tussen partijen en jaren ("dag 0-2 koel, dag 3-7
// warm") zonder dat je voor elke partij een nieuwe datum hoeft te typen.

export type ProgrammaAnker = "dag" | "dichtheid";

export interface ProgrammaPunt {
  anker: ProgrammaAnker;
  /** Dagen sinds pers_datum. Alleen bij anker "dag". Geheel getal, kan 0 zijn. */
  dag?: number;
  /** °Oechsle. Alleen bij anker "dichtheid". */
  oechsle?: number;
  temperatuur_c: number;
}

export interface TemperatuurProgramma {
  punten: ProgrammaPunt[];
  /** Vrije toelichting, bijv. "Muscaris-schema 2025, werkte goed". */
  notitie?: string;
}

const MS_PER_DAG = 86400000;

function dagNaarDatum(persDatum: string, dag: number): string {
  const t = new Date(`${persDatum}T00:00:00Z`).getTime() + dag * MS_PER_DAG;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Valideert één punt. Retourneert een foutmelding of null (geldig).
 * Grenzen zijn ruim: dit bewaakt tikfouten, niet oenologische keuzes.
 */
export function valideerProgrammaPunt(p: ProgrammaPunt): string | null {
  if (p.anker !== "dag" && p.anker !== "dichtheid") return "Kies een ankertype.";
  if (p.anker === "dag") {
    if (p.dag === undefined || p.dag === null || Number.isNaN(p.dag)) return "Vul een dag in.";
    if (p.dag < 0 || p.dag > 365) return "Dag moet tussen 0 en 365 liggen.";
  } else {
    if (p.oechsle === undefined || p.oechsle === null || Number.isNaN(p.oechsle))
      return "Vul een °Oechsle-niveau in.";
    if (p.oechsle < 0 || p.oechsle > 200) return "°Oechsle moet tussen 0 en 200 liggen.";
  }
  if (
    p.temperatuur_c === undefined ||
    p.temperatuur_c === null ||
    Number.isNaN(p.temperatuur_c) ||
    p.temperatuur_c < -5 ||
    p.temperatuur_c > 40
  ) {
    return "Temperatuur moet tussen -5 en 40 °C liggen.";
  }
  return null;
}

export function valideerProgramma(programma: TemperatuurProgramma): string[] {
  return programma.punten.map(valideerProgrammaPunt).filter((f): f is string => f !== null);
}

/** Voor de invoer-UI: nieuwe punten horen op datum/dichtheid gesorteerd te staan. */
export function sorteerPunten(punten: ProgrammaPunt[]): ProgrammaPunt[] {
  return [...punten].sort((a, b) => {
    const sleutel = (p: ProgrammaPunt) => (p.anker === "dag" ? (p.dag ?? 0) : (p.oechsle ?? 0));
    // dag-ankers vóór dichtheid-ankers bij gelijke sleutel, voor stabiele UI-volgorde
    if (a.anker !== b.anker) return a.anker === "dag" ? -1 : 1;
    return sleutel(a) - sleutel(b);
  });
}

export interface ProgrammaLijnPunt {
  datum: string;
  temperatuur_programma: number;
}

/**
 * Zet het programma om naar (datum, temperatuur)-punten voor op de grafiek.
 *
 * DAG-ANKERS zijn direct om te rekenen zodra er een pers_datum is.
 *
 * DICHTHEID-ANKERS hebben geen eigen datum — die krijgen er een via de
 * ECHTE dichtheidsmetingen: het punt in `dichtheidSerie` waarvan de Oechsle
 * het dichtst bij het ankerniveau ligt. Is dat niveau nog niet bereikt (de
 * gisting zit er nog niet), dan levert dit ankertype nog geen punt op — dat
 * is geen fout, het programma blijft gewoon ingesteld en verschijnt zodra de
 * meting er is. Geen extrapolatie: een verzonnen datum voor een nog niet
 * bereikt dichtheidsniveau zou een programma-punt tonen dat niet klopt.
 */
export function programmaAlsLijn(
  programma: TemperatuurProgramma | null | undefined,
  persDatum: string | null | undefined,
  dichtheidSerie: { datum: string; dichtheid_oechsle?: number }[],
): ProgrammaLijnPunt[] {
  if (!programma?.punten?.length) return [];
  const resultaat: ProgrammaLijnPunt[] = [];

  const metMeting = dichtheidSerie.filter(
    (p): p is { datum: string; dichtheid_oechsle: number } => p.dichtheid_oechsle !== undefined,
  );

  for (const punt of programma.punten) {
    if (valideerProgrammaPunt(punt) !== null) continue; // sla ongeldige/onvolledige punten stil over

    if (punt.anker === "dag") {
      if (!persDatum) continue; // geen ankerpunt in de tijd zonder persdatum
      resultaat.push({
        datum: dagNaarDatum(persDatum, punt.dag!),
        temperatuur_programma: punt.temperatuur_c,
      });
    } else {
      if (metMeting.length === 0) continue;
      let dichtstbij = metMeting[0];
      let kleinsteVerschil = Math.abs(metMeting[0].dichtheid_oechsle - punt.oechsle!);
      for (const m of metMeting) {
        const verschil = Math.abs(m.dichtheid_oechsle - punt.oechsle!);
        if (verschil < kleinsteVerschil) {
          kleinsteVerschil = verschil;
          dichtstbij = m;
        }
      }
      resultaat.push({ datum: dichtstbij.datum, temperatuur_programma: punt.temperatuur_c });
    }
  }

  // Op datum sorteren en samenvoegen: twee ankers die op dezelfde dag
  // uitkomen (bijv. een dag-anker en een dichtheid-anker die toevallig samen-
  // vallen) leveren anders twee punten op dezelfde x-waarde — dat verwart een
  // lijngrafiek meer dan het verheldert. Laatste wint (typisch de bewuste
  // instelling, niet een toevalstreffer).
  const perDatum = new Map(resultaat.map((p) => [p.datum, p]));
  return [...perDatum.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}
