import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// De echte bevestig-flow uit pocketbase/pb_hooks/agent_bevestig.js, geladen zoals
// Codex dat in kelder-server.test.ts doet. De neptransactie hieronder draait
// ÉCHT terug: bij een exceptie wordt de werkkopie weggegooid. Dat bewijst de
// volgorde (fout → alles terug → apart "mislukt"), niet het SQLite-gedrag van
// PocketBase zelf — dat is op 13 september live aangetoond.

type Waarden = Record<string, unknown>;
type Opslag = Map<string, Map<string, Waarden>>;

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

function kopie(opslag: Opslag): Opslag {
  return new Map(
    [...opslag].map(([c, recs]) => [c, new Map([...recs].map(([id, w]) => [id, { ...w }]))]),
  );
}

function maakApp(actie: Waarden | null) {
  let opgeslagen: Opslag = new Map([
    ["agent_acties", new Map(actie ? [["a1", { ...actie }]] : [])],
    ["bottelrondes", new Map()],
  ]);
  let transacties = 0;
  const app = {
    runInTransaction(fn: (tx: NepTx) => void) {
      transacties++;
      const werk = kopie(opgeslagen);
      const tx: NepTx = {
        findRecordById(collectie: string, id: string) {
          const w = werk.get(collectie)?.get(id);
          if (!w) throw new Error(`niet gevonden: ${collectie}/${id}`);
          return new NepRecord(collectie, id, w);
        },
        save(rec: NepRecord) {
          if (!werk.has(rec.collectie)) werk.set(rec.collectie, new Map());
          werk.get(rec.collectie)!.set(rec.id, rec.waarden);
        },
      };
      fn(tx);
      opgeslagen = werk; // alleen bij succes: commit
    },
  };
  return {
    app,
    actie: () => opgeslagen.get("agent_acties")!.get("a1"),
    bottelrondes: () => opgeslagen.get("bottelrondes")!.size,
    transacties: () => transacties,
    zetStatusBuitenTransactie: (status: string) => {
      opgeslagen.get("agent_acties")!.get("a1")!.status = status;
    },
  };
}

interface NepTx {
  findRecordById(collectie: string, id: string): NepRecord;
  save(rec: NepRecord): void;
}

interface Uitkomst {
  alVerwerkt: boolean;
  statusNa: string;
  fout: string;
  uitgevoerdRecordId: string;
  gesprekId: string;
}

function laad() {
  const module = { exports: {} as { bevestigActie: (app: unknown, o: unknown) => Uitkomst } };
  runInNewContext(
    readFileSync(new URL("../../pocketbase/pb_hooks/agent_bevestig.js", import.meta.url), "utf8"),
    { module },
  );
  return module.exports.bevestigActie;
}

const voorgesteld = { status: "voorgesteld", gesprek_id: "g1", actie_type: "bottelronde" };
const gebruiker = { id: "u1", isSuperuser: () => false };

function uitvoerder(gedrag: (tx: NepTx) => unknown) {
  let aangeroepen = 0;
  return {
    aangeroepen: () => aangeroepen,
    leesJsonVeld: () => ({}),
    voerBevestigdeActieUit: (tx: NepTx) => {
      aangeroepen++;
      return gedrag(tx);
    },
  };
}

const schrijfBottelronde = (tx: NepTx) =>
  tx.save(new NepRecord("bottelrondes", "b1", { lot: "X" }));

