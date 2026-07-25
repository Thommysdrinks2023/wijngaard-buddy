import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Signaal } from "./signalen";

vi.mock("./data", () => ({
  isIngelogd: vi.fn(() => true),
  getPb: vi.fn(),
  // Fase 13 Blok B: de wachttijd-producent trekt via fetchMiddelen/fetchWerkuren
  // ook haalLijst en fetchRijen aan. Zonder deze regels valt de hele testrun om
  // met een unhandled rejection terwijl de tests zelf groen lijken.
  haalLijst: vi.fn(() => Promise.resolve([])),
  fetchRijen: vi.fn(() => Promise.resolve([])),
  ensureOnline: vi.fn(() => Promise.resolve(true)),
  deelVerzoek: vi.fn((_s: string, maak: () => unknown) => maak()),
}));
vi.mock("./materieel-data", () => ({
  fetchOnderhoud: vi.fn(),
  fetchMaterieel: vi.fn(),
  onderhoudBinnenkort: vi.fn((lijst: unknown[]) => lijst),
}));
vi.mock("./regelgeving-data", () => ({
  fetchRegelgevingInstellingen: vi.fn(),
  REGELGEVING_SLEUTELS: { agpDrempel: "agp_drempel_liters_per_jaar" },
}));
vi.mock("./partijen-data", () => ({ fetchPartijen: vi.fn() }));
vi.mock("./kelder-data", () => ({
  fetchKelderlog: vi.fn(),
  fetchVoorraadFlessen: vi.fn(),
  // Fase 13 Blok C: de taakproducent leest analyses mee om te bepalen of een
  // taak zichzelf al gesloten heeft.
  fetchAnalyses: vi.fn(() => Promise.resolve([])),
  rondTaakAf: vi.fn(),
}));
vi.mock("./app-instellingen-data", () => ({
  APP_INSTELLING_SLEUTELS: {
    backupWaarschuwingDagen: "backup_waarschuwing_dagen",
    agpWaarschuwingPercentage: "agp_waarschuwing_percentage",
    voorraadDrempelStandaard: "voorraad_drempel_standaard",
  },
  fetchAppInstellingen: vi.fn(() => Promise.resolve([])),
  vindWaarde: vi.fn((_i: unknown, _s: string, standaard: number) => standaard),
}));

import { getPb, isIngelogd } from "./data";
import { fetchMaterieel, fetchOnderhoud } from "./materieel-data";
import { fetchRegelgevingInstellingen } from "./regelgeving-data";
import { fetchPartijen } from "./partijen-data";
import { fetchKelderlog, fetchVoorraadFlessen } from "./kelder-data";
import {
  agpSignaal,
  voorraadBijnaOpSignalen,
  backupWaarschuwingSignaal,
  kelderlogTaakSignalen,
  kritiekeInzichtSignalen,
  onderhoudSignalen,
  sorteerSignalen,
  verzamelSignalen,
} from "./signalen";

describe("sorteerSignalen", () => {
  it("normaal geval: sorteert op ernst, kritiek eerst", () => {
    const signalen: Signaal[] = [
      { id: "a", bron: "x", ernst: "info", titel: "a", waarom: "a" },
      { id: "b", bron: "x", ernst: "kritiek", titel: "b", waarom: "b" },
      { id: "c", bron: "x", ernst: "waarschuwing", titel: "c", waarom: "c" },
    ];
    expect(sorteerSignalen(signalen).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("randgeval: lege lijst blijft leeg", () => {
    expect(sorteerSignalen([])).toEqual([]);
  });

  it("binnen dezelfde ernst: meest recente datum eerst", () => {
    const signalen: Signaal[] = [
      { id: "oud", bron: "x", ernst: "info", titel: "", waarom: "", datum: "2026-01-01" },
      { id: "nieuw", bron: "x", ernst: "info", titel: "", waarom: "", datum: "2026-06-01" },
    ];
    expect(sorteerSignalen(signalen).map((s) => s.id)).toEqual(["nieuw", "oud"]);
  });
});

describe("onderhoudSignalen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("randgeval: niet ingelogd -> lege lijst, geen fetch", async () => {
    vi.mocked(isIngelogd).mockReturnValue(false);
    const resultaat = await onderhoudSignalen();
    expect(resultaat).toEqual([]);
    expect(fetchOnderhoud).not.toHaveBeenCalled();
  });

  it("normaal geval: onderhoud binnen 30 dagen levert een signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchOnderhoud).mockResolvedValue([
      { materieel: "m1", volgende_keer: "2026-08-01" } as never,
    ]);
    vi.mocked(fetchMaterieel).mockResolvedValue([{ id: "m1", naam: "Trekker" } as never]);
    const resultaat = await onderhoudSignalen();
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].id).toBe("onderhoud-m1-2026-08-01");
    expect(resultaat[0].titel).toContain("Trekker");
  });
});

describe("backupWaarschuwingSignaal en verzamelSignalen (falende producent)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bijt: een falende onderhoud-producent blokkeert het backup-signaal niet", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchOnderhoud).mockRejectedValue(new Error("netwerkfout"));
    const langGeleden = new Date(Date.now() - 5 * 86400000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    vi.mocked(fetchRegelgevingInstellingen).mockResolvedValue([
      { id: "r1", sleutel: "laatste_backup", waarde: null, laatst_gecontroleerd: langGeleden },
    ]);
    const resultaat = await verzamelSignalen();
    expect(resultaat.some((s) => s.bron === "backup")).toBe(true);
  });

  it("randgeval: backup binnen de drempel geeft geen signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    const vandaag = new Date().toISOString().slice(0, 19).replace("T", " ");
    vi.mocked(fetchRegelgevingInstellingen).mockResolvedValue([
      { id: "r1", sleutel: "laatste_backup", waarde: null, laatst_gecontroleerd: vandaag },
    ]);
    const resultaat = await backupWaarschuwingSignaal();
    expect(resultaat).toEqual([]);
  });
});

