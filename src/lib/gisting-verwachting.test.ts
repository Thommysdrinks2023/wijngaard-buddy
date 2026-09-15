import { describe, expect, it } from "vitest";
import { berekenVerwachting, dalingVanPartij, type AnalysePunt } from "./gisting-verwachting";

describe("dalingVanPartij", () => {
  it("normaal geval: duidelijke daling over meerdere dagen", () => {
    const punten: AnalysePunt[] = [
      { partij: "a", datum: "2026-09-01", oechsle: 90 },
      { partij: "a", datum: "2026-09-05", oechsle: 50 },
    ];
    expect(dalingVanPartij(punten)).toBeCloseTo(10, 1); // 40 °Oe / 4 dagen
  });

  it("randgeval: minder dan 2 bruikbare metingen -> null", () => {
    expect(dalingVanPartij([{ partij: "a", datum: "2026-09-01", oechsle: 90 }])).toBeNull();
  });

  it("randgeval: geen daling (gisting is gestagneerd of gestegen) -> null", () => {
    const punten: AnalysePunt[] = [
      { partij: "a", datum: "2026-09-01", oechsle: 50 },
      { partij: "a", datum: "2026-09-05", oechsle: 55 },
    ];
    expect(dalingVanPartij(punten)).toBeNull();
  });
});

describe("berekenVerwachting", () => {
  it("te weinig historie: 0 vergelijkbare partijen -> eerlijk 'te_weinig_historie'", () => {
    const resultaat = berekenVerwachting("huidig", [], new Set());
    expect(resultaat.status).toBe("te_weinig_historie");
    expect(resultaat.aantalVergelijkbaar).toBe(0);
  });

  it("te weinig historie: precies 1 vergelijkbare partij is nog niet genoeg", () => {
    const punten: AnalysePunt[] = [
      { partij: "hist1", datum: "2025-09-01", oechsle: 90 },
      { partij: "hist1", datum: "2025-09-05", oechsle: 50 },
    ];
    const resultaat = berekenVerwachting("huidig", punten, new Set(["hist1"]));
    expect(resultaat.status).toBe("te_weinig_historie");
  });

  it("normaal geval: 2 vergelijkbare partijen geven een verwachtingslijn", () => {
    const punten: AnalysePunt[] = [
      { partij: "hist1", datum: "2025-09-01", oechsle: 90 },
      { partij: "hist1", datum: "2025-09-05", oechsle: 50 },
      { partij: "hist2", datum: "2025-09-01", oechsle: 90 },
      { partij: "hist2", datum: "2025-09-05", oechsle: 50 },
      { partij: "huidig", datum: "2026-09-01", oechsle: 90 },
      { partij: "huidig", datum: "2026-09-03", oechsle: 70 },
    ];
    const resultaat = berekenVerwachting("huidig", punten, new Set(["hist1", "hist2"]));
    expect(resultaat.status).toBe("ok");
    expect(resultaat.aantalVergelijkbaar).toBe(2);
    expect(resultaat.dalingPerDag).toBeCloseTo(10, 1);
    expect(resultaat.verwachting?.[1].verwacht_oechsle).toBeCloseTo(70, 1); // 90 - 10*2
    expect(resultaat.achterstandDagen).toBe(0); // exact op de lijn
  });

  it("achterstand: huidige gisting loopt achter op de verwachtingslijn", () => {
    const punten: AnalysePunt[] = [
      { partij: "hist1", datum: "2025-09-01", oechsle: 90 },
      { partij: "hist1", datum: "2025-09-05", oechsle: 50 },
      { partij: "hist2", datum: "2025-09-01", oechsle: 90 },
      { partij: "hist2", datum: "2025-09-05", oechsle: 50 },
      { partij: "huidig", datum: "2026-09-01", oechsle: 90 },
      { partij: "huidig", datum: "2026-09-03", oechsle: 85 }, // trager dan verwacht (70)
    ];
    const resultaat = berekenVerwachting("huidig", punten, new Set(["hist1", "hist2"]));
    expect(resultaat.achterstandDagen).toBeGreaterThan(0);
  });
});
