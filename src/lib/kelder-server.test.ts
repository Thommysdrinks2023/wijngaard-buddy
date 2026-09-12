import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// De echte hooklogica, met uitsluitend een in-memory recordadapter. Dit
// bewijst boekingsregels, niet SQLite-rollback of gelijktijdige transacties.
class TestRecord {
  id = "nieuw";
  waarden: Record<string, unknown> = {};
  constructor(public collectie: string) {}
  set(naam: string, waarde: unknown) {
    this.waarden[naam] = waarde;
  }
  getString(naam: string) {
    return String(this.waarden[naam] ?? "");
  }
  getFloat(naam: string) {
    return Number(this.waarden[naam] ?? 0);
  }
}

function omgeving() {
  const records = new Map<string, TestRecord>();
  const schrijft: TestRecord[] = [];
  for (const [id, collectie, waarden] of [
    ["partij", "partijen", { eigenaar: "eigenaar" }],
    [
      "bron",
      "tanks",
      {
        code: "TEST-A",
        capaciteit_l: 500,
        huidig_volume_l: 100,
        huidige_partij: "partij",
        status: "in_gebruik",
      },
    ],
    ["doel", "tanks", { code: "TEST-B", capaciteit_l: 500, huidig_volume_l: 0, status: "leeg" }],
  ] as const) {
    const record = new TestRecord(collectie);
    record.id = id;
    record.waarden = { ...waarden };
    records.set(id, record);
  }
  const module = {
    exports: {} as {
      voerBoekingUit: (
        app: unknown,
        input: Record<string, unknown>,
      ) => { fout?: string; regelId?: string };
      voerBottelrondeUit: (app: unknown, input: Record<string, unknown>) => { fout?: string };
    },
  };
  runInNewContext(
    readFileSync(new URL("../../pocketbase/pb_hooks/kelder_logica.js", import.meta.url), "utf8"),
    { module, Record: TestRecord },
  );
  const app = {
    findRecordById: (_collectie: string, id: string) => {
      if (!records.has(id)) throw new Error("Niet gevonden");
      return records.get(id);
    },
    findCollectionByNameOrId: (naam: string) => naam,
    save: (record: TestRecord) => {
      if (record.id === "nieuw") record.id = `nieuw-${schrijft.length}`;
      schrijft.push(record);
    },
  };
  const boek = (wijzigingen: Record<string, unknown> = {}) =>
    module.exports.voerBoekingUit(app, {
      partij: "partij",
      actie: "overhevelen",
      van_tank: "bron",
      naar_tank: "doel",
      volume_l: 40,
      datum: "2026-01-01",
      verantwoordelijke: "test",
      ...wijzigingen,
    });
  const bottel = (input: Record<string, unknown> = {}) =>
    module.exports.voerBottelrondeUit(app, {
      partij: "partij",
      van_tank: "bron",
      aantal_flessen: 80,
      flesinhoud_ml: 750,
      botteldatum: "2026-01-01",
      ingevoerd_door: "test",
      ...input,
    });
  return { boek, bottel, records, schrijft };
}

