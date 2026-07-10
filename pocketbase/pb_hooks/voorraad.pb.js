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
