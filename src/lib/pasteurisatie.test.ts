import { describe, expect, it } from "vitest";
import {
  puPerMinuut,
  puOverCurve,
  voorspelPuVerloop,
  type TemperatuurMeting,
} from "./pasteurisatie";

function meting(minuutOffset: number, temperatuurC: number): TemperatuurMeting {
  return { tijdstip: new Date(2026, 0, 1, 0, minuutOffset), temperatuurC };
}

describe("puPerMinuut", () => {
  it("is exact 1,0 bij de referentietemperatuur (60 °C)", () => {
    expect(puPerMinuut(60)).toBeCloseTo(1.0, 9);
  });

  it("is 10 bij 67 °C (één z-eenheid boven 60 °C: 10^(7/7) = 10)", () => {
    expect(puPerMinuut(67)).toBeCloseTo(10, 6);
  });

  it("komt overeen met de vuistwaarden uit de opdracht (binnen de afrondingsmarge van 1,393 vs. exact 10^(1/7))", () => {
    // De opdracht noemt 0,036 / 5,3 / 27,5 als vuistwaarden op basis van de
    // afgeronde basis 1,393. Deze module rekent met de exacte 10^((T-ref)/z),
    // wat een fractie hoger uitkomt (~3-4%) — geen modelfout, maar het effect
    // van afronding in de vuistwaarde zelf. Vastgelegd zodat een toekomstige
    // wijziging hierin zichtbaar wordt.
    expect(puPerMinuut(50)).toBeCloseTo(0.0373, 3);
    expect(puPerMinuut(65)).toBeCloseTo(5.18, 1);
    expect(puPerMinuut(70)).toBeCloseTo(26.83, 1);
  });
});

describe("puOverCurve — basisgevallen", () => {
  it("een vlakke curve van 60 °C gedurende 120 minuten geeft exact 120 PU", () => {
    const metingen: TemperatuurMeting[] = [];
    for (let m = 0; m <= 120; m += 2) metingen.push(meting(m, 60));
    const r = puOverCurve(metingen);
    expect(r.totalePu).toBeCloseTo(120, 6);
    expect(r.betrouwbaar).toBe(true);
  });

  it("lege reeks geeft 0 PU en onbetrouwbaar", () => {
    const r = puOverCurve([]);
    expect(r.totalePu).toBe(0);
    expect(r.betrouwbaar).toBe(false);
  });

  it("één meetpunt geeft 0 PU zonder te crashen", () => {
    const r = puOverCurve([meting(0, 60)]);
    expect(r.totalePu).toBe(0);
    expect(r.duurMinuten).toBe(0);
  });

  it("meetpunten in verkeerde volgorde worden intern gesorteerd", () => {
    const r = puOverCurve([meting(10, 60), meting(0, 60)]);
    expect(r.totalePu).toBeCloseTo(10, 6);
  });

  it("markeert een gat groter dan de drempel en telt het niet stilzwijgend weg", () => {
    const metingen = [meting(0, 60), meting(10, 60)]; // gat van 10 min > default 2 min
    const r = puOverCurve(metingen);
    expect(r.betrouwbaar).toBe(false);
    expect(r.gaten).toHaveLength(1);
    expect(r.gaten[0].minuten).toBe(10);
    // De PU wordt nog steeds berekend (trapezium over het gat), niet op 0 gezet —
    // maar het resultaat draagt het onbetrouwbaar-label.
    expect(r.totalePu).toBeCloseTo(10, 6);
  });
});

