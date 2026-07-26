// Fase 13 Blok E — het voorstel dat oogst naar een partij tilt.
// Dit is rekenwerk waar een kelderman blind op moet kunnen varen, dus de
// randgevallen liggen hier vast: ontbrekende metingen, nulmetingen, meerdere
// oogstdagen per rij, en afronding van percentages.

import { describe, expect, it } from "vitest";
import {
  gewogenStartdichtheid,
  ongekoppeldeOogst,
  omschrijfSamenstelling,
  schatVolume,
  stelNaamVoor,
  stelPartijVoor,
  verdeelRassen,
  type OogstPost,
  type RijpheidsMeting,
} from "./oogst-naar-partij";

const o = (p: Partial<OogstPost> & { id: string }): OogstPost => ({
  rij: p.rij === undefined ? "rij1" : p.rij,
  ras: p.ras ?? "Johanniter",
  datum: p.datum ?? "2026-09-20",
  kg: p.kg ?? 100,
  partij: p.partij ?? null,
  ...p,
});

describe("verdeelRassen", () => {
  it("normaal geval: verdeelt kilo's over rassen, grootste eerst", () => {
    const r = verdeelRassen([
      o({ id: "a", ras: "Solaris", kg: 200 }),
      o({ id: "b", ras: "Johanniter", kg: 600 }),
      o({ id: "c", ras: "Solaris", kg: 200 }),
    ]);
    expect(r.map((x) => x.ras)).toEqual(["Johanniter", "Solaris"]);
    expect(r[0].kg).toBe(600);
    expect(r[0].aandeel).toBe(60);
    expect(r[1].aandeel).toBe(40);
  });

  it("percentages tellen altijd op tot exact 100", () => {
    // 1/3 elk zou naar 33+33+33 = 99 afronden
    const r = verdeelRassen([
      o({ id: "a", ras: "A", kg: 100 }),
      o({ id: "b", ras: "B", kg: 100 }),
      o({ id: "c", ras: "C", kg: 100 }),
    ]);
    expect(r.reduce((s, x) => s + x.aandeel, 0)).toBe(100);
  });

  it("randgeval: regels met 0 kg tellen niet mee", () => {
    const r = verdeelRassen([o({ id: "a", ras: "A", kg: 100 }), o({ id: "b", ras: "B", kg: 0 })]);
    expect(r).toHaveLength(1);
    expect(r[0].aandeel).toBe(100);
  });

  it("randgeval: lege invoer geeft lege lijst, geen deling door nul", () => {
    expect(verdeelRassen([])).toEqual([]);
  });
});

describe("omschrijfSamenstelling", () => {
  it("schrijft de verhouding leesbaar op", () => {
    const r = verdeelRassen([
      o({ id: "a", ras: "Johanniter", kg: 600 }),
      o({ id: "b", ras: "Solaris", kg: 400 }),
    ]);
    expect(omschrijfSamenstelling(r)).toBe("Johanniter 60% · Solaris 40%");
  });
});

