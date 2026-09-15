import { describe, expect, it } from "vitest";
import type { AccijnsCategorie, Bottelronde, VoorraadMutatie } from "./types";
import {
  accijnsplichtigeLiters,
  berekenAccijnsBijBotteling,
  berekenAccijnsOverzicht,
  kwartaalPeriode,
  leesBelastbaarMoment,
  maandPeriode,
  tariefGeverifieerd,
  type Tarief,
} from "./accijns";

function bottelronde(overrides: Partial<Bottelronde>): Bottelronde {
  return {
    id: "b1",
    partij: "p1",
    eigenaar: null,
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

describe("belastbaar moment botteling", () => {
  const stil: AccijnsCategorie = {
    id: "c-stil",
    naam: "Wijn, stil, > 8,5% vol",
    tariefsleutel: "accijns_stille_wijn_per_hl",
    heffing: "accijns",
    mousserend: false,
    alcohol_bereik: "hoog",
    volgorde: 2,
    actief: true,
  };
  const mousserend: AccijnsCategorie = {
    ...stil,
    id: "c-mouss",
    naam: "Wijn, mousserend, > 8,5% vol",
    tariefsleutel: "accijns_mousserende_wijn_per_hl",
    mousserend: true,
    volgorde: 4,
  };
  const sap: AccijnsCategorie = {
    ...stil,
    id: "c-sap",
    naam: "Alcoholvrij / vruchtensap (verbruiksbelasting)",
    tariefsleutel: "verbruiksbelasting_alcoholvrij_per_hl",
    heffing: "verbruiksbelasting",
    volgorde: 8,
  };
  const categorieen = [stil, mousserend, sap];
  const periode = { van: "2026-07-01", tot: "2026-09-30" };
  const geverifieerd = (waarde: number) => ({ waarde, laatst_gecontroleerd: "2026-01-01" });

  it("leest de instelling: alles behalve uitslag is botteling", () => {
    expect(leesBelastbaarMoment("botteling")).toBe("botteling");
    expect(leesBelastbaarMoment(" Uitslag ")).toBe("uitslag");
    expect(leesBelastbaarMoment("")).toBe("botteling");
    expect(leesBelastbaarMoment(undefined)).toBe("botteling");
  });

  it("gebruikt het vastgelegde accijnsvolume, en valt terug op flessen x inhoud", () => {
    expect(
      accijnsplichtigeLiters(bottelronde({ accijnsplichtig_volume_l: 630, aantal_flessen: 840 })),
    ).toBe(630);
    // Bottelronde van vóór Blok C: veld ontbreekt (0), 30 x 750 ml = 22,5 L
    expect(
      accijnsplichtigeLiters(bottelronde({ accijnsplichtig_volume_l: 0, aantal_flessen: 30 })),
    ).toBe(22.5);
    // aantal_flessen_gevuld is leidend als het er is
    expect(
      accijnsplichtigeLiters(
        bottelronde({ aantal_flessen: 100, aantal_flessen_gevuld: 98, flesinhoud_ml: 500 }),
      ),
    ).toBe(49);
  });

  it("normaal geval: per categorie liters en bedrag, totaal over de accijnsregels", () => {
    const r = berekenAccijnsBijBotteling({
      periode,
      bottelrondes: [
        bottelronde({
          id: "b1",
          botteldatum: "2026-08-28",
          aantal_flessen: 840,
          accijnsplichtig_volume_l: 630,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "b2",
          botteldatum: "2026-09-02",
          aantal_flessen: 200,
          accijnsplichtig_volume_l: 150,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "b3",
          botteldatum: "2026-09-10",
          aantal_flessen: 100,
          accijnsplichtig_volume_l: 75,
          accijns_categorie: "c-mouss",
        }),
      ],
      categorieen,
      tariefPerSleutel: new Map([
        ["accijns_stille_wijn_per_hl", geverifieerd(100)],
        ["accijns_mousserende_wijn_per_hl", geverifieerd(200)],
      ]),
    });
    expect(r.accijns.map((x) => [x.categorie.id, x.flessen, x.liters, x.bedragEur])).toEqual([
      ["c-stil", 1040, 780, 780], // 7,8 hl x 100
      ["c-mouss", 100, 75, 150], // 0,75 hl x 200
    ]);
    expect(r.totaalAccijnsEur).toBe(930);
    expect(r.totaalLiters).toBe(855);
    expect(r.totaalFlessen).toBe(1140);
    expect(r.zonderCategorie).toEqual([]);
    expect(r.verbruiksbelasting).toEqual([]);
  });

  it("geen bedrag en geen totaal zolang een tarief niet geverifieerd is", () => {
    const r = berekenAccijnsBijBotteling({
      periode,
      bottelrondes: [
        bottelronde({
          botteldatum: "2026-08-28",
          accijnsplichtig_volume_l: 630,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "b2",
          botteldatum: "2026-09-10",
          accijnsplichtig_volume_l: 75,
          accijns_categorie: "c-mouss",
        }),
      ],
      categorieen,
      tariefPerSleutel: new Map<string, Tarief | null>([
        ["accijns_stille_wijn_per_hl", geverifieerd(100)],
        // mousserend: waarde zonder controle-datum telt niet
        ["accijns_mousserende_wijn_per_hl", { waarde: 200, laatst_gecontroleerd: null }],
      ]),
    });
    expect(r.accijns[0].bedragEur).toBe(630);
    expect(r.accijns[1].bedragEur).toBeNull();
    expect(r.totaalAccijnsEur).toBeNull(); // geen halve som presenteren
    expect(r.accijns[1].liters).toBe(75); // het volume staat er wél
  });

  it("bottelronde zonder categorie: wél in de liters, geen bedrag, apart gemeld", () => {
    const r = berekenAccijnsBijBotteling({
      periode,
      bottelrondes: [
        bottelronde({
          id: "oud",
          botteldatum: "2026-07-16",
          aantal_flessen: 30,
          accijns_categorie: null,
        }),
        bottelronde({
          id: "onbekend",
          botteldatum: "2026-08-01",
          accijnsplichtig_volume_l: 10,
          accijns_categorie: "bestaat-niet",
        }),
        bottelronde({
          id: "b1",
          botteldatum: "2026-08-28",
          accijnsplichtig_volume_l: 630,
          accijns_categorie: "c-stil",
        }),
      ],
      categorieen,
      tariefPerSleutel: new Map([["accijns_stille_wijn_per_hl", geverifieerd(100)]]),
    });
    expect(r.zonderCategorie).toEqual([
      { bottelrondeId: "oud", botteldatum: "2026-07-16", liters: 22.5 },
      { bottelrondeId: "onbekend", botteldatum: "2026-08-01", liters: 10 },
    ]);
    expect(r.accijns).toHaveLength(1);
    expect(r.totaalAccijnsEur).toBe(630); // alleen over wat een categorie heeft
    expect(r.totaalLiters).toBe(662.5); // maar de liters tellen wel mee
  });

  it("verbruiksbelasting staat apart en telt niet mee in de accijns", () => {
    const r = berekenAccijnsBijBotteling({
      periode,
      bottelrondes: [
        bottelronde({
          id: "b1",
          botteldatum: "2026-08-28",
          accijnsplichtig_volume_l: 630,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "s1",
          botteldatum: "2026-08-29",
          accijnsplichtig_volume_l: 100,
          accijns_categorie: "c-sap",
        }),
      ],
      categorieen,
      tariefPerSleutel: new Map([
        ["accijns_stille_wijn_per_hl", geverifieerd(100)],
        ["verbruiksbelasting_alcoholvrij_per_hl", geverifieerd(10)],
      ]),
    });
    expect(r.accijns.map((x) => x.categorie.id)).toEqual(["c-stil"]);
    expect(r.verbruiksbelasting.map((x) => [x.categorie.id, x.bedragEur])).toEqual([["c-sap", 10]]);
    expect(r.totaalAccijnsEur).toBe(630);
  });

  it("randgeval: periodegrenzen zijn inclusief, erbuiten telt niet", () => {
    const r = berekenAccijnsBijBotteling({
      periode: { van: "2026-08-01", tot: "2026-08-31" },
      bottelrondes: [
        bottelronde({
          id: "a",
          botteldatum: "2026-07-31",
          accijnsplichtig_volume_l: 1,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "b",
          botteldatum: "2026-08-01",
          accijnsplichtig_volume_l: 2,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "c",
          botteldatum: "2026-08-31",
          accijnsplichtig_volume_l: 4,
          accijns_categorie: "c-stil",
        }),
        bottelronde({
          id: "d",
          botteldatum: "2026-09-01",
          accijnsplichtig_volume_l: 8,
          accijns_categorie: "c-stil",
        }),
      ],
      categorieen,
      tariefPerSleutel: new Map(),
    });
    expect(r.totaalLiters).toBe(6);
    expect(r.accijns[0].bedragEur).toBeNull(); // geen tarief bekend
  });

  it("randgeval: lege periode geeft nul, geen null", () => {
    const r = berekenAccijnsBijBotteling({
      periode,
      bottelrondes: [],
      categorieen,
      tariefPerSleutel: new Map([["accijns_stille_wijn_per_hl", geverifieerd(100)]]),
    });
    expect(r.accijns).toEqual([]);
    expect(r.totaalAccijnsEur).toBe(0);
    expect(r.totaalLiters).toBe(0);
  });
});
