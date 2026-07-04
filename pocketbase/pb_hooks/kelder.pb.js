/// <reference path="../pb_data/types.d.ts" />
// Kelder-endpoints: alle tankboek-boekingen lopen hierlangs, atomisch
// (regel + tankcaches in één transactie). De tankboek-collectie zelf staat
// dicht in de API-rules (create/update/delete = null): dit is de enige route
// naar het register. Correcties zijn nieuwe regels, nooit bewerkingen.
//
// JSVM-eigenaardigheid: handlers draaien in een VM-pool waarin niets uit dit
// bestand buiten de handler bestaat — daarom laadt elke handler de gedeelde
// logica zelf via require() (zie kelder_logica.js).

// ---------- POST /api/tappenmars/tankboek-boeking ----------
routerAdd(
  "POST",
  "/api/tappenmars/tankboek-boeking",
  (e) => {
    const logica = require(`${__hooks}/kelder_logica.js`);
    let resultaat = null;
    try {
      const b = e.requestInfo().body;
      e.app.runInTransaction((txApp) => {
        resultaat = logica.voerBoekingUit(txApp, b);
        if (resultaat.fout) throw new Error(resultaat.fout); // rollback
      });
      return e.json(200, {
        ok: true,
        waarschuwing: resultaat.waarschuwing || "",
        regelId: resultaat.regelId,
      });
    } catch (err) {
      if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);

// ---------- POST /api/tappenmars/partij-aanmaken ----------
// Maakt de partij aan en boekt (indien starttank + startvolume opgegeven)
// direct de eerste "vullen"-regel — alles of niets.
routerAdd(
  "POST",
  "/api/tappenmars/partij-aanmaken",
  (e) => {
    const logica = require(`${__hooks}/kelder_logica.js`);
    let resultaat = null;
    try {
      const b = e.requestInfo().body;
      let partijId = "";
      e.app.runInTransaction((txApp) => {
        const col = txApp.findCollectionByNameOrId("partijen");
        const partij = new Record(col);
        const velden = [
          "naam",
          "jaargang",
          "type",
          "status",
          "samenstelling",
          "start_volume_l",
          "notitie",
          "producent",
          "opdracht_type",
          "ouder_partij",
          "lotnummer",
          "pers_datum",
          "gist",
          "start_dichtheid_oechsle",
          "start_dichtheid_brix",
          "start_dichtheid_sg",
          "start_tank",
          "ontstelen",
          "voorklaren",
          "ph_bij_aanmaak",
          "totaal_zuur_bij_aanmaak",
          "standtijd",
          "koeling",
          "vineyard_id",
        ];
        for (let i = 0; i < velden.length; i++) {
          const veld = velden[i];
          if (b[veld] !== undefined && b[veld] !== null) partij.set(veld, b[veld]);
        }
        txApp.save(partij);
        partijId = partij.id;

        const startVolume = Number(b.start_volume_l == null ? 0 : b.start_volume_l);
        if (b.start_tank && startVolume > 0) {
          const nu = new Date();
          const vandaag =
            nu.getFullYear() +
            "-" +
            String(nu.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(nu.getDate()).padStart(2, "0");
          resultaat = logica.voerBoekingUit(txApp, {
            datum: b.pers_datum || b.boek_datum || vandaag,
            partij: partij.id,
            producent: b.producent,
            actie: "vullen",
            naar_tank: b.start_tank,
            volume_l: startVolume,
            verantwoordelijke: b.verantwoordelijke || b.ingevoerd_door || "onbekend",
            notitie: "Eerste vulling bij aanmaak partij",
            vineyard_id: b.vineyard_id,
          });
          if (resultaat.fout) throw new Error(resultaat.fout); // rollback: ook de partij
        }
      });
      return e.json(200, {
        ok: true,
        id: partijId,
        waarschuwing: (resultaat && resultaat.waarschuwing) || "",
      });
    } catch (err) {
      if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);

// ---------- POST /api/tappenmars/bottelronde-aanmaken ----------
// Fase 4 (Botteling & Voorraad, zie DECISIONS-FASE4.md). Eén gebruikersactie
// -> drie samenhangende records atomisch: de tankboekregel (actie "botteling",
// hergebruikt de bestaande voerBoekingUit-validatie/Regel 3 ongewijzigd),
// het bottelronde-record en het voorraad_flessen-record. Faalt de
// tankboekboeking (te weinig volume, tank op reiniging/defect, etc.), dan
// rolt de hele transactie terug — er blijft geen wees-bottelronde of
// wees-voorraadrecord achter.
routerAdd(
  "POST",
  "/api/tappenmars/bottelronde-aanmaken",
  (e) => {
    const logica = require(`${__hooks}/kelder_logica.js`);
    let resultaat = null;
    try {
      const b = e.requestInfo().body;
      e.app.runInTransaction((txApp) => {
        resultaat = logica.voerBottelrondeUit(txApp, b);
        if (resultaat.fout) throw new Error(resultaat.fout); // rollback
      });
      return e.json(200, {
        ok: true,
        id: resultaat.bottelrondeId,
        voorraad_id: resultaat.voorraadId,
        waarschuwing: resultaat.waarschuwing || "",
      });
    } catch (err) {
      if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);

// ---------- POST /api/tappenmars/tanks-herbereken ----------
// Vangnet (ARCHITECTURE.md §7.1): reconstrueert alle tankcaches uit het
// tankboek. Draaien bij twijfel of na handmatig ingrijpen in de admin.
routerAdd(
  "POST",
  "/api/tappenmars/tanks-herbereken",
  (e) => {
    const logica = require(`${__hooks}/kelder_logica.js`);
    try {
      let bijgewerkt = 0;
      e.app.runInTransaction((txApp) => {
        const tanks = txApp.findRecordsByFilter("tanks", "id != ''", "code", 500, 0);
        const regels = txApp.findRecordsByFilter(
          "tankboek",
          "id != ''",
          "datum,tijd,created",
          100000,
          0,
        );
        const perTank = {};
        for (let i = 0; i < regels.length; i++) {
          const regel = regels[i];
          const vol = regel.getFloat("volume_l");
          const actie = regel.getString("actie");
          const van = regel.getString("van_tank");
          const naar = regel.getString("naar_tank");
          const partij = regel.getString("partij");
          const uitBron = ["overhevelen", "aftappen", "botteling", "verlies", "monster"].includes(
            actie,
          );
          const naarDoel = ["vullen", "overhevelen"].includes(actie);
          if (van && uitBron) {
            perTank[van] = perTank[van] || { volume: 0, partij: "" };
            perTank[van].volume -= vol;
            if (perTank[van].volume <= 0) perTank[van].partij = "";
          }
          if (naar && naarDoel) {
            perTank[naar] = perTank[naar] || { volume: 0, partij: "" };
            perTank[naar].volume += vol;
            perTank[naar].partij = partij;
          }
        }
        for (let i = 0; i < tanks.length; i++) {
          const tank = tanks[i];
          const stand = perTank[tank.id] || { volume: 0, partij: "" };
          const volume = Math.max(0, Math.round(stand.volume * 100) / 100);
          const status = tank.getString("status");
          tank.set("huidig_volume_l", volume);
          tank.set("huidige_partij", volume > 0 ? stand.partij : "");
          if (status !== "reiniging" && status !== "defect") {
            tank.set("status", volume > 0 ? "in_gebruik" : "leeg");
          }
          txApp.save(tank);
          bijgewerkt++;
        }
      });
      return e.json(200, { ok: true, tanks_bijgewerkt: bijgewerkt });
    } catch (err) {
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);