describe("agpSignaal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normaal geval: productie boven de waarschuwingsdrempel", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    const jaar = new Date().getFullYear();
    vi.mocked(fetchPartijen).mockResolvedValue([{ jaargang: jaar, start_volume_l: 9000 } as never]);
    vi.mocked(fetchRegelgevingInstellingen).mockResolvedValue([
      { id: "r1", sleutel: "agp_drempel_liters_per_jaar", waarde: 10000 } as never,
    ]);
    const resultaat = await agpSignaal();
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].bron).toBe("agp");
  });

  it("randgeval: geen wettelijke drempel ingesteld -> geen signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchPartijen).mockResolvedValue([]);
    vi.mocked(fetchRegelgevingInstellingen).mockResolvedValue([]);
    const resultaat = await agpSignaal();
    expect(resultaat).toEqual([]);
  });

  it("randgeval: productie ruim onder de drempel -> geen signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    const jaar = new Date().getFullYear();
    vi.mocked(fetchPartijen).mockResolvedValue([{ jaargang: jaar, start_volume_l: 100 } as never]);
    vi.mocked(fetchRegelgevingInstellingen).mockResolvedValue([
      { id: "r1", sleutel: "agp_drempel_liters_per_jaar", waarde: 10000 } as never,
    ]);
    const resultaat = await agpSignaal();
    expect(resultaat).toEqual([]);
  });
});

describe("kelderlogTaakSignalen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normaal geval: verlopen taak wordt een waarschuwing", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchKelderlog).mockResolvedValue([
      { id: "k1", datum: "2020-01-01", notitie: "TAAK: SO2 na-meten" } as never,
    ]);
    const resultaat = await kelderlogTaakSignalen();
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].ernst).toBe("waarschuwing");
    expect(resultaat[0].titel).toContain("SO2 na-meten");
  });

  it("randgeval: regel zonder TAAK-prefix wordt genegeerd", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchKelderlog).mockResolvedValue([
      { id: "k2", datum: "2020-01-01", notitie: "gewone notitie" } as never,
    ]);
    const resultaat = await kelderlogTaakSignalen();
    expect(resultaat).toEqual([]);
  });
});

describe("kritiekeInzichtSignalen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("randgeval: geen pb-instantie -> lege lijst", async () => {
    vi.mocked(getPb).mockReturnValue(null);
    const resultaat = await kritiekeInzichtSignalen();
    expect(resultaat).toEqual([]);
  });

  it("normaal geval: filtert alleen kritieke inzicht_types en gebruikt een venster (limit), geen getFullList", async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [
        { id: "i1", inzicht_type: "gisting_snelheid", samenvatting_nl: "Tank 3 stagneert" },
        { id: "i2", inzicht_type: "brix_verloop", samenvatting_nl: "Normaal verloop" },
      ],
    });
    vi.mocked(getPb).mockReturnValue({ collection: () => ({ getList }) as never } as never);
    const resultaat = await kritiekeInzichtSignalen();
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].id).toBe("inzicht-i1");
    expect(getList).toHaveBeenCalledWith(1, 20, expect.any(Object));
  });
});

describe("voorraadBijnaOpSignalen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normaal geval: onder de globale standaard (12) -> signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchVoorraadFlessen).mockResolvedValue([
      { id: "v1", wijnnaam: "Souvignier Gris", jaargang: 2025, aantal_huidig: 8 } as never,
    ]);
    const resultaat = await voorraadBijnaOpSignalen();
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].id).toBe("voorraad-v1");
    expect(resultaat[0].waarom).toContain("globale standaard");
  });

  it("normaal geval: eigen drempel wint van de globale standaard", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchVoorraadFlessen).mockResolvedValue([
      // 20 flessen: boven de globale 12, maar onder de eigen drempel van 24
      { id: "v1", wijnnaam: "Johanniter", aantal_huidig: 20, drempel_aantal: 24 } as never,
    ]);
    const resultaat = await voorraadBijnaOpSignalen();
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].waarom).toContain("eigen drempel");
  });

  it("randgeval: ruim voldoende voorraad -> geen signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchVoorraadFlessen).mockResolvedValue([
      { id: "v1", wijnnaam: "Regent", aantal_huidig: 200 } as never,
    ]);
    expect(await voorraadBijnaOpSignalen()).toEqual([]);
  });

  it("randgeval: uitverkocht (0 flessen) geeft GEEN bijna-op-signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchVoorraadFlessen).mockResolvedValue([
      { id: "v1", wijnnaam: "Pinotin", aantal_huidig: 0 } as never,
    ]);
    expect(await voorraadBijnaOpSignalen()).toEqual([]);
  });

  it("randgeval: precies op de drempel -> nog geen signaal", async () => {
    vi.mocked(isIngelogd).mockReturnValue(true);
    vi.mocked(fetchVoorraadFlessen).mockResolvedValue([
      { id: "v1", wijnnaam: "Muscaris", aantal_huidig: 12 } as never,
    ]);
    expect(await voorraadBijnaOpSignalen()).toEqual([]);
  });

  it("randgeval: niet ingelogd -> lege lijst, geen fetch", async () => {
    vi.mocked(isIngelogd).mockReturnValue(false);
    expect(await voorraadBijnaOpSignalen()).toEqual([]);
    expect(fetchVoorraadFlessen).not.toHaveBeenCalled();
  });
});
