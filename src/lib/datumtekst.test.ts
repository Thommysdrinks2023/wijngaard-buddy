import { describe, expect, it } from "vitest";
import { datumTekst } from "./datumtekst";

describe("datumTekst", () => {
  it("formatteert een normale ISO-datum", () => {
    expect(datumTekst("2026-09-10")).toBe("10 sep. 2026");
  });

  it("geeft het vervangteken bij een leeg veld (PocketBase geeft '' i.p.v. null)", () => {
    expect(datumTekst("")).toBe("—");
    expect(datumTekst(null)).toBe("—");
    expect(datumTekst(undefined)).toBe("—");
  });

  // De kern: date-fns v4 gooit een RangeError op een Invalid Date. Dat gebeurt
  // tijdens render en haalde zo een heel scherm onderuit.
  it("gooit niet op onzin, maar geeft het vervangteken", () => {
    expect(() => datumTekst("geen datum")).not.toThrow();
    expect(datumTekst("geen datum")).toBe("—");
    expect(datumTekst("2026-13-45")).toBe("—");
  });

  it("respecteert een eigen patroon en eigen vervangtekst", () => {
    expect(datumTekst("2026-09-10", "yyyy-MM-dd")).toBe("2026-09-10");
    expect(datumTekst("", "d MMM", "onbekend")).toBe("onbekend");
  });
});
