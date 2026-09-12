// Fase 17 Blok B — drukveiligheid. Puur en getest, zoals pasteurisatie.ts.
// Veiligheidskritisch: bij twijfel kiest deze module de uitkomst die de
// hoogste druk voorspelt (zie CLAUDE.md-veiligheidskader). Alle formules en
// bronnen staan in docs/pasteurisatie-formules.md.
//
// BELANGRIJK — geschiedenis van dit model (zie WERKLOG.md, Fase 17): het
// eerder veronderstelde ijkpunt "2,2 bar bij 10 °C wordt ~8 bar bij 48 °C"
// bleek zelf een eerdere BEREKENING te zijn, geen gemeten flesdruk — Thomas
// heeft dat expliciet bevestigd. Dat getal wordt daarom NERGENS in dit
// bestand als ijkpunt gebruikt. Het enige harde, empirische gegeven is dat
// het 750 ml BVS-formaat met 6 bar-doppen bij een te hoog vulniveau
// daadwerkelijk is bezweken (doppen + barstend glas) — d.w.z. de werkelijke
// druk kwam AANTOONBAAR boven 6 bar uit. Dat scenario is de enige
// validatietoets met een hard, bekend antwoord (zie de test
// "historisch faalscenario").
//
// Model: een gekoppelde massabalans (vloeistof + kopruimte, CO2-verdeling
// volgens Henry, thermische uitzetting van de vloeistof, waterdampdruk) plus
// een conservatieve bovengrens die NOOIT lager uitkomt dan het gekoppelde
// model. Het veiligheidsoordeel gebruikt altijd de bovengrens (op expliciet
// verzoek van Thomas, 1 september 2026): een valse waarschuwing kost een
// gesprek, een gemiste waarschuwing kost glas of letsel.
//
// Elk resultaat draagt `gevalideerd: false` tot Thomas een echte, nagemeten
// run heeft bevestigd (zie Blok H/I).

export const DRUKVEILIGHEID_NIET_GEVALIDEERD =
  "Dit drukmodel is nog niet gevalideerd tegen een echte, gemeten flesdruk.";

const ATM_BAR = 1.01325;
const R = 8.314; // J/(mol·K)
const M_CO2 = 44.01; // g/mol

// ---------- Waterdampdruk (Antoine-vergelijking, geldig 1–100 °C) ----------
// Bron: NIST Chemistry WebBook, Antoine-constanten voor water (Stull, 1947):
// A=8,07131 B=1730,63 C=233,426, log10(P in mmHg) = A - B/(C+T).
// Gecontroleerd tegen de vuistwaarde uit de opdracht: bij 48 °C geeft dit
// ≈0,1115 bar, tegen de genoemde "circa 0,11 bar" — dat klopt.
export function waterdampdrukBar(temperatuurC: number): number {
  const A = 8.07131;
  const B = 1730.63;
  const C = 233.426;
  const pMmHg = Math.pow(10, A - B / (C + temperatuurC));
  return pMmHg * 0.00133322;
}

// ---------- Thermische uitzetting van water ----------
// Bron: standaard dichtheidstabel van water (bijv. CRC Handbook of Chemistry
// and Physics), lineair geïnterpoleerd tussen tabelwaarden (kg/m³).
const DICHTHEID_TABEL: [number, number][] = [
  [0, 999.84],
  [10, 999.7],
  [20, 998.21],
  [25, 997.05],
  [30, 995.65],
  [35, 994.03],
  [40, 992.21],
  [45, 990.22],
  [50, 988.03],
  [55, 985.69],
  [60, 983.2],
  [70, 977.76],
  [80, 971.79],
];

function dichtheidWater(temperatuurC: number): number {
  const t = DICHTHEID_TABEL;
  if (temperatuurC <= t[0][0]) return t[0][1];
  if (temperatuurC >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) {
    if (temperatuurC <= t[i][0]) {
      const [t0, d0] = t[i - 1];
      const [t1, d1] = t[i];
      const f = (temperatuurC - t0) / (t1 - t0);
      return d0 + f * (d1 - d0);
    }
  }
  return t[t.length - 1][1];
}

