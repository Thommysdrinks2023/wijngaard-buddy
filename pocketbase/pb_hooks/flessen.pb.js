/// <reference path="../pb_data/types.d.ts" />
//
// Fase 15 Blok B — flessenvoorraad-endpoints. Alle mutaties op
// flessen_mutaties lopen hierlangs, append-only (de collectie zelf staat
// dicht in de API-rules: create/update/delete = null) — zelfde patroon als
// pb_hooks/kelder.pb.js/tankboek. Correcties zijn nieuwe regels
// (mutatie_type "telcorrectie"), nooit bewerkingen van bestaande regels.
// Geen $apis.requireAuth(): de app werkt bewust zonder login (zie CLAUDE.md,
// "Inloggen verwijderd"), net als alle andere kelder-/voorraadendpoints.
//
// JSVM-eigenaardigheid: handlers draaien in een VM-pool waarin niets uit dit
// bestand buiten de handler bestaat — daarom laadt elke handler de gedeelde
// logica zelf via require() (zie flessen_logica.js).

// ---------- POST /api/tappenmars/flessen-mutatie ----------
routerAdd("POST", "/api/tappenmars/flessen-mutatie", (e) => {
  const logica = require(`${__hooks}/flessen_logica.js`);
  let resultaat = null;
  try {
    const b = e.requestInfo().body;
    const kelderLogica = require(`${__hooks}/kelder_logica.js`);
    const schrijfFout = kelderLogica.eisSchrijfrecht(e.auth);
    if (schrijfFout) return e.json(403, { message: schrijfFout });
    e.app.runInTransaction((txApp) => {
      resultaat = logica.voerMutatieUit(txApp, b);
      if (resultaat.fout) throw new Error(resultaat.fout); // rollback
    });
    return e.json(200, { ok: true, regelId: resultaat.regelId, nieuweStand: resultaat.nieuweStand });
  } catch (err) {
    if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
    throw logica.leesbareFout(err);
  }
});

// ---------- POST /api/tappenmars/flessen-telcorrectie ----------
// Apart endpoint (i.p.v. de client het verschil laten uitrekenen): de
// berekening moet plaatsvinden op dezelfde stand die de server net heeft
// vastgesteld, anders kan een gelijktijdige mutatie het verschil laten
// verschuiven tussen "stand ophalen" en "correctie boeken".
routerAdd("POST", "/api/tappenmars/flessen-telcorrectie", (e) => {
  const logica = require(`${__hooks}/flessen_logica.js`);
  let resultaat = null;
  try {
    const b = e.requestInfo().body;
    const kelderLogica = require(`${__hooks}/kelder_logica.js`);
    const schrijfFout = kelderLogica.eisSchrijfrecht(e.auth);
    if (schrijfFout) return e.json(403, { message: schrijfFout });
    e.app.runInTransaction((txApp) => {
      resultaat = logica.voerTelcorrectieUit(txApp, b);
      if (resultaat.fout) throw new Error(resultaat.fout); // rollback
    });
    return e.json(200, {
      ok: true,
      regelId: resultaat.regelId,
      nieuweStand: resultaat.nieuweStand,
    });
  } catch (err) {
    if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
    throw logica.leesbareFout(err);
  }
});

// ---------- GET /api/tappenmars/flessen-standen ----------
// Berekende stand per flestype (som van flessen_mutaties) — de bron van
// waarheid blijft de mutatiehistorie, dit is puur de optelling zodat de
// client niet zelf duizenden regels hoeft op te halen om de standenlijst te
// tonen (zelfde motivatie als tanks-herbereken, maar dan read-only).
routerAdd("GET", "/api/tappenmars/flessen-standen", (e) => {
  const logica = require(`${__hooks}/flessen_logica.js`);
  try {
    const flestypes = e.app.findRecordsByFilter("flestypes", "id != ''", "vorm", 500, 0);
    const standen = {};
    for (let i = 0; i < flestypes.length; i++) {
      standen[flestypes[i].id] = logica.huidigeStand(e.app, flestypes[i].id);
    }
    return e.json(200, { standen });
  } catch (err) {
    throw logica.leesbareFout(err);
  }
});
