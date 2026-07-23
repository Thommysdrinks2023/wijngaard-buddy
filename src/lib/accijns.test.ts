import { describe, expect, it } from "vitest";
import type { Bottelronde, VoorraadMutatie } from "./types";
import {
  berekenAccijnsOverzicht,
  kwartaalPeriode,
  maandPeriode,
  tariefGeverifieerd,
} from "./accijns";

function bottelronde(overrides: Partial<Bottelronde>): Bottelronde {
  return {
    id: "b1",
    partij: "p1",
    producent: null,
    van_tank: "t1",
    botteldatum: "2026-06-01",
    aantal_flessen: 100,
    flesinhoud_ml: 750,
    flestype: "",
    kleur_fles: "",
    parelwijn: false,
    lotnummer: "",
    voedingswaarde_berekening: null,
    notities: "",
    ingevoerd_door: "",
    deleted: false,
    created: "",
    updated: "",
    ...overrides,
  };
}

function mutatie(overrides: Partial<VoorraadMutatie>): VoorraadMutatie {
  return {
    id: "m1",
    voorraad: "v1",
    mutatie_type: "verkocht",
    aantal: -10,
    datum: "2026-06-15",
    afnemer_of_reden: "",
    ingevoerd_door: "",
    notities: "",
    created: "",
    ...overrides,
  };
}

describe("tariefGeverifieerd", () => {
  it("normaal geval: waarde en datum aanwezig", () => {
    expect(tariefGeverifieerd({ waarde: 100, laatst_gecontroleerd: "2026-01-01" })).toBe(true);
  });

  it("randgeval: ontbrekend tarief (null)", () => {
    expect(tariefGeverifieerd(null)).toBe(false);
  });

  it("randgeval: waarde aanwezig maar nooit gecontroleerd", () => {
    expect(tariefGeverifieerd({ waarde: 100, laatst_gecontroleerd: null })).toBe(false);
  });
});

describe("berekenAccijnsOverzicht", () => {
  const basisOpties = {
    flesinhoudPerVoorraad: new Map([["v1", 750]]),
    parelwijnPerVoorraad: new Map([["v1", false]]),
    partijnaamPerVoorraad: new Map([["v1", "Testwijn"]]),
    alcoholPerPartijnaam: new Map<string, number | null>([["Testwijn", 12]]),
  };

  it("normaal geval: gebotteld + uitslag zonder geverifieerd tarief -> accijns null", () => {
    const overzicht = berekenAccijnsOverzicht({
      periode: { van: "2026-06-01", tot: "2026-06-30" },
      bottelrondes: [bottelronde({ botteldatum: "2026-06-05" })],
      mutaties: [mutatie({})],
      ...basisOpties,
      tariefStil: null,
      tariefMousserend: null,
    });
    expect(overzicht.gebotteldFlessen).toBe(100);
    expect(overzicht.gebotteldLiters).toBeCloseTo(75, 2);
    expect(overzicht.uitslagStil.flessen).toBe(10);
    expect(overzicht.accijnsStilEur).toBeNull();
  });

  it("met geverifieerd tarief: accijns wordt berekend (EUR per hL)", () => {
    const overzicht = berekenAccijnsOverzicht({
      periode: { van: "2026-06-01", tot: "2026-06-30" },
      bottelrondes: [bottelronde({ botteldatum: "2026-06-05" })],
      mutaties: [mutatie({})],
      ...basisOpties,
      tariefStil: { waarde: 88.36, laatst_gecontroleerd: "2026-01-01" },
      tariefMousserend: null,
    });
    // 10 flessen x 750ml = 7,5 L = 0,075 hL x 88,36 = 6,627 -> 6,63
    expect(overzicht.accijnsStilEur).toBeCloseTo(6.63, 2);
  });

  it("randgeval: lege periode (geen bottelingen/mutaties)", () => {
    const overzicht = berekenAccijnsOverzicht({
      periode: { van: "2026-06-01", tot: "2026-06-30" },
      bottelrondes: [],
      mutaties: [],
      ...basisOpties,
      tariefStil: { waarde: 88.36, laatst_gecontroleerd: "2026-01-01" },
      tariefMousserend: null,
    });
    expect(overzicht.gebotteldFlessen).toBe(0);
    expect(overzicht.accijnsStilEur).toBe(0);
  });

  it("markeert partijen zonder alcohol% bij uitslag", () => {
    const overzicht = berekenAccijnsOverzicht({
      periode: { van: "2026-06-01", tot: "2026-06-30" },
      bottelrondes: [],
      mutaties: [mutatie({})],
      flesinhoudPerVoorraad: new Map([["v1", 750]]),
      parelwijnPerVoorraad: new Map([["v1", false]]),
      partijnaamPerVoorraad: new Map([["v1", "Onbekende alcohol"]]),
      alcoholPerPartijnaam: new Map([["Onbekende alcohol", null]]),
      tariefStil: null,
      tariefMousserend: null,
    });
    expect(overzicht.partijenZonderAlcohol).toContain("Onbekende alcohol");
  });
});

describe("periode-helpers", () => {
  it("maandPeriode: februari in een schrikkeljaar", () => {
    expect(maandPeriode(2028, 2)).toEqual({ van: "2028-02-01", tot: "2028-02-29" });
  });

  it("kwartaalPeriode: Q1 2026", () => {
    expect(kwartaalPeriode(2026, 1)).toEqual({ van: "2026-01-01", tot: "2026-03-31" });
  });
});
