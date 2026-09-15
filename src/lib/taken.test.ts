// Fase 13 Blok C — een taak moet afgerond kunnen worden, en het dóén van het
// werk moet de taak sluiten. Deze tests leggen vast wanneer dat wel en niet zo is.

import { describe, expect, it } from "vitest";
import {
  bepaalTaakStatus,
  isTaak,
  omschrijfAchterstand,
  sluitregelVoldaan,
  taakOmschrijving,
  type SluitGebeurtenis,
  type TaakRegel,
} from "./taken";

const taak = (o: Partial<TaakRegel> = {}): TaakRegel => ({
  id: o.id ?? "t1",
  datum: o.datum ?? "2026-07-19",
  notitie: o.notitie ?? "TAAK: na-meting SO₂",
  // bewust geen ?? : een expliciete null ("taak hoort bij geen partij") moet
  // null blijven, anders test je de standaardwaarde in plaats van het geval
  partij: "partij" in o ? o.partij : "p1",
  taak_status: o.taak_status,
  taak_afgerond_op: o.taak_afgerond_op,
  taak_afgerond_door: o.taak_afgerond_door,
  taak_sluit_bij: o.taak_sluit_bij ?? "analyse:so2_vrij",
});

const analyse = (o: Partial<SluitGebeurtenis> = {}): SluitGebeurtenis => ({
  id: o.id ?? "a1",
  soort: o.soort ?? "analyse",
  datum: o.datum ?? "2026-07-25",
  partij: o.partij ?? "p1",
  velden: o.velden ?? new Set(["so2_vrij"]),
});

describe("herkennen van taken", () => {
  it("herkent de TAAK:-prefix", () => {
    expect(isTaak("TAAK: iets doen")).toBe(true);
    expect(isTaak("  TAAK: met spatie ervoor")).toBe(true);
    expect(isTaak("Gewone kelderlognotitie")).toBe(false);
    expect(isTaak(undefined)).toBe(false);
  });

  it("haalt de omschrijving zonder prefix eruit", () => {
    expect(taakOmschrijving("TAAK: na-meting SO₂")).toBe("na-meting SO₂");
  });
});

describe("achterstand", () => {
  it("rekent een verstreken taak als te laat", () => {
    const s = bepaalTaakStatus(taak(), [], "2026-07-25");
    expect(s.dagenTeLaat).toBe(6);
    expect(s.urgentie).toBe("te_laat");
    expect(omschrijfAchterstand(s)).toBe("6 dagen te laat");
  });

  it("onderscheidt vandaag van te laat", () => {
    const s = bepaalTaakStatus(taak({ datum: "2026-07-25" }), [], "2026-07-25");
    expect(s.urgentie).toBe("vandaag");
    expect(omschrijfAchterstand(s)).toBe("vandaag");
  });

  it("onderscheidt binnenkort van verder weg", () => {
    expect(bepaalTaakStatus(taak({ datum: "2026-07-28" }), [], "2026-07-25").urgentie).toBe(
      "binnenkort",
    );
    expect(bepaalTaakStatus(taak({ datum: "2026-09-01" }), [], "2026-07-25").urgentie).toBe(
      "toekomst",
    );
  });

  it("zegt enkelvoud bij één dag", () => {
    const s = bepaalTaakStatus(taak({ datum: "2026-07-24" }), [], "2026-07-25");
    expect(omschrijfAchterstand(s)).toBe("1 dag te laat");
  });
});

describe("handmatig afvinken", () => {
  it("telt als afgerond met wie en wanneer", () => {
    const s = bepaalTaakStatus(
      taak({
        taak_status: "afgerond",
        taak_afgerond_op: "2026-07-24",
        taak_afgerond_door: "Thomas",
      }),
      [],
      "2026-07-25",
    );
    expect(s.afgerond).toBe(true);
    expect(s.afgerondWijze).toBe("handmatig");
    expect(s.afgerondDoor).toBe("Thomas");
    expect(s.afgerondOp).toBe("2026-07-24");
  });

  it("wint van een automatische sluiter", () => {
    const s = bepaalTaakStatus(taak({ taak_status: "afgerond" }), [analyse()], "2026-07-25");
    expect(s.afgerondWijze).toBe("handmatig");
  });
});

describe("automatisch sluiten door een gebeurtenis", () => {
  it("sluit de SO₂-taak zodra er een analyse mét vrij SO₂ is", () => {
    const s = bepaalTaakStatus(taak(), [analyse()], "2026-07-25");
    expect(s.afgerond).toBe(true);
    expect(s.afgerondWijze).toBe("automatisch");
    expect(s.afgerondOp).toBe("2026-07-25");
    expect(s.afgerondDoor).toContain("analyse");
  });

  it("sluit NIET bij een analyse zonder het gevraagde veld", () => {
    const s = bepaalTaakStatus(taak(), [analyse({ velden: new Set(["ph"]) })], "2026-07-25");
    expect(s.afgerond).toBe(false);
  });

  it("sluit NIET bij een analyse van vóór de taakdatum", () => {
    // die meting was er al toen de taak werd ingepland
    const s = bepaalTaakStatus(taak(), [analyse({ datum: "2026-07-16" })], "2026-07-25");
    expect(s.afgerond).toBe(false);
  });

  it("sluit NIET bij een analyse van een andere partij", () => {
    const s = bepaalTaakStatus(taak(), [analyse({ partij: "p2" })], "2026-07-25");
    expect(s.afgerond).toBe(false);
  });

  it("sluit op de vroegste passende gebeurtenis", () => {
    const s = bepaalTaakStatus(
      taak(),
      [analyse({ id: "laat", datum: "2026-07-28" }), analyse({ id: "vroeg", datum: "2026-07-20" })],
      "2026-07-30",
    );
    expect(s.afgerondOp).toBe("2026-07-20");
  });

  it("is een algemeen mechanisme, niet SO₂-specifiek", () => {
    // zelfde machinerie met een andere sluitregel
    const dichtheidstaak = taak({ taak_sluit_bij: "analyse:dichtheid_oechsle" });
    expect(
      bepaalTaakStatus(
        dichtheidstaak,
        [analyse({ velden: new Set(["dichtheid_oechsle"]) })],
        "2026-07-25",
      ).afgerond,
    ).toBe(true);
    expect(bepaalTaakStatus(dichtheidstaak, [analyse()], "2026-07-25").afgerond).toBe(false);
  });

  it("blijft open als er geen sluitregel is vastgelegd", () => {
    const s = bepaalTaakStatus(taak({ taak_sluit_bij: "" }), [analyse()], "2026-07-25");
    expect(s.afgerond).toBe(false);
  });

  it("negeert een gebeurtenis van een andere soort", () => {
    const s = bepaalTaakStatus(taak(), [analyse({ soort: "kelderlog" })], "2026-07-25");
    expect(s.afgerond).toBe(false);
  });
});

describe("sluitregelVoldaan afzonderlijk", () => {
  it("accepteert een gebeurtenis op de taakdatum zelf", () => {
    expect(sluitregelVoldaan(taak(), analyse({ datum: "2026-07-19" }))).toBe(true);
  });

  it("accepteert een taak zonder partij ongeacht de partij van de gebeurtenis", () => {
    expect(sluitregelVoldaan(taak({ partij: null }), analyse({ partij: "p9" }))).toBe(true);
  });

  it("accepteert een sluitregel zonder veld (alleen soort)", () => {
    expect(
      sluitregelVoldaan(taak({ taak_sluit_bij: "analyse" }), analyse({ velden: new Set() })),
    ).toBe(true);
  });
});