describe("Kelder — echte serverboekingslogica", () => {
  it("bottelt met gekoppelde ronde, voorraad en tankboek", () => {
    const { bottel, records, schrijft } = omgeving();
    expect(bottel().fout).toBeUndefined();
    expect(records.get("bron")!.getFloat("huidig_volume_l")).toBe(40);
    const ronde = schrijft.find((r) => r.collectie === "bottelrondes")!;
    const voorraad = schrijft.find((r) => r.collectie === "voorraad_flessen")!;
    expect(ronde.getFloat("aantal_flessen")).toBe(80);
    expect(voorraad.getFloat("aantal_huidig")).toBe(80);
    expect(voorraad.getString("bottelronde")).toBe(ronde.id);
    expect(voorraad.getString("partij")).toBe("partij");
  });
  it("bewaart bottelverlies apart van gevuld volume", () => {
    const { bottel, records, schrijft } = omgeving();
    expect(bottel({ volume_uit_tank_l: 65 }).fout).toBeUndefined();
    expect(records.get("bron")!.getFloat("huidig_volume_l")).toBe(35);
    const ronde = schrijft.find((r) => r.collectie === "bottelrondes")!;
    expect(ronde.getFloat("volume_uit_tank_l")).toBe(65);
    expect(ronde.getFloat("accijnsplichtig_volume_l")).toBe(60);
  });
  it.each([
    { aantal_flessen: 0.5 },
    { aantal_flessen: Infinity },
    { flessen_breuk: 0.5 },
    { flessen_breuk: Infinity },
    { flesinhoud_ml: Infinity },
    { aantal_flessen: 1000 },
    { volume_uit_tank_l: 50 },
  ])("weigert ongeldige botteling vóór writes %j", (invoer) => {
    const { bottel, schrijft } = omgeving();
    expect(bottel(invoer).fout).toBeTruthy();
    expect(schrijft).toHaveLength(0);
  });
  it("boekt overheveling en verlies samen: 100 uit bron, 95 naar doel", () => {
    const { boek, records, schrijft } = omgeving();
    expect(boek({ volume_l: 95, verlies_l: 5, verlies_type: "droesem" }).fout).toBeUndefined();
    expect(records.get("bron")!.getFloat("huidig_volume_l")).toBe(0);
    expect(records.get("doel")!.getFloat("huidig_volume_l")).toBe(95);
    expect(schrijft.filter((r) => r.collectie === "tankboek")).toHaveLength(2);
  });
  it("controleert het totale bronverbruik vóór de eerste write", () => {
    const { boek, schrijft } = omgeving();
    expect(boek({ volume_l: 95, verlies_l: 6 }).fout).toBeTruthy();
    expect(schrijft).toHaveLength(0);
  });
  it("verplaatst volume en bewaart partij en tankboekregel", () => {
    const { boek, records, schrijft } = omgeving();
    expect(boek().fout).toBeUndefined();
    expect(records.get("bron")!.getFloat("huidig_volume_l")).toBe(60);
    expect(records.get("doel")!.getFloat("huidig_volume_l")).toBe(40);
    expect(records.get("doel")!.getString("huidige_partij")).toBe("partij");
    expect(schrijft.filter((r) => r.collectie === "tankboek")).toHaveLength(1);
  });
  it("maakt een volledig overgehevelde brontank leeg", () => {
    const { boek, records } = omgeving();
    expect(boek({ volume_l: 100 }).fout).toBeUndefined();
    expect(records.get("bron")!.getString("status")).toBe("leeg");
    expect(records.get("bron")!.getString("huidige_partij")).toBe("");
  });
  it.each([
    { volume_l: Infinity },
    { volume_l: NaN },
    { volume_l: -1 },
    { volume_l: 101 },
    { naar_tank: "bron" },
    { datum: "2026-02-30" },
    { datum: "2026-13-01" },
    { datum: "2999-01-01" },
    { naar_tank: "ontbreekt" },
  ])("weigert ongeldige boeking zonder writes: %j", (input) => {
    const { boek, schrijft } = omgeving();
    expect(boek(input).fout).toBeTruthy();
    expect(schrijft).toHaveLength(0);
  });
  it.each([
    ["status", "reiniging"],
    ["status", "defect"],
    ["capaciteit_l", 0],
    ["capaciteit_l", 20],
  ])("weigert onbruikbare doeltank %s=%s", (veld, waarde) => {
    const { boek, records, schrijft } = omgeving();
    records.get("doel")!.set(String(veld), waarde);
    expect(boek().fout).toBeTruthy();
    expect(schrijft).toHaveLength(0);
  });
  it("mengt geen andere partij via overhevelen", () => {
    const { boek, records, schrijft } = omgeving();
    records.get("doel")!.set("huidige_partij", "andere-partij");
    records.get("doel")!.set("huidig_volume_l", 10);
    expect(boek().fout).toBeTruthy();
    expect(schrijft).toHaveLength(0);
  });
  it.each([
    ["van_tank", 90],
    ["naar_tank", 110],
  ])("corrigeert in richting %s", (richting, verwacht) => {
    const { boek, records } = omgeving();
    expect(
      boek({
        actie: "correctie",
        van_tank: undefined,
        naar_tank: undefined,
        [richting]: "bron",
        volume_l: 10,
      }).fout,
    ).toBeUndefined();
    expect(records.get("bron")!.getFloat("huidig_volume_l")).toBe(verwacht);
  });
});
