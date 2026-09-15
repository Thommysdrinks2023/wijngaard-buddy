// Oenologische calculators (Fase 7 Blok C). Puur en Node-testbaar; geen
// serverstaat. Alle formules zijn gedocumenteerd in docs/oenologie-formules.md
// met bronvermelding. Elke berekening levert naast het resultaat ook de
// invoerwaarden en de formule-versie terug, zodat een voorstel in het
// kelderlog herleidbaar blijft ("waarop was deze dosering gebaseerd?").

export const FORMULE_VERSIE = "2026-07-16.1";

// ---------- SO₂ ----------
// Moleculair SO₂ via Henderson-Hasselbalch met pKa1 = 1,81 (20 °C).
export function berekenMoleculairSo2(vrijSo2MgL: number, ph: number): number {
  return vrijSo2MgL / (1 + Math.pow(10, ph - 1.81));
}

// Hoeveel vrije SO₂ (mg/L) nodig voor een gewenst moleculair niveau bij deze pH
export function benodigdeVrijeSo2(doelMoleculairMgL: number, ph: number): number {
  return doelMoleculairMgL * (1 + Math.pow(10, ph - 1.81));
}

// KMS (kaliummetabisulfiet) levert praktisch ~57% SO₂ af.
const KMS_SO2_FRACTIE = 0.57;

export interface So2Advies {
  moleculairNu: number;
  doelMoleculair: number;
  benodigdVrijMgL: number;
  toeTeVoegenMgL: number; // verhoging vrije SO₂
  gramSo2: number;
  gramKms: number;
  invoer: { vrijSo2MgL: number; ph: number; volumeL: number; doelMoleculairMgL: number };
  formuleVersie: string;
}

export function berekenSo2Advies(
  vrijSo2MgL: number,
  ph: number,
  volumeL: number,
  doelMoleculairMgL = 0.8,
): So2Advies {
  const moleculairNu = berekenMoleculairSo2(vrijSo2MgL, ph);
  const benodigdVrij = benodigdeVrijeSo2(doelMoleculairMgL, ph);
  const toeTeVoegen = Math.max(0, benodigdVrij - vrijSo2MgL);
  const gramSo2 = (toeTeVoegen * volumeL) / 1000;
  return {
    moleculairNu: rond(moleculairNu, 2),
    doelMoleculair: doelMoleculairMgL,
    benodigdVrijMgL: rond(benodigdVrij, 1),
    toeTeVoegenMgL: rond(toeTeVoegen, 1),
    gramSo2: rond(gramSo2, 1),
    gramKms: rond(gramSo2 / KMS_SO2_FRACTIE, 1),
    invoer: { vrijSo2MgL, ph, volumeL, doelMoleculairMgL },
    formuleVersie: FORMULE_VERSIE,
  };
}

// ---------- YAN / gistvoeding ----------
// Stikstofbehoefteklassen (mg N/L) bij ±12 vol% potentieel; +25 mg/L per
// extra vol% boven 12 (vuistregel naar Butzke/Fermaid-richtlijnen).
export const GIST_N_KLASSEN = { laag: 150, middel: 200, hoog: 250 } as const;
export type GistKlasse = keyof typeof GIST_N_KLASSEN;

export interface YanAdvies {
  behoefteMgL: number;
  tekortMgL: number; // 0 als huidige YAN onbekend of toereikend
  fasen: { moment: string; omschrijving: string }[];
  invoer: {
    oechsle: number;
    gistKlasse: GistKlasse;
    volumeL: number;
    huidigeYanMgL: number | null;
  };
  formuleVersie: string;
}

export function berekenYanAdvies(
  oechsle: number,
  gistKlasse: GistKlasse,
  volumeL: number,
  huidigeYanMgL: number | null = null,
): YanAdvies {
  const potAlc = potentieelAlcohol(oechsle);
  const basis = GIST_N_KLASSEN[gistKlasse];
  const behoefte = Math.round(basis + Math.max(0, potAlc - 12) * 25);
  const tekort = huidigeYanMgL != null ? Math.max(0, behoefte - huidigeYanMgL) : behoefte;
  const fasen = [
    {
      moment: "rehydratatie",
      omschrijving: "Rehydratatievoeding volgens etiket bij het aanmaken van de gist",
    },
    {
      moment: "start gisting (na aanslaan)",
      omschrijving: `±½ van de voedingsgift (${Math.round((tekort * volumeL) / 2000)} g N-equivalent totaalvolume)`,
    },
    {
      moment: "⅓ suikerafbouw",
      omschrijving: `resterende ±½ van de voedingsgift; niet meer voeden na ½ suikerafbouw`,
    },
  ];
  return {
    behoefteMgL: behoefte,
    tekortMgL: rond(tekort, 0),
    fasen,
    invoer: { oechsle, gistKlasse, volumeL, huidigeYanMgL },
    formuleVersie: FORMULE_VERSIE,
  };
}

