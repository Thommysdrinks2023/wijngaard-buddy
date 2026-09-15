// Fase 11 Blok 6 — de vijf faalgevallen moeten uit elkaar te houden zijn.
// Deze tests zijn de vangrail: gooit iemand later weer alles op één hoop, dan
// valt hier iets om. Zie de toelichting bovenaan laadfout.ts.

import { describe, expect, it } from "vitest";
import { classificeerLeesfout, LaadFout } from "./laadfout";

describe("classificeerLeesfout", () => {
  it("herkent een verlopen sessie (401)", () => {
    const f = classificeerLeesfout({ status: 401 }, "de tanks");
    expect(f.soort).toBe("niet_ingelogd");
    expect(f.message).toMatch(/log opnieuw in/i);
    expect(f.toonAanGebruiker).toBe(true);
  });

  it("herkent onvoldoende rechten (403) als hetzelfde geval", () => {
    expect(classificeerLeesfout({ status: 403 }, "de tanks").soort).toBe("niet_ingelogd");
  });

  it("herkent een onbereikbare server (status 0)", () => {
    const f = classificeerLeesfout({ status: 0 }, "de partijen");
    expect(f.soort).toBe("geen_verbinding");
    expect(f.message).toMatch(/bereik/i);
  });

  it("herkent een geannuleerd verzoek en markeert het als niet-tonen", () => {
    const f = classificeerLeesfout({ isAbort: true, status: 0 }, "de voorraad");
    expect(f.soort).toBe("geannuleerd");
    // dit is de kern: auto-cancellation is geen storing en mag niet als
    // "kon niet laden" aan Thomas worden getoond
    expect(f.toonAanGebruiker).toBe(false);
  });

  it("herkent een AbortError ook zonder isAbort-vlag", () => {
    expect(classificeerLeesfout({ name: "AbortError" }, "de voorraad").soort).toBe("geannuleerd");
  });

  it("laat een geannuleerd verzoek voorgaan op de statuscode", () => {
    // PocketBase geeft een geannuleerd verzoek status 0; zonder de isAbort-check
    // zou dat als "geen verbinding" worden gelezen — precies de verwarring uit
    // Fase 3 en Fase 10.
    const f = classificeerLeesfout({ isAbort: true, status: 0 }, "de inzichten");
    expect(f.soort).not.toBe("geen_verbinding");
  });

  it("herkent een serverfout (5xx) apart van een netwerkprobleem", () => {
    const f = classificeerLeesfout({ status: 503 }, "het tankboek");
    expect(f.soort).toBe("server_fout");
    expect(f.message).toContain("503");
  });

  it("valt terug op onbekend bij een onverwachte statuscode", () => {
    const f = classificeerLeesfout({ status: 418 }, "de orders");
    expect(f.soort).toBe("onbekend");
    expect(f.message).toContain("418");
  });

  it("behandelt een fout zonder enige vorm als geen verbinding", () => {
    // een kale TypeError uit fetch heeft geen status: dat is een netwerkprobleem
    expect(classificeerLeesfout(new TypeError("Failed to fetch"), "de rijen").soort).toBe(
      "geen_verbinding",
    );
  });

  it("levert altijd een LaadFout met de collectienaam in de melding", () => {
    for (const invoer of [{ status: 401 }, { status: 0 }, { status: 503 }, { status: 418 }]) {
      const f = classificeerLeesfout(invoer, "de klanten");
      expect(f).toBeInstanceOf(LaadFout);
      expect(f.message).toContain("de klanten");
    }
  });
});
