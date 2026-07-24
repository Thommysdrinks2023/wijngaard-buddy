import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Signaal } from "./signalen";

vi.mock("./data", () => ({ isIngelogd: vi.fn(() => true) }));
vi.mock("./materieel-data", () => ({
  fetchOnderhoud: vi.fn(),
  fetchMaterieel: vi.fn(),
  onderhoudBinnenkort: vi.fn((lijst: unknown[]) => lijst),
}));
vi.mock("./regelgeving-data", () => ({ fetchRegelgevingInstellingen: vi.fn() }));
vi.mock("./app-instellingen-data", () => ({
  APP_INSTELLING_SLEUTELS: { backupWaarschuwingDagen: "backup_waarschuwing_dagen" },
  fetchAppInstellingen: vi.fn(() => Promise.resolve([])),
  vindWaarde: vi.fn((_i: unknown, _s: string, standaard: number) => standaard),
}));

import { isIngelogd } from "./data";
import { fetchMaterieel, fetchOnderhoud } from "./materieel-data";
import { fetchRegelgevingInstellingen } from "./regelgeving-data";
import {
  backupWaarschuwingSignaal,
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
