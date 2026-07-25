// Fase 13 Blok B — de veiligheidstermijn is de enige berekening in deze app
// met juridische gevolgen. Deze tests leggen de randgevallen vast.

import { describe, expect, it } from "vitest";
import { berekenWachttijden, dagenTussen, omschrijfWachttijd } from "./wachttijd";

const RIJEN = ["rij1", "rij2", "rij3"];
const MIDDELEN = [
  { naam: "Luna Privilege", veiligheidstermijn_dagen: 21 },
  { naam: "Spuitzwavel", veiligheidstermijn_dagen: 7 },
  { naam: "Middel zonder termijn", veiligheidstermijn_dagen: null },
];

const spuiten = (o: Partial<Parameters<typeof berekenWachttijden>[0][0]>) => ({
  id: o.id ?? "w1",
  datum: o.datum ?? "2026-07-20",
  taak: o.taak ?? "Spuiten",
  rij: o.rij,
  middel: o.middel,
  wachttijd_dagen: o.wachttijd_dagen,
});

describe("handmatig ingevulde wachttijd", () => {
  it("houdt een rij vast tot spuitdatum + termijn", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Luna", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.get("rij1")?.vrijVanaf).toBe("2026-08-10");
    expect(w.get("rij1")?.dagenTeGaan).toBe(16);
    expect(w.get("rij1")?.bepalend.bron).toBe("handmatig");
  });

  it("raakt alleen de bespoten rij", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.has("rij1")).toBe(true);
    expect(w.has("rij2")).toBe(false);
  });
});

describe("reikwijdte: hele wijngaard", () => {
  it("raakt ALLE rijen als er geen rij is ingevuld", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: null, wachttijd_dagen: 14 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect([...w.keys()].sort()).toEqual(["rij1", "rij2", "rij3"]);
    expect(w.get("rij2")?.bepalend.heleWijngaard).toBe(true);
  });

  it("behandelt undefined rij hetzelfde als leeg", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: undefined, wachttijd_dagen: 14 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.size).toBe(3);
  });
});

describe("tweede bron: Ctgb-veiligheidstermijn", () => {
  it("gebruikt de Ctgb-termijn als er geen handmatige is ingevuld", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Luna Privilege" })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.get("rij1")?.bepalend.termijnDagen).toBe(21);
    expect(w.get("rij1")?.bepalend.bron).toBe("ctgb");
  });

  it("herkent het middel ook bij een gedeeltelijke naam", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "spuitzwavel" })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.get("rij1")?.bepalend.termijnDagen).toBe(7);
  });

  it("laat de handmatige waarde voorgaan op de Ctgb-termijn", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Luna Privilege", wachttijd_dagen: 30 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.get("rij1")?.bepalend.termijnDagen).toBe(30);
    expect(w.get("rij1")?.bepalend.bron).toBe("handmatig");
  });

  it("verzint geen termijn als beide bronnen niets opleveren", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Iets onbekends" })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.size).toBe(0);
  });

  it("verzint geen termijn bij een middel dat er wel is maar zonder termijn", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Middel zonder termijn" })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.size).toBe(0);
  });
});

describe("verlopen termijnen", () => {
  it("laat een rij los zodra de termijn verstreken is", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", datum: "2026-07-01", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25", // vrij vanaf 22 juli
    );
    expect(w.has("rij1")).toBe(false);
  });

  it("is op de vrijgavedag zelf niet meer geblokkeerd", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", datum: "2026-07-04", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25", // vrijVanaf = 25 juli
    );
    expect(w.has("rij1")).toBe(false);
  });

  it("is de dag ervóór nog wél geblokkeerd", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", datum: "2026-07-04", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-24",
    );
    expect(w.get("rij1")?.dagenTeGaan).toBe(1);
  });
});

describe("meerdere bespuitingen op dezelfde rij", () => {
  it("laat de langst lopende termijn bepalen", () => {
    const w = berekenWachttijden(
      [
        spuiten({
          id: "a",
          rij: "rij1",
          datum: "2026-07-20",
          wachttijd_dagen: 7,
          middel: "Zwavel",
        }),
        spuiten({ id: "b", rij: "rij1", datum: "2026-07-18", wachttijd_dagen: 21, middel: "Luna" }),
      ],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.get("rij1")?.vrijVanaf).toBe("2026-08-08"); // 18 juli + 21
    expect(w.get("rij1")?.bepalend.middel).toBe("Luna");
    expect(w.get("rij1")?.alleBronnen).toHaveLength(2);
  });

  it("combineert een rij-bespuiting met een hele-wijngaard-bespuiting", () => {
    const w = berekenWachttijden(
      [
        spuiten({ id: "a", rij: "rij1", datum: "2026-07-20", wachttijd_dagen: 3 }),
        spuiten({ id: "b", rij: null, datum: "2026-07-22", wachttijd_dagen: 14 }),
      ],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.get("rij1")?.vrijVanaf).toBe("2026-08-05");
    expect(w.get("rij1")?.bepalend.heleWijngaard).toBe(true);
    expect(w.get("rij3")?.vrijVanaf).toBe("2026-08-05");
  });
});

describe("afbakening", () => {
  it("negeert taken die geen bespuiting zijn", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", taak: "Maaien", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.size).toBe(0);
  });

  it("negeert een bespuiting zonder datum", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", datum: "", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.size).toBe(0);
  });

  it("negeert een wachttijd van 0 (leeg PocketBase-getalveld)", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", wachttijd_dagen: 0, middel: "Iets onbekends" })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(w.size).toBe(0);
  });
});

describe("omschrijving voor scherm en record", () => {
  it("noemt middel, datum, termijn, bron en vrijgavedatum", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Luna Privilege", wachttijd_dagen: 21 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    const tekst = omschrijfWachttijd(w.get("rij1")!, 12);
    expect(tekst).toContain("Rij 12");
    expect(tekst).toContain("Luna Privilege");
    expect(tekst).toContain("2026-07-20");
    expect(tekst).toContain("21 dagen (handmatig ingevuld)");
    expect(tekst).toContain("2026-08-10");
  });

  it("vermeldt expliciet als de termijn uit de Ctgb-lijst komt", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: "rij1", middel: "Luna Privilege" })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(omschrijfWachttijd(w.get("rij1")!, 1)).toContain("volgens de Ctgb-lijst");
  });

  it("vermeldt dat het om een bespuiting van de hele wijngaard ging", () => {
    const w = berekenWachttijden(
      [spuiten({ rij: null, wachttijd_dagen: 14 })],
      MIDDELEN,
      RIJEN,
      "2026-07-25",
    );
    expect(omschrijfWachttijd(w.get("rij1")!, 1)).toContain("hele wijngaard");
  });
});

describe("dagenTussen", () => {
  it("telt kalenderdagen", () => {
    expect(dagenTussen("2026-07-25", "2026-08-10")).toBe(16);
    expect(dagenTussen("2026-07-25", "2026-07-25")).toBe(0);
  });

  it("werkt over een maandgrens en een zomertijdovergang", () => {
    expect(dagenTussen("2026-03-28", "2026-04-01")).toBe(4);
  });
});
