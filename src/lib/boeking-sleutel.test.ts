import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// De echte helper uit pocketbase/pb_hooks/boeking_sleutel.js, geladen zoals in
// kelder-server.test.ts. De neptransactie draait écht terug (werkkopie wordt
// weggegooid bij een exceptie). Dit bewijst de volgorde en de uitkomsten, niet
// de unieke index van SQLite — die wordt live gecontroleerd.

type Waarden = Record<string, unknown>;

class NepRecord {
  constructor(
    public collectie: string,
    public id: string,
    public waarden: Waarden,
  ) {}
  getString(naam: string) {
    return String(this.waarden[naam] ?? "");
  }
  set(naam: string, waarde: unknown) {
    this.waarden[naam] = waarde;
  }
}

interface NepApp {
  runInTransaction(fn: (tx: NepApp) => void): void;
  findFirstRecordByFilter(collectie: string, filter: string, params: Waarden): NepRecord;
  findRecordById(collectie: string, id: string): NepRecord;
  save(rec: NepRecord): void;
}

function maakApp(opties: { uniekeIndex?: boolean } = {}) {
  let tankboek = new Map<string, Waarden>();
  let transacties = 0;
  let volgnummer = 0;

  const maakTx = (werk: Map<string, Waarden>): NepApp => ({
    runInTransaction() {
      throw new Error("geen geneste transactie");
    },
    findFirstRecordByFilter(_c, filter, params) {
      expect(filter).toBe("boeking_sleutel = {:s}");
      for (const [id, w] of werk)
        if (w.boeking_sleutel === params.s) return new NepRecord("tankboek", id, w);
      throw new Error("sql: no rows in result set");
    },
    findRecordById(_c, id) {
      const w = werk.get(id);
      if (!w) throw new Error(`niet gevonden: ${id}`);
      return new NepRecord("tankboek", id, w);
    },
    save(rec) {
      // Een echte unieke index ziet ook wat andere transacties al committeerden.
      if (opties.uniekeIndex && rec.waarden.boeking_sleutel) {
        for (const [id, w] of [...werk, ...tankboek])
          if (id !== rec.id && w.boeking_sleutel === rec.waarden.boeking_sleutel)
            throw new Error("UNIQUE constraint failed: tankboek.boeking_sleutel");
      }
      werk.set(rec.id, rec.waarden);
    },
  });

  const app: NepApp = {
    ...maakTx(tankboek),
    runInTransaction(fn) {
      transacties++;
      const werk = new Map([...tankboek].map(([id, w]) => [id, { ...w }]));
      fn(maakTx(werk));
      tankboek = werk; // alleen bij succes: commit
    },
    findFirstRecordByFilter(c, f, p) {
      return maakTx(tankboek).findFirstRecordByFilter(c, f, p);
    },
  };

  return {
    app,
    regels: () => [...tankboek.entries()],
    transacties: () => transacties,
    // Een gewone boeking: schrijft één tankboekregel en geeft haar id terug.
    voerBoekingUit: (tx: NepApp, b: Waarden) => {
      if (b.volume_l === 0) return { fout: "volume_l moet positief zijn" };
      const id = `regel-${++volgnummer}`;
      tx.save(new NepRecord("tankboek", id, { actie: b.actie, volume_l: b.volume_l }));
      return { regelId: id, waarschuwing: b.waarschuwing ?? "" };
    },
    // Nabootsing van een gelijktijdige winnaar: staat al gecommit buiten de tx.
    plaatsWinnaar: (sleutel: string) => {
      tankboek.set("winnaar", { actie: "overhevelen", boeking_sleutel: sleutel });
    },
  };
}

interface Helper {
  leesSleutel(b: unknown): string;
  boekMetSleutel(
    app: NepApp,
    b: Waarden,
    voer: (tx: NepApp, b: Waarden) => unknown,
  ): { fout?: string; regelId?: string; waarschuwing?: string; alGeboekt?: boolean };
}

function laad(): Helper {
  const module = { exports: {} as Helper };
  runInNewContext(
    readFileSync(new URL("../../pocketbase/pb_hooks/boeking_sleutel.js", import.meta.url), "utf8"),
    { module },
  );
  return module.exports;
}