// ---------- Chaptalisatie ----------
// Potentieel alcohol ≈ °Oe × 0,125 (gangbare benadering).
export function potentieelAlcohol(oechsle: number): number {
  return rond(oechsle * 0.125, 1);
}

// EU-rekenwaarde: 16,83 g suiker per liter per +1 vol% (witte most).
const SUIKER_G_PER_L_PER_VOLPCT = 16.83;

export interface ChaptalisatieAdvies {
  potAlcNu: number;
  verhogingVolPct: number;
  suikerGramPerL: number;
  suikerKgTotaal: number;
  overschrijdtLimiet: boolean | null; // null = limiet niet geverifieerd
  limietVolPct: number | null;
  invoer: { oechsle: number; doelAlcVolPct: number; volumeL: number };
  formuleVersie: string;
}

export function berekenChaptalisatie(
  oechsle: number,
  doelAlcVolPct: number,
  volumeL: number,
  limietVolPct: number | null,
): ChaptalisatieAdvies {
  const potAlcNu = potentieelAlcohol(oechsle);
  const verhoging = Math.max(0, rond(doelAlcVolPct - potAlcNu, 2));
  const gramPerL = rond(verhoging * SUIKER_G_PER_L_PER_VOLPCT, 1);
  return {
    potAlcNu,
    verhogingVolPct: verhoging,
    suikerGramPerL: gramPerL,
    suikerKgTotaal: rond((gramPerL * volumeL) / 1000, 2),
    overschrijdtLimiet: limietVolPct == null ? null : verhoging > limietVolPct,
    limietVolPct,
    invoer: { oechsle, doelAlcVolPct, volumeL },
    formuleVersie: FORMULE_VERSIE,
  };
}

// ---------- Zuurcorrectie ----------
// Aanzuren: +1,0 g/L wijnsteenzuur verhoogt het totaalzuur met ±1,0 g/L.
// Ontzuren: 0,67 g/L CaCO₃ (of dubbelzout volgens etiket) verlaagt ±1,0 g/L.
const CACO3_G_PER_G_L = 0.67;

export interface ZuurAdvies {
  richting: "aanzuren" | "ontzuren";
  deltaGL: number;
  middel: string;
  gramPerL: number;
  kgTotaal: number;
  overschrijdtLimiet: boolean | null;
  limietGL: number | null;
  invoer: { huidigZuurGL: number; doelZuurGL: number; volumeL: number };
  formuleVersie: string;
}

export function berekenZuurcorrectie(
  huidigZuurGL: number,
  doelZuurGL: number,
  volumeL: number,
  limietAanzurenGL: number | null,
  limietOntzurenGL: number | null,
): ZuurAdvies {
  const delta = rond(doelZuurGL - huidigZuurGL, 2);
  if (delta >= 0) {
    const gramPerL = rond(delta, 2);
    return {
      richting: "aanzuren",
      deltaGL: delta,
      middel: "wijnsteenzuur",
      gramPerL,
      kgTotaal: rond((gramPerL * volumeL) / 1000, 2),
      overschrijdtLimiet: limietAanzurenGL == null ? null : delta > limietAanzurenGL,
      limietGL: limietAanzurenGL,
      invoer: { huidigZuurGL, doelZuurGL, volumeL },
      formuleVersie: FORMULE_VERSIE,
    };
  }
  const verlaging = Math.abs(delta);
  const gramPerL = rond(verlaging * CACO3_G_PER_G_L, 2);
  return {
    richting: "ontzuren",
    deltaGL: delta,
    middel: "kalk (CaCO₃) of dubbelzout",
    gramPerL,
    kgTotaal: rond((gramPerL * volumeL) / 1000, 2),
    overschrijdtLimiet: limietOntzurenGL == null ? null : verlaging > limietOntzurenGL,
    limietGL: limietOntzurenGL,
    invoer: { huidigZuurGL, doelZuurGL, volumeL },
    formuleVersie: FORMULE_VERSIE,
  };
}

function rond(v: number, dec: number): number {
  const f = Math.pow(10, dec);
  return Math.round(v * f) / f;
}
