// Fase 17 Blok A — PU-rekenkern (pasteurisatie-eenheden). Puur en
// Node-testbaar; geen serverstaat, zelfde patroon als oenologie.ts en
// gisting-verwachting.ts. Alle formules staan in
// docs/pasteurisatie-formules.md met bronvermelding.
//
// Veiligheidskader (geldt voor deze hele module): de app registreert en
// adviseert, stuurt niets aan. Bij twijfel over een model kiest de code de
// uitkomst die conservatief is (hier: nooit stilzwijgend PU-bijdrage
// weglaten). Elke uitkomst draagt tot Thomas een run heeft nagemeten de
// "nog niet gevalideerd tegen een echte run"-status (zie Blok I/H).

export const PASTEURISATIE_FORMULE_VERSIE = "2026-09-01.1";

export const PU_NIET_GEVALIDEERD =
  "Dit rekenmodel is nog niet gevalideerd tegen een echte, nagemeten run.";

const STANDAARD_Z = 7; // bierconventie
const STANDAARD_REFTEMP = 60; // °C

/**
 * PU-opbouw per minuut bij temperatuur T: 10^((T - refTemp) / z).
 * z=7, refTemp=60 is de bierconventie (1,393^(T-60) is dezelfde formule
 * geschreven met de afgeronde basis 10^(1/7) ≈ 1,393 — hier expliciet met
 * exponent/z gerekend zodat een andere z/referentie zonder herbouw kan).
 */
export function puPerMinuut(
  temperatuurC: number,
  z: number = STANDAARD_Z,
  refTemp: number = STANDAARD_REFTEMP,
): number {
  return Math.pow(10, (temperatuurC - refTemp) / z);
}

export interface TemperatuurMeting {
  tijdstip: Date;
  temperatuurC: number;
}

export interface PuGat {
  van: Date;
  tot: Date;
  minuten: number;
}

export interface PuResultaat {
  totalePu: number;
  puOpwarm: number;
  puHoud: number;
  puAfkoel: number;
  piektemperatuurC: number;
  piektijdstip: Date;
  duurMinuten: number;
  /** Eerste tijdstip waarop de cumulatieve PU de meegegeven doelwaarde bereikte, of null. */
  doelBereiktOp: Date | null;
  betrouwbaar: boolean;
  gaten: PuGat[];
  formuleVersie: string;
  gevalideerd: false; // Blok I zet dit pas op true na een bevestigde run
  invoer: { aantalMetingen: number; z: number; refTemp: number };
}

export interface PuOverCurveOpties {
  z?: number;
  refTemp?: number;
  /** Boven dit gat (minuten) tussen twee metingen wordt de reeks als onbetrouwbaar gemarkeerd. */
  gatDrempelMinuten?: number;
  doelPu?: number;
  /** Tolerantie (°C) t.o.v. de piek om de houdfase af te bakenen. */
  houdToleranceC?: number;
}

function minutenTussen(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}

/**
 * Integreert de PU-opbouw over de volledige curve (opwarm + houd + afkoel)
 * met trapeziumintegratie tussen opeenvolgende metingen. Er is bewust GEEN
 * ondergrens waaronder niet meer geteld wordt — dat zou precies de fout zijn
 * die dit systeem moet voorkomen (zie docs/pasteurisatie-formules.md).
 */
