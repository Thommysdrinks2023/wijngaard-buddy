// Fase 13 Blok A — "niet gemeten" mag nooit als 0 op het scherm komen, en een
// échte nulmeting mag nooit verborgen worden. Die twee eisen botsen, en deze
// tests leggen vast waar de grens ligt.

import { describe, expect, it } from "vitest";
import {
  isGemeten,
  meetwaarde,
  parseGemetenVelden,
  serialiseerGemetenVelden,
  toonMeetwaarde,
} from "./meetwaarde";

describe("velden waar 0 fysiek onmogelijk is", () => {
  it("leest pH 0 als niet gemeten, ook zonder registratie", () => {
    expect(meetwaarde("ph", 0)).toBeNull();
  });

  it("laat een echte pH gewoon door", () => {
    expect(meetwaarde("ph", 3.4)).toBe(3.4);
  });

  it("wijst een pH buiten het fysiek mogelijke bereik af", () => {
    expect(meetwaarde("ph", 0.5)).toBeNull();
    expect(meetwaarde("ph", 14)).toBeNull();
  });

  it("leest 0 °Oechsle als niet gemeten — dit veroorzaakte de valse gistingswaarschuwing", () => {
    expect(meetwaarde("dichtheid_oechsle", 0)).toBeNull();
    expect(meetwaarde("dichtheid_oechsle", 75)).toBe(75);
  });

  it("wijst een SG onder 0,9 af (bestaat niet in most of wijn)", () => {
    expect(meetwaarde("dichtheid_sg", 0)).toBeNull();
    expect(meetwaarde("dichtheid_sg", 0.5)).toBeNull();
    expect(meetwaarde("dichtheid_sg", 1.085)).toBe(1.085);
  });

  it("geeft vluchtig zuur een marge in plaats van een harde nul", () => {
    expect(meetwaarde("vluchtig_zuur_g_l", 0)).toBeNull();
    expect(meetwaarde("vluchtig_zuur_g_l", 0.01)).toBeNull();
    expect(meetwaarde("vluchtig_zuur_g_l", 0.3)).toBe(0.3);
  });
});

describe("velden waar 0 een geldige uitkomst is", () => {
  it("toont vrij SO₂ 0 WEL als de meting expliciet is vastgelegd", () => {
    // een ongezwavelde most heeft echt 0 mg/L vrij SO₂ — dat is een meting
    const gemeten = parseGemetenVelden("so2_vrij,ph");
    expect(meetwaarde("so2_vrij", 0, gemeten)).toBe(0);
    expect(toonMeetwaarde("so2_vrij", 0, gemeten)).toBe("0");
  });

  it("verbergt vrij SO₂ 0 als het veld niet is ingevuld", () => {
    const gemeten = parseGemetenVelden("ph");
    expect(meetwaarde("so2_vrij", 0, gemeten)).toBeNull();
  });

  it("verbergt bij een oudere analyse zonder registratie ook een 0 (bewuste aanname)", () => {
    expect(meetwaarde("so2_vrij", 0)).toBeNull();
    expect(meetwaarde("alcohol_pct", 0)).toBeNull();
    expect(meetwaarde("restsuiker_g_l", 0)).toBeNull();
  });

  it("laat een droge wijn met 0 g/L restsuiker zien mits vastgelegd", () => {
    expect(meetwaarde("restsuiker_g_l", 0, parseGemetenVelden("restsuiker_g_l"))).toBe(0);
  });

  it("laat most met 0% alcohol zien mits vastgelegd", () => {
    expect(meetwaarde("alcohol_pct", 0, parseGemetenVelden("alcohol_pct"))).toBe(0);
  });
});

describe("registratie is leidend boven plausibiliteit", () => {
  it("verbergt een waarde die niet in de registratie staat, ook al is hij plausibel", () => {
    // scenario: veld ooit gevuld, later leeggemaakt — registratie wint
    expect(meetwaarde("ph", 3.4, parseGemetenVelden("so2_vrij"))).toBeNull();
  });

  it("blijft onmogelijke waarden afwijzen, ook als ze in de registratie staan", () => {
    // een pH van 0 die als "gemeten" is vastgelegd blijft onzin
    expect(meetwaarde("ph", 0, parseGemetenVelden("ph"))).toBeNull();
  });
});

describe("hulpfuncties", () => {
  it("verwerkt lege of ontbrekende registratie zonder te struikelen", () => {
    expect(parseGemetenVelden(null).size).toBe(0);
    expect(parseGemetenVelden("").size).toBe(0);
    expect(parseGemetenVelden("  ").size).toBe(0);
  });

  it("serialiseert gesorteerd en zonder duplicaten", () => {
    expect(serialiseerGemetenVelden(["ph", "so2_vrij", "ph", ""])).toBe("ph,so2_vrij");
  });

  it("toont een streepje in plaats van een niet-gemeten waarde", () => {
    expect(toonMeetwaarde("ph", 0)).toBe("—");
    expect(toonMeetwaarde("ph", 3.42, undefined, 2)).toBe("3.42");
  });

  it("behandelt null, undefined en NaN als niet gemeten", () => {
    expect(meetwaarde("ph", null)).toBeNull();
    expect(meetwaarde("ph", undefined)).toBeNull();
    expect(meetwaarde("ph", Number.NaN)).toBeNull();
  });

  it("isGemeten spiegelt meetwaarde", () => {
    expect(isGemeten("dichtheid_oechsle", 0)).toBe(false);
    expect(isGemeten("dichtheid_oechsle", 80)).toBe(true);
  });
});
