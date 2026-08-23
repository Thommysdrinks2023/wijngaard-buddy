/// <reference path="../pb_data/types.d.ts" />
//
// INLOGGEN WEER VERWIJDERD (besluit Thomas, 22 augustus 2026): de
// $apis.requireAuth()-middleware is opnieuw van elk endpoint in dit bestand
// weggehaald. De rolcontroles staan er bewust NOG IN: rolVan() in
// kelder_logica.js geeft bij ontbrekende auth weer "beheerder" terug, dus ze
// laten alles door. Geschiedenis: tweede keer (eerder 26 juli 2026, op 21
// augustus hersteld, nu weer weg). Zie CLAUDE.md.
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
);

// ---------- PATCH /api/tappenmars/voorraad-drempel ----------
// Fase 10 Blok 4: per-wijn voorraaddrempel instellen. voorraad_flessen heeft
// updateRule: null (alleen hooks mogen schrijven, want aantal_huidig is een
// cache van voorraad_mutaties) — daarom dit smalle endpoint dat UITSLUITEND
// het drempel_aantal-veld aanraakt en nooit de voorraadaantallen zelf.
routerAdd(
  "PATCH",
  "/api/tappenmars/voorraad-drempel",
  (e) => {
    const logica = require(`${__hooks}/voorraad_logica.js`);
    try {
      const kelderLogica = require(`${__hooks}/kelder_logica.js`);
      const schrijfFout = kelderLogica.eisSchrijfrecht(e.auth);
      if (schrijfFout) return e.json(403, { message: schrijfFout });
      const b = e.requestInfo().body;
      if (!b.voorraad_id) throw new BadRequestError("voorraad_id is verplicht.");
      const drempel = b.drempel_aantal == null ? 0 : Number(b.drempel_aantal);
      if (isNaN(drempel) || drempel < 0)
        throw new BadRequestError("De drempel moet een getal van 0 of hoger zijn.");
      const rec = e.app.findRecordById("voorraad_flessen", b.voorraad_id);
      rec.set("drempel_aantal", drempel);
      e.app.save(rec);
      return e.json(200, { ok: true, drempel_aantal: drempel });
    } catch (err) {
      throw logica.leesbareFout(err);
    }
  },
);
