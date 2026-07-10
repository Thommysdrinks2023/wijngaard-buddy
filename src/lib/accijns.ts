// Eindsprint Blok K — accijnsberekening als PURE functie (zelfde patroon als
// dichtheid.ts/voedingswaarde.ts/lotnummer.ts: geen serverstaat, dus met Node
// te testen zonder login). Elke uitkomst is een INDICATIE — de app rekent
// alleen als het tarief een waarde én een "laatst gecontroleerd"-datum heeft,
// en de UI hoort er altijd "indicatie — controleer bij aangifte" bij te tonen.

import type { Bottelronde, VoorraadMutatie } from "./types";

export interface AccijnsPeriode {
  van: string; // yyyy-MM-dd, inclusief
  tot: string; // yyyy-MM-dd, inclusief
}

export interface Tarief {
  waarde: number | null; // EUR per hectoliter
  laatst_gecontroleerd: string | null; // yyyy-MM-dd
  geldig_vanaf?: string | null;
}

export function tariefGeverifieerd(t: Tarief | null | undefined): boolean {
  return !!t && (t.waarde ?? 0) > 0 && !!t.laatst_gecontroleerd;
}

export interface AccijnsUitslag {
  flessen: number;
  liters: number;
}

export interface AccijnsOverzicht {
  gebotteldLiters: number;
  gebotteldFlessen: number;
  uitslagStil: AccijnsUitslag; // verkocht + eigen gebruik, niet-parelwijn
  uitslagMousserend: AccijnsUitslag; // idem, parelwijn
  breuk: { flessen: number; regels: { datum: string; aantal: number; reden: string }[] };
  beginvoorraadFlessen: number;
  eindvoorraadFlessen: number;
  // null zolang het bijbehorende tarief niet geverifieerd is
  accijnsStilEur: number | null;
  accijnsMousserendEur: number | null;
  partijenZonderAlcohol: string[]; // partijnamen zonder alcohol% in de laatste analyse
}

const UITSLAG_TYPES = new Set(["verkocht", "eigen_gebruik"]);

/**
 * Rekent één aangifteperiode door uit de append-only administratie.
 * `flesinhoudPerVoorraad` en `parelwijnPerVoorraad` komen uit de bottelronde
 * van elk voorraadrecord; `alcoholPerPartij` uit de laatste analyse (null =
 * ontbreekt, wordt gemarkeerd via partijnaamPerVoorraad).
 */
export function berekenAccijnsOverzicht(opties: {
  periode: AccijnsPeriode;
  bottelrondes: Bottelronde[];
  mutaties: VoorraadMutatie[];
  flesinhoudPerVoorraad: Map<string, number>; // ml
  parelwijnPerVoorraad: Map<string, boolean>;
  partijnaamPerVoorraad: Map<string, string>;
  alcoholPerPartijnaam: Map<string, number | null>;
  tariefStil: Tarief | null;
  tariefMousserend: Tarief | null;
}): AccijnsOverzicht {
  const { periode } = opties;
  const inPeriode = (datum: string) => datum >= periode.van && datum <= periode.tot;
  const voorPeriode = (datum: string) => datum < periode.van;

  // Gebotteld in de periode
  let gebotteldLiters = 0;
  let gebotteldFlessen = 0;
  for (const b of opties.bottelrondes) {
    if (!inPeriode(b.botteldatum)) continue;
    gebotteldFlessen += b.aantal_flessen;
    gebotteldLiters += (b.aantal_flessen * b.flesinhoud_ml) / 1000;
  }

  // Uitslagen + breuk in de periode
  const uitslagStil: AccijnsUitslag = { flessen: 0, liters: 0 };
  const uitslagMousserend: AccijnsUitslag = { flessen: 0, liters: 0 };
  const breukRegels: { datum: string; aantal: number; reden: string }[] = [];
  let breukFlessen = 0;
  for (const m of opties.mutaties) {
    if (!inPeriode(m.datum)) continue;
    const flesMl = opties.flesinhoudPerVoorraad.get(m.voorraad) ?? 750;
    const aantalAf = Math.abs(m.aantal);
    if (UITSLAG_TYPES.has(m.mutatie_type)) {
      const doel = opties.parelwijnPerVoorraad.get(m.voorraad) ? uitslagMousserend : uitslagStil;
      doel.flessen += aantalAf;
      doel.liters += (aantalAf * flesMl) / 1000;
    } else if (m.mutatie_type === "kapot") {
      breukFlessen += aantalAf;
      breukRegels.push({
        datum: m.datum,
        aantal: aantalAf,
        reden: m.afnemer_of_reden || m.notities || "(geen reden vastgelegd)",
      });
    }
  }

  // Begin-/eindvoorraad in flessen: som van bottelingen en mutaties tot de grens
  let begin = 0;
  for (const b of opties.bottelrondes) if (voorPeriode(b.botteldatum)) begin += b.aantal_flessen;
  for (const m of opties.mutaties) if (voorPeriode(m.datum)) begin += m.aantal; // mutaties zijn getekend
  let eind = begin;
  for (const b of opties.bottelrondes) if (inPeriode(b.botteldatum)) eind += b.aantal_flessen;
  for (const m of opties.mutaties) if (inPeriode(m.datum)) eind += m.aantal;

  // Ontbrekende alcohol% markeren (aangifte vraagt om %vol per soort)
  const zonderAlcohol = new Set<string>();
  for (const m of opties.mutaties) {
    if (!inPeriode(m.datum) || !UITSLAG_TYPES.has(m.mutatie_type)) continue;
    const naam = opties.partijnaamPerVoorraad.get(m.voorraad);
    if (naam && (opties.alcoholPerPartijnaam.get(naam) ?? null) == null) zonderAlcohol.add(naam);
  }

  const rekenAccijns = (uitslag: AccijnsUitslag, tarief: Tarief | null): number | null => {
    if (!tariefGeverifieerd(tarief)) return null;
    // tarief is EUR per hectoliter; afronden op de cent
    return Math.round((uitslag.liters / 100) * (tarief!.waarde as number) * 100) / 100;
  };

  return {
    gebotteldLiters: Math.round(gebotteldLiters * 100) / 100,
    gebotteldFlessen,
    uitslagStil: { ...uitslagStil, liters: Math.round(uitslagStil.liters * 100) / 100 },
    uitslagMousserend: {
      ...uitslagMousserend,
      liters: Math.round(uitslagMousserend.liters * 100) / 100,
    },
    breuk: { flessen: breukFlessen, regels: breukRegels },
    beginvoorraadFlessen: begin,
    eindvoorraadFlessen: eind,
    accijnsStilEur: rekenAccijns(uitslagStil, opties.tariefStil),
    accijnsMousserendEur: rekenAccijns(uitslagMousserend, opties.tariefMousserend),
    partijenZonderAlcohol: Array.from(zonderAlcohol),
  };
}

// Periode-helpers: maand of kwartaal binnen een jaar.
export function maandPeriode(jaar: number, maand: number): AccijnsPeriode {
  const laatste = new Date(jaar, maand, 0).getDate();
  const mm = String(maand).padStart(2, "0");
  return { van: `${jaar}-${mm}-01`, tot: `${jaar}-${mm}-${String(laatste).padStart(2, "0")}` };
}

export function kwartaalPeriode(jaar: number, kwartaal: number): AccijnsPeriode {
  const startMaand = (kwartaal - 1) * 3 + 1;
  const eindMaand = startMaand + 2;
  return { van: maandPeriode(jaar, startMaand).van, tot: maandPeriode(jaar, eindMaand).tot };
}