describe("puOverCurve — validatie tegen Thomas' praktijk (indicatief, zie opdracht)", () => {
  // Aangenomen curve, NIET uit een gecontroleerde meting: 15 min opwarmen van
  // 20 naar 65 °C, 20 min houden op 65 °C, 20 min afkoelen terug naar 30 °C.
  // Dit is een sanity-check, geen vaststaande waarheid — Thomas stelt dit bij
  // zodra hij een echte run heeft nagemeten (zie PU_NIET_GEVALIDEERD).
  it("een geschatte praktijkcurve valt in het doelbereik 115–145 PU", () => {
    const metingen: TemperatuurMeting[] = [];
    for (let m = 0; m <= 15; m++) metingen.push(meting(m, 20 + (m / 15) * 45)); // 20 -> 65
    for (let m = 16; m <= 35; m++) metingen.push(meting(m, 65));
    for (let m = 36; m <= 55; m++) metingen.push(meting(m, 65 - ((m - 35) / 20) * 35)); // 65 -> 30

    const r = puOverCurve(metingen);
    expect(r.totalePu).toBeGreaterThanOrEqual(115);
    expect(r.totalePu).toBeLessThanOrEqual(145);
  });

  it("alleen de houdfase tellen onderschat de PU aanzienlijk t.o.v. de volledige curve", () => {
    const metingen: TemperatuurMeting[] = [];
    for (let m = 0; m <= 15; m++) metingen.push(meting(m, 20 + (m / 15) * 45));
    for (let m = 16; m <= 35; m++) metingen.push(meting(m, 65));
    for (let m = 36; m <= 55; m++) metingen.push(meting(m, 65 - ((m - 35) / 20) * 35));

    const volledig = puOverCurve(metingen);
    const alleenHoud = puOverCurve(metingen.filter((m) => m.temperatuurC === 65));

    expect(alleenHoud.totalePu).toBeLessThan(volledig.totalePu);
    // Het verschil is substantieel, niet een afrondingsdetail.
    expect(volledig.totalePu - alleenHoud.totalePu).toBeGreaterThan(volledig.totalePu * 0.1);
  });
});

describe("puOverCurve — fasen en piek", () => {
  it("herkent de piektemperatuur en verdeelt PU over opwarm/houd/afkoel", () => {
    const metingen = [meting(0, 20), meting(10, 60), meting(20, 60), meting(30, 20)];
    const r = puOverCurve(metingen);
    expect(r.piektemperatuurC).toBe(60);
    expect(r.puOpwarm).toBeGreaterThan(0);
    expect(r.puHoud).toBeGreaterThan(0);
    expect(r.puAfkoel).toBeGreaterThan(0);
    expect(r.puOpwarm + r.puHoud + r.puAfkoel).toBeCloseTo(r.totalePu, 6);
  });

  it("bepaalt het tijdstip waarop een doelwaarde bereikt wordt", () => {
    const metingen: TemperatuurMeting[] = [];
    for (let m = 0; m <= 200; m += 1) metingen.push(meting(m, 60));
    const r = puOverCurve(metingen, { doelPu: 100 });
    expect(r.doelBereiktOp).not.toBeNull();
    expect(minutenSindsStart(r.doelBereiktOp!, metingen[0].tijdstip)).toBeCloseTo(100, 0);
  });
});

function minutenSindsStart(t: Date, start: Date): number {
  return (t.getTime() - start.getTime()) / 60000;
}

describe("voorspelPuVerloop", () => {
  it("geeft 'onvoldoende data' bij te weinig metingen", () => {
    const v = voorspelPuVerloop([meting(0, 60), meting(1, 60)], 100);
    expect(v.mogelijk).toBe(false);
  });

  it("geeft geen voorspelling terwijl de temperatuur nog stijgt", () => {
    const v = voorspelPuVerloop([meting(0, 20), meting(2, 40), meting(4, 60), meting(6, 65)], 100);
    expect(v.mogelijk).toBe(false);
  });

  it("voorspelt een tijdstip bij een stabiele temperatuur en onvoldoende PU tot nu toe", () => {
    const metingen = [meting(0, 60), meting(2, 60), meting(4, 60), meting(6, 60), meting(8, 60)];
    const v = voorspelPuVerloop(metingen, 100);
    expect(v.mogelijk).toBe(true);
    if (v.mogelijk) expect(v.resterendeMinuten).toBeGreaterThan(0);
  });
});
