/// <reference path="../pb_data/types.d.ts" />
// AI-agent-endpoints (Fase 3). Zie DECISIONS-FASE3.md voor de architectuur-
// beslissingen.
//
// JSVM-eigenaardigheid (kostte hier opnieuw een debugronde, zie
// DECISIONS-FASE3.md): top-level functies in dit .pb.js-bestand bestaan NIET
// binnen een routerAdd-handler (aparte executor-VM's). Daarom staat ALLE
// gedeelde logica - ook kleine helpers als leesbareFout/leesSysteemprompt -
// in agent_uitvoering.js en wordt die per handler opnieuw via require()
// geladen. Zelfde patroon als pb_hooks/kelder.pb.js.
//
// De server-URL waarop de agent zichzelf bereikt (nodig voor foto-analyse)
// komt uit uitvoering.pocketbaseBasisUrl(): POCKETBASE_URL uit .env, met
// http://127.0.0.1:8090 als terugval. Stond hier eerder drie keer als
// letterlijke string - een landmijn voor de Pi/VPS-migratie. Bewust geen
// top-level const in dit bestand: die bestaat niet binnen een routerAdd-
// handler (VM-pool), vandaar de helper in agent_uitvoering.js.

// ---------- POST /api/agent/bericht ----------
// body: { bericht_id, verantwoordelijke? } - het user-bericht dat de frontend
// al rechtstreeks via de SDK heeft aangemaakt in agent_berichten (inclusief
// eventuele foto). Geen requireAuth: de assistent werkt (net als de rest van
// de app) bewust ook zonder inloggen; de naam komt uit de body (de lokaal
// ingestelde invoerder) met de accountnaam als terugval.
routerAdd("POST", "/api/agent/bericht", (e) => {
  const uitvoering = require(`${__hooks}/agent_uitvoering.js`);
  try {
    // Rate limit vóór alles (Blok C): elke aanroep kost een betaalde
    // Claude-call, dus ook ongeldige requests tellen mee tegen de limiet.
    const limietFout = uitvoering.controleerRateLimit(e.app, e.realIP());
    if (limietFout) return e.json(429, { message: limietFout });
    const b = e.requestInfo().body;
    if (!b.bericht_id) throw new BadRequestError("bericht_id is verplicht.");
    const bericht = e.app.findRecordById("agent_berichten", b.bericht_id);
    const gesprekId = bericht.getString("gesprek_id");
    const naam =
      b.verantwoordelijke || (e.auth && (e.auth.get("name") || e.auth.get("email"))) || "onbekend";

    const resultaat = uitvoering.verwerkBeurt(e.app, {
      gesprekId,
      systeemprompt: uitvoering.leesSysteemprompt(),
      pocketbaseUrl: uitvoering.pocketbaseBasisUrl(),
      verantwoordelijke: naam,
    });
    if (resultaat.fout) throw new BadRequestError(resultaat.fout);
    return e.json(200, { ok: true, ...resultaat });
  } catch (err) {
    throw uitvoering.leesbareFout(err);
  }
});

