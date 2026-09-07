// Fase 21 — wat-als-simulatie voor het pasteurisatiedomein.
//
// Combineert de bestaande, geteste rekenkernen (pasteurisatie.ts +
// drukveiligheid.ts) tot één antwoord op de vraag "wat gebeurt er als ik deze
// run zo zou draaien". Bewust een aparte pure module en geen code in de route:
// dit is de rekenlogica, en die hoort testbaar te zijn zonder een scherm te
// renderen.
//
// Er wordt hier NIETS nieuws uitgerekend: dezelfde puOverCurve() en
// verwachteDruk() als de live monitor gebruikt, alleen gevoed met een
// synthetische in plaats van een gemeten curve. Dat is expres — twee
// implementaties van dezelfde som is precies hoe modellen uit elkaar gaan
// lopen (zie WERKLOG Fase 17, de PU-eindberekening).

import {
  puOverCurve,
  synthetiseerCurve,
  type PuResultaat,
  type TemperatuurMeting,
} from "./pasteurisatie";
import {
  verwachteDruk,
  veiligheidsoordeel,
  DRUKVEILIGHEID_NIET_GEVALIDEERD,
  type DrukResultaat,
  type Oordeel,
} from "./drukveiligheid";
import { simulatieOk, simulatieOnvoldoendeData, type SimulatieResultaat } from "./simulatie";

export interface WatAlsRunInvoer {
  opwarmMinuten: number;
  houdMinuten: number;
  afkoelMinuten: number;
  vanTemperatuurC: number;
  /** Piek- en houdtemperatuur; komt op het plannerscherm uit het doeltemperatuur-veld. */
  houdTemperatuurC: number;
  eindTemperatuurC: number;
  doelPu: number;
  /** Druk wordt alleen berekend als fles- én vulvolume bekend zijn. */
  flesinhoudMl?: number;
  vulvolumeMl?: number;
  co2GehalteGl?: number;
  vulTemperatuurC?: number;
  /** Dopspecificatie; zonder deze waarde volgt er geen veiligheidsoordeel. */
  sluitingMaxBar?: number | null;
  intervalSeconden?: number;
}

export interface WatAlsRunUitkomst {
  curve: TemperatuurMeting[];
  pu: PuResultaat;
  /** Minuten vanaf de start tot het PU-doel bereikt is, of null als het doel niet gehaald wordt. */
  minutenTotDoel: number | null;
  totaleDuurMinuten: number;
  /** Null als fles-/vulvolume ontbreken — dan is er alleen een PU-uitkomst. */
  druk: DrukResultaat | null;
  /** Null als de dopspecificatie onbekend is. */
  oordeel: Oordeel | null;
}

/**
 * Rekent een hypothetische pasteurisatierun door.
 *
 * Het drukoordeel wordt bewust op de PIEKtemperatuur gegeven, niet op een
 * gemiddelde: dat is het ongunstigste moment van de run, en het hele drukmodel
 * kiest per instructie van Thomas altijd de conservatieve kant.
 */
export function simuleerRun(invoer: WatAlsRunInvoer): SimulatieResultaat<WatAlsRunUitkomst> {
  const {
    opwarmMinuten,
    houdMinuten,
    afkoelMinuten,
    vanTemperatuurC,
    houdTemperatuurC,
    eindTemperatuurC,
    doelPu,
    flesinhoudMl,
    vulvolumeMl,
    co2GehalteGl,
    vulTemperatuurC = 10,
    sluitingMaxBar,
    intervalSeconden = 20,
  } = invoer;

  const totaleDuurMinuten = opwarmMinuten + houdMinuten + afkoelMinuten;
  if (!(totaleDuurMinuten > 0)) {
    return simulatieOnvoldoendeData(
      "Vul minstens één fase-duur in (opwarmen, houden of afkoelen) — anders is er geen curve om door te rekenen.",
    );
  }
  if (!(houdTemperatuurC > vanTemperatuurC)) {
    return simulatieOnvoldoendeData(
      "De doeltemperatuur moet hoger zijn dan de begintemperatuur — anders wordt er niet opgewarmd.",
    );
  }

  const curve = synthetiseerCurve({
    startTijd: new Date(2026, 0, 1, 8, 0), // vast: alleen de onderlinge tijdsafstanden tellen
    opwarmMinuten,
    vanTemperatuurC,
    houdMinuten,
    houdTemperatuurC,
    afkoelMinuten,
    eindTemperatuurC,
    intervalSeconden,
  });

  const pu = puOverCurve(curve, { doelPu });
  const minutenTotDoel =
    pu.doelBereiktOp && curve.length > 0
      ? (pu.doelBereiktOp.getTime() - curve[0].tijdstip.getTime()) / 60000
      : null;

  const kanDrukBerekenen =
    (flesinhoudMl ?? 0) > 0 && (vulvolumeMl ?? 0) > 0 && (co2GehalteGl ?? 0) > 0;
  const druk = kanDrukBerekenen
    ? verwachteDruk({
        co2GehalteGl: co2GehalteGl!,
        flesinhoudMl: flesinhoudMl!,
        vulvolumeMl: vulvolumeMl!,
        doeltemperatuurC: houdTemperatuurC,
        vulTemperatuurC,
      })
    : null;
  const oordeel =
    druk && sluitingMaxBar != null && sluitingMaxBar > 0
      ? veiligheidsoordeel(druk, sluitingMaxBar)
      : null;

  const aannames = [
    `Lineaire opwarm- en afkoelsnelheid (${opwarmMinuten} min omhoog, ${afkoelMinuten} min omlaag) — er is geen controle of je apparatuur dat werkelijk haalt.`,
    `De temperatuur wordt de hele houdfase exact op ${houdTemperatuurC} °C gehouden; in werkelijkheid schommelt die.`,
    `PU gerekend met de bierconventie z=7 en referentietemperatuur 60 °C, over de volledige curve (opwarmen en afkoelen tellen mee).`,
  ];
  if (druk) {
    aannames.push(
      `Drukoordeel op de piektemperatuur van ${houdTemperatuurC} °C — het ongunstigste moment van de run.`,
      `CO2-gehalte ${druk.co2GehalteGl.toFixed(2)} g/L, vulling bij ${vulTemperatuurC} °C.`,
    );
  } else {
    aannames.push(
      "Geen drukberekening: flesinhoud, vulvolume of carbonatie is nog niet ingevuld hierboven.",
    );
  }

  return simulatieOk<WatAlsRunUitkomst>(
    { curve, pu, minutenTotDoel, totaleDuurMinuten, druk, oordeel },
    {
      aannames,
      // De band is het verschil tussen het gekoppelde massabalansmodel en de
      // conservatieve bovengrens — dat is een echte, al bestaande onzekerheid
      // in het drukmodel, geen verzonnen marge.
      bandbreedte:
        druk && Number.isFinite(druk.drukGaugeBovengrensBar)
          ? {
              ondergrens: druk.drukGaugeBar,
              bovengrens: druk.drukGaugeBovengrensBar,
              waarvan: "verwachte flesdruk bij piektemperatuur (bar gauge)",
            }
          : undefined,
      // Blijft false zolang het drukmodel niet tegen een echte gemeten
      // flesdruk is geijkt (Fase 17). Niet stilzwijgend op true zetten.
      gevalideerd: false,
    },
  );
}

/** Tekst die bij elke pasteurisatie-simulatie naast de simulatiemarkering hoort. */
export const WAT_ALS_NIET_GEVALIDEERD = DRUKVEILIGHEID_NIET_GEVALIDEERD;
