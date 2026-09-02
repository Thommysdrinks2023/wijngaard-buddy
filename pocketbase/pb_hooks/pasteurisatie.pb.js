/// <reference path="../pb_data/types.d.ts" />
//
// Fase 17 Blok D/E/F — pasteurisatie-endpoints. Run starten en afronden
// lopen atomisch (run + kelderlogregel in één transactie), zelfde patroon
// als pb_hooks/kelder.pb.js. Geen $apis.requireAuth(): de app werkt bewust
// zonder login (zie CLAUDE.md, "Inloggen verwijderd").
//
// JSVM-eigenaardigheid: elke handler laadt de gedeelde logica zelf via
// require() (zie pasteurisatie_logica.js).

// ---------- POST /api/tappenmars/pasteurisatie-run-starten ----------
routerAdd("POST", "/api/tappenmars/pasteurisatie-run-starten", (e) => {
  const logica = require(`${__hooks}/pasteurisatie_logica.js`);
  let resultaat = null;
  try {
    const b = e.requestInfo().body;
    e.app.runInTransaction((txApp) => {
      resultaat = logica.startRun(txApp, b);
      if (resultaat.fout) throw new Error(resultaat.fout); // rollback
    });
    return e.json(200, {
      ok: true,
      run_id: resultaat.runId,
      partij_id: resultaat.partijId,
      partij_aangemaakt: !!resultaat.partijAangemaakt,
    });
  } catch (err) {
    if (resultaat && resultaat.fout) {
      return e.json(resultaat.partijNietGevonden ? 404 : 400, {
        message: resultaat.fout,
        partij_niet_gevonden: !!resultaat.partijNietGevonden,
      });
    }
    throw logica.leesbareFout(err);
  }
});

// ---------- POST /api/tappenmars/pasteurisatie-run-afronden ----------
routerAdd("POST", "/api/tappenmars/pasteurisatie-run-afronden", (e) => {
  const logica = require(`${__hooks}/pasteurisatie_logica.js`);
  let resultaat = null;
  try {
    const b = e.requestInfo().body;
    e.app.runInTransaction((txApp) => {
      resultaat = logica.rondRunAf(txApp, b);
      if (resultaat.fout) throw new Error(resultaat.fout); // rollback
    });
    return e.json(200, { ok: true, run_id: resultaat.runId });
  } catch (err) {
    if (resultaat && resultaat.fout) throw new BadRequestError(resultaat.fout);
    throw logica.leesbareFout(err);
  }
});

// ---------- POST /api/tappenmars/pasteurisatie-meting ----------
// Losstaand van het token-beveiligde /api/sensor/meting (dat is voor echte
// hardware). Dit endpoint is voor de live-monitor-UI en handmatige/
// gesimuleerde invoer tijdens een run (zie Blok E, DoD: "gesimuleerde run via
// curl"). Schrijft direct een sensor_metingen-record met
// bron_type="pasteurisatie_run".
routerAdd("POST", "/api/tappenmars/pasteurisatie-meting", (e) => {
  const logica = require(`${__hooks}/pasteurisatie_logica.js`);
  try {
    const b = e.requestInfo().body;
    if (!b.run_id) throw new BadRequestError("run_id is verplicht.");
    const temperatuur = Number(b.temperatuur_c);
    if (Number.isNaN(temperatuur)) throw new BadRequestError("temperatuur_c is verplicht.");
    if (temperatuur < -20 || temperatuur > 120) {
      throw new BadRequestError("temperatuur_c moet tussen -20 en 120 °C liggen.");
    }
    const col = e.app.findCollectionByNameOrId("sensor_metingen");
    const rec = new Record(col);
    rec.set("type", "temperatuur");
    rec.set("waarde", temperatuur);
    rec.set("eenheid", "°C");
    rec.set("bron_type", "pasteurisatie_run");
    rec.set("bron_id", b.run_id);
    rec.set("sensor_label", b.sensor_label || "referentiefles");
    rec.set("gemeten_op", b.gemeten_op || new Date().toISOString());
    rec.set("temperatuur_c", temperatuur);
    e.app.save(rec);
    return e.json(200, { ok: true, id: rec.id });
  } catch (err) {
    throw logica.leesbareFout(err);
  }
});