// ---------- POST /api/agent/actie/{id}/bevestig ----------
routerAdd("POST", "/api/agent/actie/{id}/bevestig", (e) => {
  const uitvoering = require(`${__hooks}/agent_uitvoering.js`);
  try {
    // Zelfde rate limit als /bericht: een mislukte bevestiging draait
    // verwerkBeurt() opnieuw en kost dus ook een betaalde Claude-call.
    const limietFout = uitvoering.controleerRateLimit(e.app, e.realIP());
    if (limietFout) return e.json(429, { message: limietFout });
    const actieId = e.request.pathValue("id");
    const body = e.requestInfo().body;
    const naam =
      body.verantwoordelijke ||
      (e.auth && (e.auth.get("name") || e.auth.get("email"))) ||
      "onbekend";
    let statusNa = "";
    let fout = "";
    let uitgevoerdRecordId = "";
    let gesprekId = "";

    e.app.runInTransaction((txApp) => {
      const actie = txApp.findRecordById("agent_acties", actieId);
      if (actie.getString("status") !== "voorgesteld") {
        throw new Error("Dit voorstel is al verwerkt.");
      }
      gesprekId = actie.getString("gesprek_id");
      // bevestigd_door is een relatie naar "users" - een superuser-token (bv.
      // bij handmatig testen/support via de admin-API) zit in _superusers en
      // faalt dan op de relatie-validatie ("Failed to find all relation
      // records"). isSuperuser() sluit dat geval uit; anonieme/normale
      // gebruikers-auth blijft ongewijzigd.
      actie.set("bevestigd_door", e.auth && !e.auth.isSuperuser() ? e.auth.id : "");
      actie.set("bevestigd_op", new Date().toISOString());

      const resultaat = uitvoering.voerBevestigdeActieUit(
        txApp,
        actie.getString("actie_type"),
        uitvoering.leesJsonVeld(actie, "payload"),
        naam,
      );
      if (resultaat.fout) {
        actie.set("status", "mislukt");
        actie.set("fout", resultaat.fout);
        fout = resultaat.fout;
        statusNa = "mislukt";
      } else {
        actie.set("status", "uitgevoerd");
        actie.set("uitgevoerd_record_id", resultaat.record_id);
        uitgevoerdRecordId = resultaat.record_id;
        statusNa = "uitgevoerd";
      }
      txApp.save(actie);
    });

    let vervolg = null;
    if (statusNa === "mislukt") {
      // hook-foutmelding terug de loop in, zodat de agent dit in gewone
      // taal kan uitleggen (kernprincipe: geen ruwe foutmeldingen tonen)
      const col = e.app.findCollectionByNameOrId("agent_berichten");
      const rec = new Record(col);
      rec.set("gesprek_id", gesprekId);
      rec.set("rol", "tool");
      rec.set(
        "inhoud",
        `Systeemmelding: de voorgestelde actie is geweigerd door het systeem: ${fout}. ` +
          `Leg dit in gewone taal uit aan de gebruiker en stel een concrete vervolgvraag.`,
      );
      e.app.save(rec);
      vervolg = uitvoering.verwerkBeurt(e.app, {
        gesprekId,
        systeemprompt: uitvoering.leesSysteemprompt(),
        pocketbaseUrl: uitvoering.pocketbaseBasisUrl(),
        verantwoordelijke: naam,
      });
    }

    return e.json(200, {
      ok: true,
      status: statusNa,
      uitgevoerd_record_id: uitgevoerdRecordId,
      fout,
      vervolg,
    });
  } catch (err) {
    throw uitvoering.leesbareFout(err);
  }
});

// ---------- POST /api/agent/actie/{id}/afwijzen ----------
routerAdd("POST", "/api/agent/actie/{id}/afwijzen", (e) => {
  const uitvoering = require(`${__hooks}/agent_uitvoering.js`);
  try {
    // Afwijzen triggert ook een nieuwe agent-beurt (uitleg in gewone taal).
    const limietFout = uitvoering.controleerRateLimit(e.app, e.realIP());
    if (limietFout) return e.json(429, { message: limietFout });
    const actieId = e.request.pathValue("id");
    const body = e.requestInfo().body;
    const naam =
      body.verantwoordelijke ||
      (e.auth && (e.auth.get("name") || e.auth.get("email"))) ||
      "onbekend";
    const actie = e.app.findRecordById("agent_acties", actieId);
    if (actie.getString("status") !== "voorgesteld") {
      throw new BadRequestError("Dit voorstel is al verwerkt.");
    }
    actie.set("status", "afgewezen");
    e.app.save(actie);

    const gesprekId = actie.getString("gesprek_id");
    const col = e.app.findCollectionByNameOrId("agent_berichten");
    const rec = new Record(col);
    rec.set("gesprek_id", gesprekId);
    rec.set("rol", "tool");
    rec.set(
      "inhoud",
      `Systeemmelding: de gebruiker heeft het voorstel "${actie.getString("samenvatting")}" afgewezen. ` +
        `Vraag kort wat er anders moet, of ga door met het gesprek.`,
    );
    e.app.save(rec);
    const vervolg = uitvoering.verwerkBeurt(e.app, {
      gesprekId,
      systeemprompt: uitvoering.leesSysteemprompt(),
      pocketbaseUrl: uitvoering.pocketbaseBasisUrl(),
      verantwoordelijke: naam,
    });

    return e.json(200, { ok: true, status: "afgewezen", vervolg });
  } catch (err) {
    throw uitvoering.leesbareFout(err);
  }
});