/**
 * Volumevergroting van water t.o.v. de vultemperatuur (bijv. 1,012 = 1,2%
 * groter). Dit is de bijdrage die de kopruimte laat krimpen — precies de
 * reden dat een te hoog vulniveau in de historische documentatie als
 * oorzaak van het dopfalen staat.
 */
export function thermischeUitzettingsfactor(
  temperatuurC: number,
  vulTemperatuurC: number = 10,
): number {
  return dichtheidWater(vulTemperatuurC) / dichtheidWater(temperatuurC);
}

// ---------- CO2-oplosbaarheid (wet van Henry, temperatuurafhankelijk) ----------
// Vorm: van 't Hoff-relatie voor de Henry-constante, S(T) = S(Tref) ×
// exp(B × (1/T - 1/Tref)) met T in kelvin. B ≈ 2400 K is de breed
// gepubliceerde temperatuurcoëfficiënt voor CO2 in water (oplossingsenthalpie
// ≈ 19,4 kJ/mol; vgl. R. Sander, "Compilation of Henry's law constants",
// Atmos. Chem. Phys. 2015). De ABSOLUTE schaal (S bij 10 °C) is gekalibreerd
// op de in dit bedrijf gebruikte vuistwaarde "1,0 bar bij 10 °C ≈ 4,2–4,5 g/L"
// (zie docs/pasteurisatie-formules.md) — dat is een ander, nog wél geldig
// ijkpunt dan het losgelaten 8-bar-scenario.
const HENRY_B_KELVIN = 2400;
const TREF_K = 283.15; // 10 °C
// Gekalibreerd zodat co2GehalteUitDruk(1.0, 10) op het midden (4,35 g/L) van
// de vuistwaarde 4,2–4,5 g/L uitkomt (zie hierboven).
const S_BIJ_10C_G_L_PER_BAR = 2.174;

/** CO2-oplosbaarheid in g/L per bar (absolute CO2-partieeldruk) bij een gegeven temperatuur. */
export function co2Oplosbaarheid(temperatuurC: number): number {
  const tK = temperatuurC + 273.15;
  return S_BIJ_10C_G_L_PER_BAR * Math.exp(HENRY_B_KELVIN * (1 / tK - 1 / TREF_K));
}

/**
 * Zet een gemeten "X bar gauge bij temperatuur T" om naar het opgeloste
 * CO2-gehalte in g/L. Neemt aan dat de kopruimte bij het meten vrijwel
 * uitsluitend CO2 + waterdamp bevat (gepurgeerd/gecarboniseerd product, geen
 * lucht) — vandaar de correctie met de waterdampdruk bij die temperatuur.
 */
export function co2GehalteUitDruk(drukBarGauge: number, temperatuurC: number): number {
  const pCo2Abs = Math.max(0, drukBarGauge + ATM_BAR - waterdampdrukBar(temperatuurC));
  return co2Oplosbaarheid(temperatuurC) * pCo2Abs;
}

/** Omgekeerde van co2GehalteUitDruk: g/L -> equivalente gauge-druk bij die temperatuur. */
export function drukUitCo2Gehalte(co2GehalteGl: number, temperatuurC: number): number {
  const pCo2Abs = co2GehalteGl / co2Oplosbaarheid(temperatuurC);
  return pCo2Abs - ATM_BAR + waterdampdrukBar(temperatuurC);
}

export interface DrukParams {
  /** CO2-gehalte in g/L. Geef dit óf drukBarGauge+refTemperatuurC op, niet beide. */
  co2GehalteGl?: number;
  drukBarGauge?: number;
  refTemperatuurC?: number;
  flesinhoudMl: number;
  vulvolumeMl: number;
  doeltemperatuurC: number;
  /** Temperatuur waarbij is gevuld/gecarboniseerd — bepaalt de nulstand van de thermische uitzetting. Default 10 °C. */
  vulTemperatuurC?: number;
}