describe("gewogenStartdichtheid", () => {
  const metingen: RijpheidsMeting[] = [
    { rij: "rij1", datum: "2026-09-10", brix: 17 },
    { rij: "rij1", datum: "2026-09-18", brix: 20 }, // laatste vóór oogst
    { rij: "rij2", datum: "2026-09-18", brix: 14 },
  ];

  it("weegt op kilo's, niet op aantal rijen", () => {
    // rij1: 900 kg @ 20 Brix, rij2: 100 kg @ 14 Brix -> (900*20+100*14)/1000 = 19,4
    const d = gewogenStartdichtheid(
      [o({ id: "a", rij: "rij1", kg: 900 }), o({ id: "b", rij: "rij2", kg: 100 })],
      metingen,
    );
    expect(d?.brix).toBe(19.4);
    expect(d?.rijenMetMeting).toBe(2);
  });

  it("gebruikt per rij de LAATSTE meting op of vóór de oogstdatum", () => {
    const d = gewogenStartdichtheid([o({ id: "a", rij: "rij1", kg: 100 })], metingen);
    expect(d?.brix).toBe(20); // niet de 17 van 10 september
  });

  it("negeert een meting van ná de oogst", () => {
    const d = gewogenStartdichtheid(
      [o({ id: "a", rij: "rij1", kg: 100, datum: "2026-09-12" })],
      [
        { rij: "rij1", datum: "2026-09-10", brix: 17 },
        { rij: "rij1", datum: "2026-09-20", brix: 22 },
      ],
    );
    expect(d?.brix).toBe(17);
  });

  it("bijt: een Brix van 0 telt niet mee als meting", () => {
    // Zonder de meetwaarde-controle zou dit (100*0 + 100*20)/200 = 10 geven:
    // een partij die op 10 Brix zou starten terwijl er 20 gemeten is.
    const d = gewogenStartdichtheid(
      [o({ id: "a", rij: "rij1", kg: 100 }), o({ id: "b", rij: "rij2", kg: 100 })],
      [
        { rij: "rij1", datum: "2026-09-18", brix: 20 },
        { rij: "rij2", datum: "2026-09-18", brix: 0 },
      ],
    );
    expect(d?.brix).toBe(20);
    expect(d?.rijenMetMeting).toBe(1);
    expect(d?.rijenTotaal).toBe(2); // wél zichtbaar dat het maar 1 van 2 rijen dekt
  });

  it("bijt: een meting van vóór de véraison telt niet mee", () => {
    // Dit is de fout die tijdens het testen op 26 juli 2026 boven kwam: een
    // Brix-meting van 14 juni bepaalde mee de startdichtheid van een oogst op
    // 20 september. Het voorstel oogde geloofwaardig en was onzin.
    const d = gewogenStartdichtheid(
      [
        o({ id: "a", rij: "rij1", kg: 900, datum: "2026-09-20" }),
        o({ id: "b", rij: "rij2", kg: 100, datum: "2026-09-20" }),
      ],
      [
        { rij: "rij1", datum: "2026-09-17", brix: 20.4 },
        { rij: "rij2", datum: "2026-06-14", brix: 18.5 }, // drie maanden oud
      ],
    );
    expect(d?.brix).toBe(20.4); // alleen rij1
    expect(d?.rijenMetMeting).toBe(1);
    expect(d?.rijenTeOud).toBe(1);
  });

  it("de grens ligt op precies 21 dagen: die telt nog wél mee", () => {
    const d = gewogenStartdichtheid(
      [o({ id: "a", rij: "rij1", kg: 100, datum: "2026-09-20" })],
      [{ rij: "rij1", datum: "2026-08-30", brix: 18 }], // 21 dagen
    );
    expect(d?.brix).toBe(18);
    expect(d?.oudsteMetingDagen).toBe(21);
  });

  it("22 dagen valt af", () => {
    const d = gewogenStartdichtheid(
      [o({ id: "a", rij: "rij1", kg: 100, datum: "2026-09-20" })],
      [{ rij: "rij1", datum: "2026-08-29", brix: 18 }],
    );
    expect(d).toBeNull();
  });

  it("randgeval: geen enkele bruikbare meting -> null, geen verzonnen getal", () => {
    expect(gewogenStartdichtheid([o({ id: "a", rij: "rij9", kg: 100 })], metingen)).toBeNull();
  });

  it("randgeval: oogst zonder rij (hele wijngaard) -> null", () => {
    expect(gewogenStartdichtheid([o({ id: "a", rij: null, kg: 100 })], metingen)).toBeNull();
  });

  it("rekent Brix door naar °Oe en SG", () => {
    const d = gewogenStartdichtheid([o({ id: "a", rij: "rij1", kg: 100 })], metingen);
    expect(d?.oechsle).toBeGreaterThan(70);
    expect(d?.oechsle).toBeLessThan(95);
    expect(d?.sg).toBeGreaterThan(1.05);
  });

  it("meldt de meetperiode zodat de kelderman de ouderdom ziet", () => {
    const d = gewogenStartdichtheid(
      [o({ id: "a", rij: "rij1", kg: 100 }), o({ id: "b", rij: "rij2", kg: 100 })],
      [
        { rij: "rij1", datum: "2026-09-12", brix: 19 },
        { rij: "rij2", datum: "2026-09-18", brix: 21 },
      ],
    );
    expect(d?.vanDatum).toBe("2026-09-12");
    expect(d?.totDatum).toBe("2026-09-18");
  });
});