describe("bevestigActie", () => {
  const bevestigActie = laad();

  it("voert uit en legt de uitkomst in één transactie vast", () => {
    const w = maakApp(voorgesteld);
    const u = uitvoerder((tx) => {
      schrijfBottelronde(tx);
      return { record_id: "b1" };
    });
    const r = bevestigActie(w.app, {
      actieId: "a1",
      naam: "Thomas",
      auth: gebruiker,
      uitvoering: u,
    });
    expect(r.statusNa).toBe("uitgevoerd");
    expect(w.actie()).toMatchObject({
      status: "uitgevoerd",
      uitgevoerd_record_id: "b1",
      bevestigd_door: "u1",
    });
    expect(w.bottelrondes()).toBe(1);
    expect(w.transacties()).toBe(1);
  });

  it("draait een TERUGGEGEVEN fout na een write volledig terug en markeert daarna apart", () => {
    const w = maakApp(voorgesteld);
    const u = uitvoerder((tx) => {
      schrijfBottelronde(tx);
      return { fout: "Te weinig flessen" };
    });
    const r = bevestigActie(w.app, {
      actieId: "a1",
      naam: "Thomas",
      auth: gebruiker,
      uitvoering: u,
    });
    expect(w.bottelrondes()).toBe(0); // de write van de uitvoerder is weg
    expect(r).toMatchObject({ statusNa: "mislukt", fout: "Te weinig flessen", gesprekId: "g1" });
    expect(w.actie()).toMatchObject({ status: "mislukt", fout: "Te weinig flessen" });
    expect(w.transacties()).toBe(2);
  });

  it("draait een GEGOOIDE fout na een write volledig terug en markeert daarna apart", () => {
    const w = maakApp(voorgesteld);
    const u = uitvoerder((tx) => {
      schrijfBottelronde(tx);
      throw new Error("flestype_ref: Failed to find all relation records");
    });
    const r = bevestigActie(w.app, {
      actieId: "a1",
      naam: "Thomas",
      auth: gebruiker,
      uitvoering: u,
    });
    expect(w.bottelrondes()).toBe(0);
    expect(r.statusNa).toBe("mislukt");
    expect(w.actie()).toMatchObject({
      status: "mislukt",
      fout: "flestype_ref: Failed to find all relation records",
    });
  });

  it("gebruikt een standaardtekst als een gegooide fout geen boodschap heeft", () => {
    const w = maakApp(voorgesteld);
    const u = uitvoerder(() => {
      throw new Error("");
    });
    bevestigActie(w.app, { actieId: "a1", naam: "Thomas", auth: gebruiker, uitvoering: u });
    expect(w.actie()).toMatchObject({
      status: "mislukt",
      fout: "De actie kon niet worden uitgevoerd.",
    });
  });

  it("zet een al verwerkt voorstel niet op mislukt en voert niets uit", () => {
    const w = maakApp({ ...voorgesteld, status: "uitgevoerd" });
    const u = uitvoerder(() => ({ record_id: "b1" }));
    const r = bevestigActie(w.app, {
      actieId: "a1",
      naam: "Thomas",
      auth: gebruiker,
      uitvoering: u,
    });
    expect(r.alVerwerkt).toBe(true);
    expect(u.aangeroepen()).toBe(0);
    expect(w.actie()).toMatchObject({ status: "uitgevoerd" });
    expect(w.transacties()).toBe(1);
  });

  it("gooit een fout van buiten de uitvoering ongewijzigd door", () => {
    const w = maakApp(null);
    const u = uitvoerder(() => ({ record_id: "b1" }));
    expect(() =>
      bevestigActie(w.app, { actieId: "a1", naam: "Thomas", auth: gebruiker, uitvoering: u }),
    ).toThrow("niet gevonden: agent_acties/a1");
    expect(w.transacties()).toBe(1);
  });

  it("laat bevestigd_door leeg bij een superuser-token", () => {
    const w = maakApp(voorgesteld);
    const u = uitvoerder(() => ({ record_id: "b1" }));
    bevestigActie(w.app, {
      actieId: "a1",
      naam: "support",
      auth: { id: "su1", isSuperuser: () => true },
      uitvoering: u,
    });
    expect(w.actie()).toMatchObject({ status: "uitgevoerd", bevestigd_door: "" });
  });

  it("meldt al verwerkt als een andere bevestiging tussen rollback en markering won", () => {
    const w = maakApp(voorgesteld);
    const u = uitvoerder(() => {
      // Nabootsing van een gelijktijdige bevestiging die al committeerde.
      w.zetStatusBuitenTransactie("uitgevoerd");
      throw new Error("tijdelijke fout");
    });
    const r = bevestigActie(w.app, {
      actieId: "a1",
      naam: "Thomas",
      auth: gebruiker,
      uitvoering: u,
    });
    // De andere aanroep heeft het voorstel verwerkt. Deze poging hoort dat eerlijk
    // te melden, niet als 200 met lege status en zijn eigen fout (reviewpunt
    // Codex, 14 september). De winnaar mag ook niet overschreven worden.
    expect(r.alVerwerkt).toBe(true);
    expect(w.actie()).toMatchObject({ status: "uitgevoerd" });
    expect(w.actie()?.fout).toBeUndefined();
  });
});
