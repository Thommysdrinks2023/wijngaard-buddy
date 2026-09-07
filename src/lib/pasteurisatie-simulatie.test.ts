import { describe, expect, it } from "vitest";
import { simuleerRun, type WatAlsRunInvoer } from "./pasteurisatie-simulatie";
import { puOverCurve } from "./pasteurisatie";

// Realistische basisinvoer: 250 ml fles, 225 ml vulling, lichte carbonatie,
// 65 °C houden — hetzelfde profiel als de seed-testruns gebruiken.
const basis: WatAlsRunInvoer = {
  opwarmMinuten: 15,
  houdMinuten: 20,
  afkoelMinuten: 20,
  vanTemperatuurC: 20,
  houdTemperatuurC: 65,
  eindTemperatuurC: 30,
  doelPu: 100,
  flesinhoudMl: 250,
  vulvolumeMl: 225,
  co2GehalteGl: 4.35,
  vulTemperatuurC: 10,
  sluitingMaxBar: 6,
};

describe("simuleerRun — normale gevallen", () => {
  it("levert een uitkomst met curve, PU en drukoordeel", () => {
    const r = simuleerRun(basis);
    expect(r.status).toBe("ok");
    expect(r.waarde).toBeDefined();
    expect(r.waarde!.curve.length).toBeGreaterThan(10);
    expect(r.waarde!.pu.totalePu).toBeGreaterThan(0);
    expect(r.waarde!.druk).not.toBeNull();
    expect(r.waarde!.oordeel).not.toBeNull();
  });

  it("staat ALTIJD op gevalideerd: false — het drukmodel is nooit nagemeten (Fase 17)", () => {
    expect(simuleerRun(basis).gevalideerd).toBe(false);
    expect(simuleerRun({ ...basis, houdTemperatuurC: 50 }).gevalideerd).toBe(false);
  });

  it("geeft de totale duur als som van de drie fases", () => {
    expect(simuleerRun(basis).waarde!.totaleDuurMinuten).toBe(55);
  });

  it("bereikt het PU-doel binnen de runduur bij 65 °C en meldt wanneer", () => {
    const r = simuleerRun(basis);
    expect(r.waarde!.minutenTotDoel).not.toBeNull();
    expect(r.waarde!.minutenTotDoel!).toBeGreaterThan(0);
    expect(r.waarde!.minutenTotDoel!).toBeLessThanOrEqual(55);
  });

  it("haalt het doel NIET bij een te lage temperatuur, en verzint dan geen tijdstip", () => {
    const r = simuleerRun({ ...basis, houdTemperatuurC: 45 });
    expect(r.status).toBe("ok");
    expect(r.waarde!.pu.totalePu).toBeLessThan(100);
    expect(r.waarde!.minutenTotDoel).toBeNull();
  });

  it("rekent exact hetzelfde als de rekenkern zelf — geen tweede implementatie", () => {
    const r = simuleerRun(basis);
    const opnieuw = puOverCurve(r.waarde!.curve, { doelPu: 100 });
    expect(opnieuw.totalePu).toBeCloseTo(r.waarde!.pu.totalePu, 9);
  });

  it("is deterministisch — twee keer dezelfde invoer geeft dezelfde uitkomst", () => {
    expect(simuleerRun(basis).waarde!.pu.totalePu).toBeCloseTo(
      simuleerRun(basis).waarde!.pu.totalePu,
      9,
    );
  });
});

