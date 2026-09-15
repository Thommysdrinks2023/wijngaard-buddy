import PocketBase from "pocketbase";
import { describe, expect, it, vi } from "vitest";
import { leesTankboekSelectie } from "./tankboek-filter";

function omgeving() {
  const pb = new PocketBase("http://127.0.0.1:1");
  const lijst = vi.spyOn(pb.collection("tankboek"), "getFullList").mockResolvedValue([]);
  return { pb, lijst };
}

describe("Tankboekselecties zonder afgekorte totalen", () => {
  it("laat het volledige register zonder standaarddatumfilter beschikbaar", async () => {
    const { pb, lijst } = omgeving();
    await leesTankboekSelectie(pb);
    expect(lijst).toHaveBeenCalledWith({ sort: "-datum,-tijd,-created,-id", filter: "" });
  });
  it("selecteert uitsluitend verlies binnen de volledige aangifteperiode", async () => {
    const { pb, lijst } = omgeving();
    await leesTankboekSelectie(pb, { actie: "verlies", vanaf: "2026-04-01", tot: "2026-06-30" });
    expect(lijst.mock.calls[0][0]).toMatchObject({
      filter: "actie = 'verlies' && datum >= '2026-04-01' && datum <= '2026-06-30'",
    });
  });
  it("houdt verlies uit latere kalenderjaren beschikbaar voor het jaargangsoverzicht", async () => {
    const { pb, lijst } = omgeving();
    await leesTankboekSelectie(pb, { actie: "verlies" });
    expect(lijst.mock.calls[0][0]).toMatchObject({ filter: "actie = 'verlies'" });
  });
  it("combineert tankrichting, partij en eigenaar veilig", async () => {
    const { pb, lijst } = omgeving();
    const partij = 'x" || actie != "';
    await leesTankboekSelectie(pb, { partij, tank: "t1", eigenaar: "e1" });
    expect(lijst.mock.calls[0][0]).toMatchObject({
      filter: [
        pb.filter("partij = {:partij}", { partij }),
        "(van_tank = 't1' || naar_tank = 't1')",
        "eigenaar = 'e1'",
      ].join(" && "),
    });
  });
  it.each([false, true])("haalt echte SDK-pagina's op; tweede pagina faalt: %s", async (faalt) => {
    const pb = new PocketBase("http://127.0.0.1:1");
    const regels = Array.from({ length: 2501 }, (_, i) => ({
      id: String(i),
      collectionId: "tankboek",
      collectionName: "tankboek",
      volume_l: 1,
    }));
    const verzoek = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const pagina = Number(url.searchParams.get("page"));
      const grootte = Number(url.searchParams.get("perPage"));
      expect(url.searchParams.get("filter")).toBe("actie = 'verlies'");
      if (faalt && pagina > 1) throw new Error("Verbinding weg op pagina twee");
      return new Response(
        JSON.stringify({
          page: pagina,
          perPage: grootte,
          totalItems: regels.length,
          totalPages: Math.ceil(regels.length / grootte),
          items: regels.slice((pagina - 1) * grootte, pagina * grootte),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    try {
      if (faalt) await expect(leesTankboekSelectie(pb, { actie: "verlies" })).rejects.toThrow();
      else expect(await leesTankboekSelectie(pb, { actie: "verlies" })).toEqual(regels);
      expect(verzoek.mock.calls.length).toBeGreaterThan(1);
    } finally {
      verzoek.mockRestore();
    }
  });
  it("geeft een leesfout door in plaats van lege of gedeeltelijke totalen", async () => {
    const { pb, lijst } = omgeving();
    lijst.mockRejectedValue(new Error("Verbinding weg"));
    await expect(leesTankboekSelectie(pb, { actie: "verlies" })).rejects.toThrow("Verbinding weg");
  });
});