describe("boeking_sleutel", () => {
  const { leesSleutel, boekMetSleutel } = laad();

  it("leest alleen een nette tekstsleutel; alles anders telt als geen sleutel", () => {
    expect(leesSleutel({ boeking_sleutel: " abc-123 " })).toBe("abc-123");
    expect(leesSleutel({ boeking_sleutel: "" })).toBe("");
    expect(leesSleutel({ boeking_sleutel: 42 })).toBe("");
    expect(leesSleutel({ boeking_sleutel: "x".repeat(101) })).toBe("");
    expect(leesSleutel({})).toBe("");
    expect(leesSleutel(null)).toBe("");
  });

  it("zonder sleutel: gewoon boeken, geen sleutel opgeslagen", () => {
    const w = maakApp();
    const r = boekMetSleutel(w.app, { actie: "overhevelen", volume_l: 10 }, w.voerBoekingUit);
    expect(r).toEqual({ regelId: "regel-1", waarschuwing: "", alGeboekt: false });
    expect(w.regels()).toEqual([["regel-1", { actie: "overhevelen", volume_l: 10 }]]);
  });

  it("nieuwe sleutel: boekt en zet de sleutel op de regel, in dezelfde transactie", () => {
    const w = maakApp();
    const r = boekMetSleutel(
      w.app,
      { actie: "overhevelen", volume_l: 10, boeking_sleutel: "s1", waarschuwing: "let op" },
      w.voerBoekingUit,
    );
    expect(r).toEqual({ regelId: "regel-1", waarschuwing: "let op", alGeboekt: false });
    expect(w.regels()[0][1]).toMatchObject({ volume_l: 10, boeking_sleutel: "s1" });
    expect(w.transacties()).toBe(1);
  });

  it("bekende sleutel: boekt NIET opnieuw en geeft de bestaande regel terug", () => {
    const w = maakApp();
    boekMetSleutel(
      w.app,
      { actie: "overhevelen", volume_l: 10, boeking_sleutel: "s1" },
      w.voerBoekingUit,
    );
    let aangeroepen = 0;
    const r = boekMetSleutel(
      w.app,
      { actie: "overhevelen", volume_l: 10, boeking_sleutel: "s1" },
      (tx, b) => {
        aangeroepen++;
        return w.voerBoekingUit(tx, b);
      },
    );
    expect(r).toEqual({ regelId: "regel-1", waarschuwing: "", alGeboekt: true });
    expect(aangeroepen).toBe(0);
    expect(w.regels()).toHaveLength(1);
  });

  it("validatiefout: { fout } terug, niets geschreven, geen sleutel achtergebleven", () => {
    const w = maakApp();
    const r = boekMetSleutel(
      w.app,
      { actie: "overhevelen", volume_l: 0, boeking_sleutel: "s1" },
      w.voerBoekingUit,
    );
    expect(r).toEqual({ fout: "volume_l moet positief zijn" });
    expect(w.regels()).toEqual([]);
    // Dezelfde sleutel mag daarna gewoon alsnog boeken.
    const r2 = boekMetSleutel(
      w.app,
      { actie: "overhevelen", volume_l: 5, boeking_sleutel: "s1" },
      w.voerBoekingUit,
    );
    expect(r2.alGeboekt).toBe(false);
    expect(w.regels()).toHaveLength(1);
  });

  it("race: verliezer ketst op de unieke index, rolt terug en krijgt de winnaar terug", () => {
    const w = maakApp({ uniekeIndex: true });
    const r = boekMetSleutel(
      w.app,
      { actie: "overhevelen", volume_l: 10, boeking_sleutel: "s1" },
      (tx, b) => {
        // De andere aanvraag committeert terwijl deze nog bezig is.
        w.plaatsWinnaar("s1");
        return w.voerBoekingUit(tx, b);
      },
    );
    expect(r).toEqual({ regelId: "winnaar", waarschuwing: "", alGeboekt: true });
    // Alleen de winnaar staat er; de eigen regel is teruggedraaid.
    expect(w.regels().map(([id]) => id)).toEqual(["winnaar"]);
  });

  it("andere fout na een write: rollback en ongewijzigd doorgooien", () => {
    const w = maakApp();
    expect(() =>
      boekMetSleutel(
        w.app,
        { actie: "overhevelen", volume_l: 10, boeking_sleutel: "s1" },
        (tx, b) => {
          w.voerBoekingUit(tx, b);
          throw new Error("notitie: Must be no more than 5000 character(s)");
        },
      ),
    ).toThrow("Must be no more than 5000");
    expect(w.regels()).toEqual([]);
  });
});
