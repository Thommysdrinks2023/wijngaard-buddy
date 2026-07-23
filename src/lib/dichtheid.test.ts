import { describe, expect, it } from "vitest";
import { vanBrix, vanOechsle, vanSg } from "./dichtheid";

describe("dichtheid", () => {
  it("vanOechsle: normaal geval, oogstdichtheid 75 °Oe", () => {
    const d = vanOechsle(75);
    expect(d.oechsle).toBe(75);
    expect(d.sg).toBeCloseTo(1.075, 4);
    // De lineaire benadering (°Oe/5+0,3) zou hier 15,3 geven — bewust NIET
    // gebruikt (zie commentaar in dichtheid.ts); de SG-formule geeft ~18,2.
    expect(d.brix).toBeCloseTo(18.2, 1);
  });

  it("vanOechsle: randgeval 0 °Oe (water)", () => {
    const d = vanOechsle(0);
    expect(d.sg).toBe(1);
    expect(d.brix).toBe(0);
  });

  it("vanBrix en vanOechsle zijn elkaars inverse", () => {
    const heen = vanOechsle(90);
    const terug = vanBrix(heen.brix);
    expect(terug.oechsle).toBeCloseTo(90, 0);
  });

  it("vanSg geeft dezelfde uitkomst als vanOechsle voor dezelfde dichtheid", () => {
    const viaOechsle = vanOechsle(60);
    const viaSg = vanSg(viaOechsle.sg);
    expect(viaSg.oechsle).toBeCloseTo(60, 0);
    expect(viaSg.brix).toBeCloseTo(viaOechsle.brix, 1);
  });

  it("bijt: een verkeerde constante in de SG-formule verandert de uitkomst", () => {
    // Documenteert de fout uit de oude lineaire benadering — als iemand ooit
    // per ongeluk terugvalt op oechsle/5+0.3, moet deze test dat vangen.
    const fout = 75 / 5 + 0.3;
    const d = vanOechsle(75);
    expect(d.brix).not.toBeCloseTo(fout, 1);
  });
});
