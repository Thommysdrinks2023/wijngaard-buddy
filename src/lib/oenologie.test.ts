import { describe, expect, it } from "vitest";
import {
  berekenChaptalisatie,
  berekenMoleculairSo2,
  berekenSo2Advies,
  berekenYanAdvies,
  berekenZuurcorrectie,
  potentieelAlcohol,
} from "./oenologie";

describe("SO2", () => {
  it("moleculair SO2: normaal geval — voorbeeld uit docs/oenologie-formules.md", () => {
    // pH 3,4 / vrije SO2 12 mg/L -> moleculair 0,30 mg/L (nagerekend, gedocumenteerd)
    expect(berekenMoleculairSo2(12, 3.4)).toBeCloseTo(0.3, 2);
  });

  it("moleculair SO2: randgeval 0 mg/L vrije SO2", () => {
    expect(berekenMoleculairSo2(0, 3.4)).toBe(0);
  });

  it("SO2-advies: volledig voorbeeld uit de docs (pH 3,4, 12 mg/L, 500 L)", () => {
    const advies = berekenSo2Advies(12, 3.4, 500, 0.8);
    expect(advies.moleculairNu).toBeCloseTo(0.3, 2);
    expect(advies.benodigdVrijMgL).toBeCloseTo(31.9, 1);
    expect(advies.toeTeVoegenMgL).toBeCloseTo(19.9, 1);
    expect(advies.gramSo2).toBeCloseTo(10.0, 1);
    expect(advies.gramKms).toBeCloseTo(17.5, 1);
  });

  it("SO2-advies: al boven het doel -> geen negatieve dosering", () => {
    const advies = berekenSo2Advies(200, 3.4, 500, 0.8);
    expect(advies.toeTeVoegenMgL).toBe(0);
    expect(advies.gramSo2).toBe(0);
  });

  it("bijt: een gewijzigde pKa-constante verandert de uitkomst", () => {
    const juist = berekenMoleculairSo2(12, 3.4);
    const foutePka = 12 / (1 + Math.pow(10, 3.4 - 2.5)); // gemanipuleerde pKa
    expect(foutePka).not.toBeCloseTo(juist, 2);
  });
});

describe("YAN", () => {
  it("normaal geval: 12 vol% potentieel, middenklasse, geen huidige YAN", () => {
    const advies = berekenYanAdvies(96, "middel", 500); // 96 °Oe ~ 12,0 vol%
    expect(advies.behoefteMgL).toBe(200);
    expect(advies.tekortMgL).toBe(200);
  });

  it("boven 12 vol%: +25 mg/L per extra vol%", () => {
    const advies = berekenYanAdvies(160, "middel", 500); // 20 vol% potentieel
    // basis 200 + (20-12)*25 = 400
    expect(advies.behoefteMgL).toBe(400);
  });

  it("randgeval: huidige YAN al toereikend -> tekort 0", () => {
    const advies = berekenYanAdvies(96, "laag", 500, 500);
    expect(advies.tekortMgL).toBe(0);
  });
});

describe("Chaptalisatie", () => {
  it("potentieel alcohol: 65 °Oe -> 8,1 vol% (voorbeeld uit de docs)", () => {
    expect(potentieelAlcohol(65)).toBeCloseTo(8.1, 1);
  });

  it("normaal geval: volledig voorbeeld uit de docs (65 °Oe, doel 11,0 vol%, 800 L)", () => {
    const advies = berekenChaptalisatie(65, 11.0, 800, null);
    expect(advies.potAlcNu).toBeCloseTo(8.1, 1);
    expect(advies.verhogingVolPct).toBeCloseTo(2.9, 1);
    expect(advies.suikerGramPerL).toBeCloseTo(48.8, 1);
    expect(advies.suikerKgTotaal).toBeCloseTo(39.05, 1);
    expect(advies.overschrijdtLimiet).toBeNull(); // limiet niet geverifieerd
  });

  it("randgeval: doel al bereikt of onder huidig potentieel -> geen verhoging", () => {
    const advies = berekenChaptalisatie(120, 11.0, 800, null);
    expect(advies.verhogingVolPct).toBe(0);
    expect(advies.suikerKgTotaal).toBe(0);
  });

  it("limietoverschrijding: verhoging boven de geverifieerde zone-A-limiet", () => {
    const advies = berekenChaptalisatie(65, 11.0, 800, 2.0); // limiet 2,0 vol%, nodig 2,9
    expect(advies.overschrijdtLimiet).toBe(true);
  });

  it("binnen de limiet: geen overschrijding", () => {
    const advies = berekenChaptalisatie(65, 11.0, 800, 3.5);
    expect(advies.overschrijdtLimiet).toBe(false);
  });
});

describe("Zuurcorrectie", () => {
  it("normaal geval: aanzuren", () => {
    const advies = berekenZuurcorrectie(5.0, 6.5, 500, null, null);
    expect(advies.richting).toBe("aanzuren");
    expect(advies.deltaGL).toBeCloseTo(1.5, 2);
    expect(advies.gramPerL).toBeCloseTo(1.5, 2);
    expect(advies.kgTotaal).toBeCloseTo(0.75, 2);
  });

  it("normaal geval: ontzuren", () => {
    const advies = berekenZuurcorrectie(9.0, 7.0, 500, null, null);
    expect(advies.richting).toBe("ontzuren");
    expect(advies.gramPerL).toBeCloseTo(2 * 0.67, 2);
  });

  it("randgeval: huidig zuur is al gelijk aan doel -> geen dosering", () => {
    const advies = berekenZuurcorrectie(7.0, 7.0, 500, null, null);
    expect(advies.richting).toBe("aanzuren"); // delta === 0 valt in de aanzuren-tak
    expect(advies.gramPerL).toBe(0);
    expect(advies.kgTotaal).toBe(0);
  });

  it("limietoverschrijding bij aanzuren", () => {
    const advies = berekenZuurcorrectie(5.0, 6.5, 500, 1.0, null);
    expect(advies.overschrijdtLimiet).toBe(true);
  });

  it("geen limiet ingesteld -> overschrijdtLimiet is null, geen blokkade", () => {
    const advies = berekenZuurcorrectie(5.0, 6.5, 500, null, null);
    expect(advies.overschrijdtLimiet).toBeNull();
  });
});