describe("simuleerRun — veiligheidsoordeel", () => {
  it("oordeelt op de piektemperatuur, niet op een gemiddelde", () => {
    const r = simuleerRun(basis);
    // De druk in de uitkomst moet gelijk zijn aan die bij de houdtemperatuur;
    // een gemiddelde over de curve zou lager uitvallen en dus onveiliger advies geven.
    const bijPiek = simuleerRun({ ...basis, opwarmMinuten: 1, afkoelMinuten: 1 });
    expect(r.waarde!.druk!.drukGaugeBovengrensBar).toBeCloseTo(
      bijPiek.waarde!.druk!.drukGaugeBovengrensBar,
      9,
    );
  });

  it("gebruikt de conservatieve bovengrens voor het oordeel", () => {
    const r = simuleerRun(basis);
    expect(r.waarde!.oordeel!.drukGebruiktBar).toBeCloseTo(
      r.waarde!.druk!.drukGaugeBovengrensBar,
      9,
    );
  });

  it("waarschuwt bij een te hoge carbonatie voor de sluiting", () => {
    const r = simuleerRun({ ...basis, co2GehalteGl: 12 });
    expect(r.waarde!.oordeel!.oordeel).toBe("onveilig");
  });

  it("geeft geen oordeel zonder bekende dopspecificatie, maar wel een PU-uitkomst", () => {
    const r = simuleerRun({ ...basis, sluitingMaxBar: null });
    expect(r.status).toBe("ok");
    expect(r.waarde!.oordeel).toBeNull();
    expect(r.waarde!.pu.totalePu).toBeGreaterThan(0);
  });

  it("rekent alleen PU als fles-/vulvolume ontbreken, zonder te crashen", () => {
    const r = simuleerRun({
      ...basis,
      flesinhoudMl: undefined,
      vulvolumeMl: undefined,
      co2GehalteGl: undefined,
    });
    expect(r.status).toBe("ok");
    expect(r.waarde!.druk).toBeNull();
    expect(r.waarde!.oordeel).toBeNull();
    expect(r.waarde!.pu.totalePu).toBeGreaterThan(0);
    expect(r.aannames.some((a) => a.includes("Geen drukberekening"))).toBe(true);
  });
});

describe("simuleerRun — bandbreedte en aannames", () => {
  it("gebruikt het verschil gekoppeld model / conservatieve bovengrens als band", () => {
    const r = simuleerRun(basis);
    expect(r.bandbreedte).toBeDefined();
    expect(r.bandbreedte!.ondergrens).toBeCloseTo(r.waarde!.druk!.drukGaugeBar, 9);
    expect(r.bandbreedte!.bovengrens).toBeCloseTo(r.waarde!.druk!.drukGaugeBovengrensBar, 9);
    expect(r.bandbreedte!.bovengrens).toBeGreaterThanOrEqual(r.bandbreedte!.ondergrens);
    expect(r.bandbreedte!.waarvan).toContain("bar");
  });

  it("noemt de lineaire opwarmsnelheid expliciet als aanname (risico 2 uit het ontwerp)", () => {
    const aannames = simuleerRun(basis).aannames;
    expect(aannames.some((a) => a.toLowerCase().includes("lineaire opwarm"))).toBe(true);
  });

  it("geeft geen bandbreedte als de kopruimte opgebruikt is (druk is dan oneindig)", () => {
    const r = simuleerRun({ ...basis, vulvolumeMl: 250 });
    expect(r.waarde!.druk!.kopruimteOpgebruikt).toBe(true);
    expect(r.bandbreedte).toBeUndefined();
    expect(r.waarde!.oordeel!.oordeel).toBe("onveilig");
  });
});

describe("simuleerRun — weigert eerlijk in plaats van te gokken", () => {
  it("weigert bij een runduur van nul", () => {
    const r = simuleerRun({ ...basis, opwarmMinuten: 0, houdMinuten: 0, afkoelMinuten: 0 });
    expect(r.status).toBe("onvoldoende_data");
    expect(r.waarde).toBeUndefined();
    expect(r.reden).toBeTruthy();
  });

  it("weigert als de doeltemperatuur niet boven de begintemperatuur ligt", () => {
    const r = simuleerRun({ ...basis, houdTemperatuurC: 20, vanTemperatuurC: 20 });
    expect(r.status).toBe("onvoldoende_data");
    expect(r.reden).toContain("hoger");
  });
});