export interface DrukResultaat {
  /** Gekoppeld massabalansmodel — het fysisch correcte model. */
  drukGaugeBar: number;
  drukAbsBar: number;
  /**
   * Conservatieve bovengrens: rekent alsof geen enkel CO2-molecuul de
   * kopruimte al heeft gevuld (dus de concentratie in de vloeistof niet is
   * gedaald door die overdracht). Dat overschat de druk altijd een beetje
   * t.o.v. het gekoppelde model — vandaar "bovengrens" — en wordt gebruikt
   * voor het veiligheidsoordeel.
   */
  drukGaugeBovengrensBar: number;
  bijdrage: {
    co2Bar: number;
    waterdampBar: number;
  };
  kopruimteMlBijVullen: number;
  kopruimtePctBijVullen: number;
  kopruimteMlBijDoeltemp: number;
  co2GehalteGl: number;
  thermischeUitzettingsfactor: number;
  /** Gezet als de vloeistof bij het doel geen ruimte meer heeft — het fysieke faalscenario (barstend glas). */
  kopruimteOpgebruikt: boolean;
  gevalideerd: false;
  aannames: {
    formuleVersie: string;
    henryBKelvin: number;
    sBij10CGlPerBar: number;
    vulTemperatuurC: number;
  };
}

export const DRUK_FORMULE_VERSIE = "2026-09-01.1";

/**
 * Berekent de verwachte druk in een gesloten fles bij de doeltemperatuur.
 * Retourneert zowel het gekoppelde massabalansmodel als de conservatieve
 * bovengrens (zie DrukResultaat.drukGaugeBovengrensBar) — het
 * veiligheidsoordeel (veiligheidsoordeel()) gebruikt de laatste.
 */
