/// <reference path="../pb_data/types.d.ts" />

// Fase 10 Blok 5 — signaal naar taak promoveren.
//
// Hergebruikt de BESTAANDE agent_acties-bevestigingsflow (besluit 4: geen
// nieuwe statusmachine). agent_acties heeft createRule: null, dus dit moet
// via een hook. Belangrijk detail dat pas bij het bouwen bleek: gesprek_id
// is VERPLICHT in het schema (bericht_id niet). Een signaal hoort bij geen
// gesprek, dus in plaats van het schema te versoepelen maakt dit endpoint
// een kort gesprek aan met het signaal als aanleiding — zo staat het
// voorstel op /assistent netjes in context en blijft er precies één plek
// waar iets bevestigd/uitgevoerd wordt.
routerAdd(
  "POST",
  "/api/tappenmars/signaal-naar-taak",
  (e) => {
    const uitvoering = require(`${__hooks}/agent_uitvoering.js`);
    try {
      const kelderLogica = require(`${__hooks}/kelder_logica.js`);
      const schrijfFout = kelderLogica.eisSchrijfrecht(e.auth);
      if (schrijfFout) return e.json(403, { message: schrijfFout });

      const b = e.requestInfo().body;
      if (!b.actie_type) throw new BadRequestError("actie_type is verplicht.");
      if (!b.samenvatting) throw new BadRequestError("samenvatting is verplicht.");
      if (!b.payload) throw new BadRequestError("payload is verplicht.");

      const naam =
        b.verantwoordelijke ||
        (e.auth && (e.auth.get("name") || e.auth.get("email"))) ||
        "onbekend";

      let actieId = "";
      let gesprekId = "";
      e.app.runInTransaction((txApp) => {
        // Kort gesprek als drager van het voorstel (gesprek_id is verplicht).
        const gesprekCol = txApp.findCollectionByNameOrId("agent_gesprekken");
        const gesprek = new Record(gesprekCol);
        gesprek.set("titel", "Taak uit signaal: " + b.samenvatting.slice(0, 60));
        gesprek.set("laatste_bericht_op", new Date().toISOString());
        txApp.save(gesprek);
        gesprekId = gesprek.id;

        // Assistentbericht als drager: /assistent groepeert bevestigingskaarten
        // per bericht_id (actiesPerBericht in assistent.tsx), dus zonder
        // bericht zou het voorstel onzichtbaar blijven in de chat.
        const berichtCol = txApp.findCollectionByNameOrId("agent_berichten");
        const bericht = new Record(berichtCol);
        bericht.set("gesprek_id", gesprek.id);
        bericht.set("rol", "assistant");
        bericht.set(
          "inhoud",
          "Dit voorstel komt uit een signaal op je startscherm. Bevestig het hieronder om het te boeken, of wijs het af.",
        );
        txApp.save(bericht);

        const actieCol = txApp.findCollectionByNameOrId("agent_acties");
        const actie = new Record(actieCol);
        actie.set("gesprek_id", gesprek.id);
        actie.set("bericht_id", bericht.id);
        actie.set("actie_type", b.actie_type);
        actie.set("payload", b.payload);
        actie.set("samenvatting", b.samenvatting);
        actie.set("status", "voorgesteld");
        txApp.save(actie);
        actieId = actie.id;
      });

      return e.json(200, { ok: true, actie_id: actieId, gesprek_id: gesprekId, door: naam });
    } catch (err) {
      throw uitvoering.leesbareFout(err);
    }
  },
  $apis.requireAuth(),
);