export function puOverCurve(
  metingen: TemperatuurMeting[],
  opties: PuOverCurveOpties = {},
): PuResultaat {
  const z = opties.z ?? STANDAARD_Z;
  const refTemp = opties.refTemp ?? STANDAARD_REFTEMP;
  const gatDrempel = opties.gatDrempelMinuten ?? 2;
  const houdTolerantie = opties.houdToleranceC ?? 0.5;

  const gesorteerd = [...metingen].sort((a, b) => a.tijdstip.getTime() - b.tijdstip.getTime());

  if (gesorteerd.length === 0) {
    return {
      totalePu: 0,
      puOpwarm: 0,
      puHoud: 0,
      puAfkoel: 0,
      piektemperatuurC: 0,
      piektijdstip: new Date(0),
      duurMinuten: 0,
      doelBereiktOp: null,
      betrouwbaar: false,
      gaten: [],
      formuleVersie: PASTEURISATIE_FORMULE_VERSIE,
      gevalideerd: false,
      invoer: { aantalMetingen: 0, z, refTemp },
    };
  }

  // Piek: EERSTE optreden van de maximale temperatuur.
  let piekIdx = 0;
  for (let i = 1; i < gesorteerd.length; i++) {
    if (gesorteerd[i].temperatuurC > gesorteerd[piekIdx].temperatuurC) piekIdx = i;
  }
  const piektemperatuurC = gesorteerd[piekIdx].temperatuurC;

  // Houdfase: aaneengesloten blok rond de piek binnen de tolerantie.
  let houdStart = piekIdx;
  while (
    houdStart > 0 &&
    piektemperatuurC - gesorteerd[houdStart - 1].temperatuurC <= houdTolerantie
  ) {
    houdStart--;
  }
  let houdEind = piekIdx;
  while (
    houdEind < gesorteerd.length - 1 &&
    piektemperatuurC - gesorteerd[houdEind + 1].temperatuurC <= houdTolerantie
  ) {
    houdEind++;
  }

  const gaten: PuGat[] = [];
  let totalePu = 0;
  let puOpwarm = 0;
  let puHoud = 0;
  let puAfkoel = 0;
  let cumulatief = 0;
  let doelBereiktOp: number | null = null;
  const doelPu = opties.doelPu;

  for (let i = 1; i < gesorteerd.length; i++) {
    const vorige = gesorteerd[i - 1];
    const huidige = gesorteerd[i];
    const dtMin = minutenTussen(vorige.tijdstip, huidige.tijdstip);
    if (dtMin <= 0) continue; // duplicaat/gelijk tijdstip: geen bijdrage, geen crash

    if (dtMin > gatDrempel) {
      gaten.push({ van: vorige.tijdstip, tot: huidige.tijdstip, minuten: dtMin });
    }

    const rateVorige = puPerMinuut(vorige.temperatuurC, z, refTemp);
    const rateHuidige = puPerMinuut(huidige.temperatuurC, z, refTemp);
    // Trapeziumregel: gemiddelde van begin- en eindsnelheid × duur.
    const segmentPu = ((rateVorige + rateHuidige) / 2) * dtMin;

    totalePu += segmentPu;

    // Fase-toewijzing van dit segment op basis van waar het eindpunt (i) valt.
    if (i <= houdStart) puOpwarm += segmentPu;
    else if (i <= houdEind) puHoud += segmentPu;
    else puAfkoel += segmentPu;

    const vorigeCumulatief = cumulatief;
    cumulatief += segmentPu;
    if (
      doelBereiktOp === null &&
      doelPu != null &&
      vorigeCumulatief < doelPu &&
      cumulatief >= doelPu
    ) {
      // Lineair interpoleren binnen dit segment voor een preciezer tijdstip.
      const fractie = (doelPu - vorigeCumulatief) / segmentPu;
      doelBereiktOp = vorige.tijdstip.getTime() + fractie * dtMin * 60000;
    }
  }

  const duurMinuten = minutenTussen(
    gesorteerd[0].tijdstip,
    gesorteerd[gesorteerd.length - 1].tijdstip,
  );

  return {
    totalePu,
    puOpwarm,
    puHoud,
    puAfkoel,
    piektemperatuurC,
    piektijdstip: gesorteerd[piekIdx].tijdstip,
    duurMinuten,
    doelBereiktOp: doelBereiktOp !== null ? new Date(doelBereiktOp) : null,
    betrouwbaar: gaten.length === 0,
    gaten,
    formuleVersie: PASTEURISATIE_FORMULE_VERSIE,
    gevalideerd: false,
    invoer: { aantalMetingen: gesorteerd.length, z, refTemp },
  };
}

export type Voorspelling =
  | { mogelijk: false; reden: string }
  | { mogelijk: true; verwachtTijdstip: Date; resterendeMinuten: number };

/**
 * Schat, bij gelijkblijvende temperatuur, wanneer de doel-PU bereikt wordt.
 * Geeft expliciet "onvoldoende data" i.p.v. te gokken — zelfde regel als
 * gisting-verwachting.ts. Extrapoleren terwijl de temperatuur nog stijgt is
 * onbetrouwbaar (de werkelijke PU-opbouw versnelt dan nog), dus ook dat
 * scenario levert geen voorspelling op.
 */
export function voorspelPuVerloop(
  huidigeMetingen: TemperatuurMeting[],
  doelPu: number,
  opties: { z?: number; refTemp?: number; minMetingen?: number; minMinuten?: number } = {},
): Voorspelling {
  const minMetingen = opties.minMetingen ?? 3;
  const minMinuten = opties.minMinuten ?? 5;

  const gesorteerd = [...huidigeMetingen].sort(
    (a, b) => a.tijdstip.getTime() - b.tijdstip.getTime(),
  );
  if (gesorteerd.length < minMetingen) {
    return { mogelijk: false, reden: "Onvoldoende data (minder dan de vereiste metingen)." };
  }
  const spanMinuten = minutenTussen(
    gesorteerd[0].tijdstip,
    gesorteerd[gesorteerd.length - 1].tijdstip,
  );
  if (spanMinuten < minMinuten) {
    return { mogelijk: false, reden: "Onvoldoende data (te korte tijdspanne gemeten)." };
  }

  const laatste = gesorteerd[gesorteerd.length - 1];
  const voorlaatste = gesorteerd[gesorteerd.length - 2];
  const stijgtNog = laatste.temperatuurC - voorlaatste.temperatuurC > 0.2;
  if (stijgtNog) {
    return {
      mogelijk: false,
      reden:
        "Temperatuur stijgt nog — een voorspelling bij gelijkblijvende temperatuur is nu onbetrouwbaar.",
    };
  }

  const huidigResultaat = puOverCurve(gesorteerd, { z: opties.z, refTemp: opties.refTemp });
  if (huidigResultaat.totalePu >= doelPu) {
    return { mogelijk: true, verwachtTijdstip: laatste.tijdstip, resterendeMinuten: 0 };
  }

  const rateNu = puPerMinuut(laatste.temperatuurC, opties.z, opties.refTemp);
  if (rateNu <= 0) {
    return { mogelijk: false, reden: "PU-opbouw bij de huidige temperatuur is verwaarloosbaar." };
  }
  const resterendeMinuten = (doelPu - huidigResultaat.totalePu) / rateNu;
  return {
    mogelijk: true,
    verwachtTijdstip: new Date(laatste.tijdstip.getTime() + resterendeMinuten * 60000),
    resterendeMinuten,
  };
}
