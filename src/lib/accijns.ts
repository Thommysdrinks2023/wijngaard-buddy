// Eindsprint Blok K — accijnsberekening als PURE functie (zelfde patroon als
// dichtheid.ts/voedingswaarde.ts/lotnummer.ts: geen serverstaat, dus met Node
// te testen zonder login). Elke uitkomst is een INDICATIE — de app rekent
// alleen als het tarief een waarde én een "laatst gecontroleerd"-datum heeft,
// en de UI hoort er altijd "indicatie — controleer bij aangifte" bij te tonen.

import type { AccijnsCategorie, Bottelronde, VoorraadMutatie } from "./types";

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

// ---------------------------------------------------------------------------
// Belastbaar moment BOTTELING (Fase 15 Blok D, 15 september 2026).
//
// De Tappenmars draagt de accijns af bij botteling, niet bij uitslag (zo
// genoteerd bij de Douane, zie ARCHITECTURE.md §9). Het overzicht hierboven
// rekent bedragen uit verkoop/eigen gebruik; dat is de grondslag voor
// `accijns_belastbaar_moment = "uitslag"`. Hieronder de grondslag voor
// `"botteling"`: per bottelronde het accijnsplichtige volume, gegroepeerd op
// de bij het bottelen bevestigde categorie. Welke van de twee de pagina toont
// bepaalt de instelling — de aangifte zelf blijft altijd handwerk.
//
// Een bottelronde ZONDER categorie krijgt geen bedrag en wordt apart gemeld:
// een stil nulbedrag zou bij een controle een onderbetaling verbergen.

export type BelastbaarMoment = "botteling" | "uitslag";

export function leesBelastbaarMoment(waardeTekst: string | null | undefined): BelastbaarMoment {
  return (waardeTekst ?? "").trim().toLowerCase() === "uitslag" ? "uitslag" : "botteling";
}

/** Liters waarover bij deze bottelronde is afgedragen. */
export function accijnsplichtigeLiters(b: Bottelronde): number {
  if ((b.accijnsplichtig_volume_l ?? 0) > 0) return b.accijnsplichtig_volume_l as number;
  // Bottelrondes van vóór Blok C hebben het veld niet: wat in de flessen zit.
  const flessen = b.aantal_flessen_gevuld || b.aantal_flessen;
  return (flessen * b.flesinhoud_ml) / 1000;
}

export interface AccijnsCategorieRegel {
  categorie: AccijnsCategorie;
  flessen: number;
  liters: number;
  tarief: Tarief | null;
  /** null zolang het tarief van deze categorie niet geverifieerd is */
  bedragEur: number | null;
}

export interface AccijnsBijBotteling {
  /** Alleen categorieën met volume in de periode, in de beheerde volgorde. */
  accijns: AccijnsCategorieRegel[];
  /** Andere heffing, andere aangifte — nooit bij de accijns optellen. */
  verbruiksbelasting: AccijnsCategorieRegel[];
  /** Som van de accijnsregels; null zodra één tarief ontbreekt. */
  totaalAccijnsEur: number | null;
  totaalLiters: number;
  totaalFlessen: number;
  /** Bottelrondes in de periode zonder (bekende) categorie: geen bedrag, wél melden. */
  zonderCategorie: { bottelrondeId: string; botteldatum: string; liters: number }[];
}

const rond2 = (n: number) => Math.round(n * 100) / 100;

export function berekenAccijnsBijBotteling(opties: {
  periode: AccijnsPeriode;
  bottelrondes: Bottelronde[];
  categorieen: AccijnsCategorie[];
  tariefPerSleutel: Map<string, Tarief | null>;
}): AccijnsBijBotteling {
  const { periode } = opties;
  const perCategorie = new Map<string, { flessen: number; liters: number }>();
  const zonderCategorie: AccijnsBijBotteling["zonderCategorie"] = [];
  const bekend = new Set(opties.categorieen.map((c) => c.id));
  let totaalLiters = 0;
  let totaalFlessen = 0;

  for (const b of opties.bottelrondes) {
    if (b.botteldatum < periode.van || b.botteldatum > periode.tot) continue;
    const liters = accijnsplichtigeLiters(b);
    const flessen = b.aantal_flessen_gevuld || b.aantal_flessen;
    totaalLiters += liters;
    totaalFlessen += flessen;
    if (!b.accijns_categorie || !bekend.has(b.accijns_categorie)) {
      zonderCategorie.push({
        bottelrondeId: b.id,
        botteldatum: b.botteldatum,
        liters: rond2(liters),
      });
      continue;
    }
    const som = perCategorie.get(b.accijns_categorie) ?? { flessen: 0, liters: 0 };
    som.flessen += flessen;
    som.liters += liters;
    perCategorie.set(b.accijns_categorie, som);
  }

  const regels: AccijnsCategorieRegel[] = [];
  for (const categorie of opties.categorieen) {
    const som = perCategorie.get(categorie.id);
    if (!som) continue;
    const tarief = opties.tariefPerSleutel.get(categorie.tariefsleutel) ?? null;
    regels.push({
      categorie,
      flessen: som.flessen,
      liters: rond2(som.liters),
      tarief,
      bedragEur: tariefGeverifieerd(tarief)
        ? rond2((som.liters / 100) * (tarief!.waarde as number))
        : null,
    });
  }

  const accijns = regels.filter((r) => r.categorie.heffing === "accijns");
  const verbruiksbelasting = regels.filter((r) => r.categorie.heffing === "verbruiksbelasting");
  const totaalAccijnsEur = accijns.some((r) => r.bedragEur == null)
    ? null
    : rond2(accijns.reduce((acc, r) => acc + (r.bedragEur as number), 0));

  return {
    accijns,
    verbruiksbelasting,
    totaalAccijnsEur,
    totaalLiters: rond2(totaalLiters),
    totaalFlessen,
    zonderCategorie,
  };
}
