/// <reference path="../pb_data/types.d.ts" />
// Voorraad-endpoints (Fase 4, zie DECISIONS-FASE4.md). Alle mutaties op
// voorraad_flessen lopen hierlangs, atomisch (mutatieregel + aantal_huidig/
// status-cache in één transactie) — zelfde patroon als pb_hooks/kelder.pb.js.
// De voorraad_mutaties-collectie zelf staat dicht in de API-rules
// (create/update/delete = null): dit is de enige route naar het register.
// Correcties zijn nieuwe regels (mutatie_type "correctie"), nooit
// bewerkingen van bestaande regels.
//
// JSVM-eigenaardigheid: handlers draaien in een VM-pool waarin niets uit dit
// bestand buiten de handler bestaat — daarom laadt elke handler de gedeelde
// logica zelf via require() (zie voorraad_logica.js).

// ---------- POST /api/tappenmars/voorraad-mutatie ----------
routerAdd(
  "POST",
  "/api/tappenmars/voorraad-mutatie",
  (e) => {
    const logica = require(`${__hooks}/voorraad_logica.js`);
    let resultaat = null;
    try {
      const b = e.requestInfo().body;
      const kelderLogica = require(`${__hooks}/kelder_logica.js`);
      const schrijfFout = kelderLogica.eisSchrijfrecht(e.auth);
      if (schrijfFout) return e.json(403, { message: schrijfFout });
      if (b.mutatie_type === "correctie") {
        const rolFout = kelderLogica.eisBeheerder(e.auth, "voorraadcorrecties boeken");
        if (rolFout) return e.json(403, { message: rolFout });
      }
      e.app.runInTransaction((txApp) => {
        resultaat = logica.voerMutatieUit(txApp, b);
        if (resultaat.fout) throw new Error(resultaat.fout); // rollback
      });
      return e.json(200, {
        ok: true,
        waarschuwing: resultaat.waarschuwing || "",
        regelId: resultaat.regelId,
        aantal_huidig: resultaat.aantal_huidig,
        status: resultaat.status,
      });
    } catch (err) {
      if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);

// ---------- POST /api/tappenmars/order-leveren ----------
// Eindsprint Blok L. Eén gebruikersactie -> per orderregel een
// voorraad_mutatie (type "verkocht", met order-referentie) + de order op
// "geleverd", alles in één transactie. De voorraadmutatie blijft de enige
// bron van waarheid; de order is administratie eromheen. Faalt één regel
// (bv. te weinig voorraad), dan rolt alles terug en blijft de order concept.
routerAdd(
  "POST",
  "/api/tappenmars/order-leveren",
  (e) => {
    const logica = require(`${__hooks}/voorraad_logica.js`);
    const kelderLogica = require(`${__hooks}/kelder_logica.js`);
    let fout = "";
    try {
      const schrijfFout = kelderLogica.eisSchrijfrecht(e.auth);
      if (schrijfFout) return e.json(403, { message: schrijfFout });
      const b = e.requestInfo().body;
      if (!b.order_id) throw new BadRequestError("order_id is verplicht.");
      const naam =
        b.verantwoordelijke ||
        (e.auth &&
          !e.auth.isSuperuser() &&
          (e.auth.getString("name") || e.auth.getString("email"))) ||
        "onbekend";

      const nu = new Date();
      const vandaag =
        nu.getFullYear() +
        "-" +
        String(nu.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(nu.getDate()).padStart(2, "0");

      const resultaten = [];
      e.app.runInTransaction((txApp) => {
        const order = txApp.findRecordById("orders", b.order_id);
        if (order.getString("status") !== "concept") {
          fout = "Deze order is al geleverd of betaald.";
          throw new Error(fout);
        }
        const regels = logica.leesJsonVeld(order, "regels");
        if (!Array.isArray(regels) || regels.length === 0) {
          fout = "De order heeft geen regels.";
          throw new Error(fout);
        }
        let klantNaam = "";
        try {
          klantNaam = txApp.findRecordById("klanten", order.getString("klant")).getString("naam");
        } catch (err) {
          /* klant kan ontbreken bij handmatig gewijzigde data */
        }
        for (let i = 0; i < regels.length; i++) {
          const regel = regels[i];
          const resultaat = logica.voerMutatieUit(txApp, {
            voorraad: regel.voorraad,
            mutatie_type: "verkocht",
            aantal: regel.aantal,
            datum: order.getString("datum") <= vandaag ? order.getString("datum") : vandaag,
            afnemer_of_reden: "Order " + order.id + (klantNaam ? " — " + klantNaam : ""),
            ingevoerd_door: naam,
            vineyard_id: order.getString("vineyard_id"),
          });
          if (resultaat.fout) {
            fout = "Regel " + (i + 1) + ": " + resultaat.fout;
            throw new Error(fout);
          }
          resultaten.push({ voorraad: regel.voorraad, aantal_huidig: resultaat.aantal_huidig });
        }
        order.set("status", "geleverd");
        txApp.save(order);
      });
      return e.json(200, { ok: true, geleverd: resultaten });
    } catch (err) {
      if (fout) throw new BadRequestError(fout);
      throw logica.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);