describe("schatVolume", () => {
  it("normaal geval: 1000 kg bij 70 L/100 kg = 700 L", () => {
    expect(schatVolume(1000, 70)).toBe(700);
  });

  it("volgt een aangepast rendement", () => {
    expect(schatVolume(1000, 65)).toBe(650);
  });

  it("randgeval: 0 kg of 0 rendement geeft 0, geen NaN", () => {
    expect(schatVolume(0, 70)).toBe(0);
    expect(schatVolume(1000, 0)).toBe(0);
  });
});

describe("stelNaamVoor", () => {
  it("één ras: de rasnaam", () => {
    expect(stelNaamVoor([{ ras: "Muscaris", kg: 100, aandeel: 100 }])).toBe("Muscaris");
  });

  it("meerdere rassen: grootste + cuvée", () => {
    expect(
      stelNaamVoor([
        { ras: "Johanniter", kg: 600, aandeel: 60 },
        { ras: "Solaris", kg: 400, aandeel: 40 },
      ]),
    ).toBe("Johanniter cuvée");
  });
});

describe("stelPartijVoor", () => {
  const metingen: RijpheidsMeting[] = [{ rij: "rij1", datum: "2026-09-18", brix: 20 }];

  it("normaal geval: vult alles wat de app al wist", () => {
    const v = stelPartijVoor(
      [
        o({ id: "a", rij: "rij1", ras: "Johanniter", kg: 600, datum: "2026-09-19" }),
        o({ id: "b", rij: "rij1", ras: "Solaris", kg: 400, datum: "2026-09-20" }),
      ],
      metingen,
    );
    expect(v?.totaalKg).toBe(1000);
    expect(v?.samenstelling).toBe("Johanniter 60% · Solaris 40%");
    expect(v?.startVolumeL).toBe(700);
    expect(v?.persDatum).toBe("2026-09-20"); // laatste oogstdag
    expect(v?.jaargang).toBe(2026);
    expect(v?.naam).toBe("Johanniter cuvée");
    expect(v?.oogstIds).toEqual(["a", "b"]);
  });

  it("een afwijkend rendement werkt door in het volume", () => {
    const v = stelPartijVoor([o({ id: "a", kg: 1000 })], metingen, 60);
    expect(v?.startVolumeL).toBe(600);
    expect(v?.rendement).toBe(60);
  });

  it("randgeval: zonder bruikbare metingen blijft de dichtheid leeg", () => {
    const v = stelPartijVoor([o({ id: "a", rij: "rij7", kg: 100 })], metingen);
    expect(v?.dichtheid).toBeNull();
    expect(v?.totaalKg).toBe(100); // de rest van het voorstel blijft wel bruikbaar
  });

  it("randgeval: lege oogst geeft null", () => {
    expect(stelPartijVoor([], metingen)).toBeNull();
    expect(stelPartijVoor([o({ id: "a", kg: 0 })], metingen)).toBeNull();
  });
});

describe("ongekoppeldeOogst", () => {
  it("toont alleen regels zonder partij, nieuwste eerst", () => {
    const lijst = ongekoppeldeOogst([
      o({ id: "a", datum: "2026-09-10" }),
      o({ id: "b", datum: "2026-09-20", partij: "p1" }),
      o({ id: "c", datum: "2026-09-15" }),
    ]);
    expect(lijst.map((x) => x.id)).toEqual(["c", "a"]);
  });

  it("filtert op seizoen wanneer gevraagd", () => {
    const lijst = ongekoppeldeOogst(
      [o({ id: "a", datum: "2025-09-10" }), o({ id: "b", datum: "2026-09-10" })],
      2026,
    );
    expect(lijst.map((x) => x.id)).toEqual(["b"]);
  });
});