export function verwachteDruk(params: DrukParams): DrukResultaat {
  const vulTemperatuurC = params.vulTemperatuurC ?? 10;
  let co2GehalteGl: number;
  if (params.co2GehalteGl != null) {
    co2GehalteGl = params.co2GehalteGl;
  } else if (params.drukBarGauge != null) {
    co2GehalteGl = co2GehalteUitDruk(
      params.drukBarGauge,
      params.refTemperatuurC ?? vulTemperatuurC,
    );
  } else {
    throw new Error("Geef co2GehalteGl of drukBarGauge (+ refTemperatuurC) op.");
  }

  const kopruimteMlBijVullen = params.flesinhoudMl - params.vulvolumeMl;
  const kopruimtePctBijVullen = (kopruimteMlBijVullen / params.flesinhoudMl) * 100;

  const expansie = thermischeUitzettingsfactor(params.doeltemperatuurC, vulTemperatuurC);
  const vulvolumeBijDoeltempMl = params.vulvolumeMl * expansie;
  const kopruimteMlBijDoeltemp = params.flesinhoudMl - vulvolumeBijDoeltempMl;

  const totaalCo2Gram = (co2GehalteGl * params.vulvolumeMl) / 1000;
  const solubiliteit = co2Oplosbaarheid(params.doeltemperatuurC); // g/L per bar
  const vulvolumeBijDoeltempL = vulvolumeBijDoeltempMl / 1000;

  const waterdampBar = waterdampdrukBar(params.doeltemperatuurC);

  let co2Bar: number;
  let co2BarBovengrens: number;
  let kopruimteOpgebruikt = false;

  if (kopruimteMlBijDoeltemp <= 0) {
    // De vloeistof heeft geen ruimte meer om uit te zetten — dit IS het
    // historische faalmechanisme (barstend glas), geen rekenkundig
    // randgeval om overheen te lopen. Geef een expliciet hoge, gemarkeerde
    // uitkomst i.p.v. te delen door nul of negatief.
    kopruimteOpgebruikt = true;
    co2Bar = Infinity;
    co2BarBovengrens = Infinity;
  } else {
    const kopruimteM3 = kopruimteMlBijDoeltemp * 1e-6;
    const tK = params.doeltemperatuurC + 273.15;
    // Molaire "opnamecapaciteit" van de kopruimte voor CO2 per bar
    // (ideale gaswet, g CO2 per bar): n = P·V/(R·T), massa = n·M.
    const kopruimteCapaciteitGramPerBar = (1e5 * kopruimteM3 * M_CO2) / (R * tK);

    // Gekoppeld model: totaal CO2 = opgelost (S·P·Vvloeistof) + in kopruimte
    // (capaciteit·P) → lineair oplosbaar naar P.
    co2Bar = totaalCo2Gram / (solubiliteit * vulvolumeBijDoeltempL + kopruimteCapaciteitGramPerBar);

    // Conservatieve bovengrens: negeer de term voor de kopruimte-capaciteit
    // (alsof geen gram CO2 de vloeistof heeft verlaten om de kopruimte te
    // vullen) — dat kan de concentratie in de vloeistof niet hebben doen
    // dalen, dus deze uitkomst is per definitie >= het gekoppelde model.
    co2BarBovengrens = totaalCo2Gram / (solubiliteit * vulvolumeBijDoeltempL);
  }

  const drukAbsBar = co2Bar + waterdampBar;
  const drukGaugeBar = drukAbsBar - ATM_BAR;
  const drukGaugeBovengrensBar = co2BarBovengrens + waterdampBar - ATM_BAR;

  return {
    drukGaugeBar,
    drukAbsBar,
    drukGaugeBovengrensBar,
    bijdrage: { co2Bar, waterdampBar },
    kopruimteMlBijVullen,
    kopruimtePctBijVullen,
    kopruimteMlBijDoeltemp,
    co2GehalteGl,
    thermischeUitzettingsfactor: expansie,
    kopruimteOpgebruikt,
    gevalideerd: false,
    aannames: {
      formuleVersie: DRUK_FORMULE_VERSIE,
      henryBKelvin: HENRY_B_KELVIN,
      sBij10CGlPerBar: S_BIJ_10C_G_L_PER_BAR,
      vulTemperatuurC,
    },
  };
}

export type OordeelType = "veilig" | "marginaal" | "onveilig" | "onbekend";

export interface Oordeel {
  oordeel: OordeelType;
  drukGebruiktBar: number; // altijd de conservatieve bovengrens
  sluitingMaxBar: number;
  margeFractie: number;
  toelichting: string;
}

/**
 * Beoordeelt de veiligheid op basis van de CONSERVATIEVE BOVENGRENS (nooit
 * het gekoppelde model) — expliciete keuze van Thomas, 1 september 2026: een
 * valse waarschuwing kost een gesprek, een gemiste kost glas of letsel.
 * Drie uitkomsten, nooit alleen groen/rood: het middengebied (binnen de
 * marge van de limiet) is precies waar het eerdere dopfalen ontstond.
 */
export function veiligheidsoordeel(
  drukResultaat: DrukResultaat,
  sluitingMaxBar: number,
  margeFractie: number = 0.2,
): Oordeel {
  const druk = drukResultaat.drukGaugeBovengrensBar;
  const geldigeGrenzen =
    Number.isFinite(sluitingMaxBar) &&
    sluitingMaxBar > 0 &&
    Number.isFinite(margeFractie) &&
    margeFractie >= 0 &&
    margeFractie < 1;
  // Een expliciet uitgeputte kopruimte blijft onveilig (het model gebruikt
  // daarvoor Infinity). Andere ongeldige getallen zijn geen veiligheidsbewijs.
  if (
    !geldigeGrenzen ||
    (!drukResultaat.kopruimteOpgebruikt &&
      ![
        druk,
        drukResultaat.drukGaugeBar,
        drukResultaat.drukAbsBar,
        drukResultaat.co2GehalteGl,
        drukResultaat.kopruimteMlBijDoeltemp,
        drukResultaat.thermischeUitzettingsfactor,
      ].every(Number.isFinite))
  ) {
    return {
      oordeel: "onbekend",
      drukGebruiktBar: druk,
      sluitingMaxBar,
      margeFractie,
      toelichting:
        "Onvoldoende betrouwbare gegevens voor een drukbeoordeling. Controleer de invoer, berekening en dopspecificatie; dit is geen toestemming om te starten.",
    };
  }
  const marginaalGrens = sluitingMaxBar * (1 - margeFractie);

  if (drukResultaat.kopruimteOpgebruikt || druk >= sluitingMaxBar) {
    return {
      oordeel: "onveilig",
      drukGebruiktBar: druk,
      sluitingMaxBar,
      margeFractie,
      toelichting: drukResultaat.kopruimteOpgebruikt
        ? "De vloeistof heeft bij de doeltemperatuur geen kopruimte meer over om uit te zetten — dit is het scenario dat eerder tot barstend glas leidde."
        : `Verwachte druk (${druk.toFixed(2)} bar, conservatieve bovengrens) bereikt of overschrijdt de dopspecificatie van ${sluitingMaxBar} bar.`,
    };
  }
  if (druk >= marginaalGrens) {
    return {
      oordeel: "marginaal",
      drukGebruiktBar: druk,
      sluitingMaxBar,
      margeFractie,
      toelichting: `Verwachte druk (${druk.toFixed(2)} bar) zit binnen ${Math.round(margeFractie * 100)}% van de dopspecificatie (${sluitingMaxBar} bar) — vereist expliciete bevestiging vóór start.`,
    };
  }
  return {
    oordeel: "veilig",
    drukGebruiktBar: druk,
    sluitingMaxBar,
    margeFractie,
    toelichting: `Verwachte druk (${druk.toFixed(2)} bar) blijft ruim onder de dopspecificatie van ${sluitingMaxBar} bar.`,
  };
}

/**
 * Omgekeerde vraag: welk CO2-gehalte (uitgedrukt als bar-bij-10°C) is nog
 * toelaatbaar bij een gegeven sluiting, doeltemperatuur en vulling? Gebruikt
 * dezelfde conservatieve bovengrens en marge als veiligheidsoordeel(), zodat
 * de twee functies nooit tegenstrijdig advies geven.
 */
export function maximaleCarbonatie(
  sluitingMaxBar: number,
  doeltemperatuurC: number,
  flesinhoudMl: number,
  vulvolumeMl: number,
  opties: { margeFractie?: number; vulTemperatuurC?: number } = {},
): number {
  const margeFractie = opties.margeFractie ?? 0.2;
  const vulTemperatuurC = opties.vulTemperatuurC ?? 10;
  const doelBar = sluitingMaxBar * (1 - margeFractie);

  // De bovengrens-formule is lineair in co2GehalteGl, dus één proefwaarde
  // volstaat om de schaalfactor te bepalen (geen iteratie nodig).
  const proef = verwachteDruk({
    co2GehalteGl: 10, // g/L, willekeurige positieve proefwaarde
    flesinhoudMl,
    vulvolumeMl,
    doeltemperatuurC,
    vulTemperatuurC,
  });
  const drukPerGl = (proef.drukGaugeBovengrensBar - (proef.bijdrage.waterdampBar - ATM_BAR)) / 10;
  const toelaatbaarGl =
    doelBar > 0 && drukPerGl > 0
      ? (doelBar - (proef.bijdrage.waterdampBar - ATM_BAR)) / drukPerGl
      : 0;

  return drukUitCo2Gehalte(Math.max(0, toelaatbaarGl), vulTemperatuurC);
}
