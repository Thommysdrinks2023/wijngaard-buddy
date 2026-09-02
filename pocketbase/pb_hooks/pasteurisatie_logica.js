// Fase 17 Blok D/E/F — gedeelde pasteurisatielogica. Via require() BINNEN
// elke handler geladen (JSVM-pool-eigenaardigheid, zie kelder_logica.js).
// Dit bestand heeft bewust geen .pb.js-extensie: het registreert zelf niets.

function leesbareFout(err) {
  if (err && err.status) return err;
  return new BadRequestError(
    "Pasteurisatie-endpoint fout: " + (err && err.message ? err.message : String(err)),
  );
}

function vandaagStr() {
  const nu = new Date();
  return (
    nu.getFullYear() +
    "-" +
    String(nu.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(nu.getDate()).padStart(2, "0")
  );
}

/**
 * Start een pasteurisatie-run. Zoekt de partij op lotnummer; bestaat die
 * niet, dan wordt (indien nieuwePartij is meegegeven) een "alleen bottelen"-
 * partij aangemaakt — geen losse run zonder koppeling (zie de opdracht,
 * Blok F). Schrijft atomisch de run EN de openingsregel in het kelderlog.
 *
 * Bij een marginaal/onveilig veiligheidsoordeel is oordeel_geaccepteerd_door
 * verplicht — dat is de vastgelegde, expliciete bevestiging die de opdracht
 * eist vóór een run met dat oordeel mag starten.
 */
function startRun(txApp, b) {
  if (!b.lotnummer) return { fout: "lotnummer is verplicht" };
  if (!b.product_soort) return { fout: "product_soort is verplicht" };
  if (!b.doeltemperatuur_c) return { fout: "doeltemperatuur_c is verplicht" };
  if (b.veiligheidsoordeel && b.veiligheidsoordeel !== "veilig" && !b.oordeel_geaccepteerd_door) {
    return {
      fout:
        'Een run met oordeel "' +
        b.veiligheidsoordeel +
        '" vereist een expliciete bevestiging (oordeel_geaccepteerd_door).',
    };
  }

  let partij = null;
  if (b.partij) {
    try {
      partij = txApp.findRecordById("partijen", b.partij);
    } catch (err) {
      return { fout: "Opgegeven partij niet gevonden." };
    }
  } else {
    const gevonden = txApp.findRecordsByFilter(
      "partijen",
      "lotnummer = {:lot}",
      "-created",
      1,
      0,
      { lot: b.lotnummer },
    );
    if (gevonden.length > 0) {
      partij = gevonden[0];
    } else if (b.nieuwe_partij) {
      const col = txApp.findCollectionByNameOrId("partijen");
      partij = new Record(col);
      partij.set("naam", b.nieuwe_partij.naam || b.lotnummer);
      partij.set("jaargang", b.nieuwe_partij.jaargang || new Date().getFullYear());
      partij.set("type", b.nieuwe_partij.type || "overig");
      // "Alleen bottelen"-variant (loonproductie): geen oogst, geen
      // tankhistorie. status "klaar_voor_botteling" past dit exact — de
      // partij begint in feite bij aankomst van het product.
      partij.set("status", "klaar_voor_botteling");
      partij.set("lotnummer", b.lotnummer);
      if (b.eigenaar) partij.set("eigenaar", b.eigenaar);
      if (b.nieuwe_partij.opdracht_type) partij.set("opdracht_type", b.nieuwe_partij.opdracht_type);
      partij.set("vineyard_id", b.vineyard_id || "");
      txApp.save(partij);
    } else {
      return {
        fout: "Geen partij gevonden voor dit lotnummer.",
        partijNietGevonden: true,
      };
    }
  }

  const rcol = txApp.findCollectionByNameOrId("pasteurisatie_runs");
  const run = new Record(rcol);
  run.set("eigenaar", b.eigenaar || partij.getString("eigenaar") || "");
  run.set("partij", partij.id);
  run.set("lotnummer", b.lotnummer);
  if (b.bottelronde) run.set("bottelronde", b.bottelronde);
  run.set("product_soort", b.product_soort);
  run.set("datum", b.datum || vandaagStr());
  run.set("starttijd", b.starttijd || new Date().toISOString());
  if (b.flestype) run.set("flestype", b.flestype);
  if (b.sluiting) run.set("sluiting", b.sluiting);
  if (b.aantal_flessen != null) run.set("aantal_flessen", b.aantal_flessen);
  if (b.vulvolume_ml != null) run.set("vulvolume_ml", b.vulvolume_ml);
  if (b.co2_gehalte_gl != null) run.set("co2_gehalte_gl", b.co2_gehalte_gl);
  run.set("doel_pu_min", b.doel_pu_min != null ? b.doel_pu_min : 100);
  run.set("doel_pu_max", b.doel_pu_max != null ? b.doel_pu_max : 150);
  run.set("doeltemperatuur_c", b.doeltemperatuur_c);
  if (b.berekende_max_druk_bar != null) run.set("berekende_max_druk_bar", b.berekende_max_druk_bar);
  if (b.veiligheidsoordeel) run.set("veiligheidsoordeel", b.veiligheidsoordeel);
  if (b.oordeel_geaccepteerd_door) run.set("oordeel_geaccepteerd_door", b.oordeel_geaccepteerd_door);
  run.set("sensor_positie", b.sensor_positie || "");
  run.set("status", "actief");
  if (b.uitgevoerd_door) run.set("uitgevoerd_door", b.uitgevoerd_door);
  run.set("vineyard_id", b.vineyard_id || "");
  txApp.save(run);

  const kcol = txApp.findCollectionByNameOrId("kelderlog");
  const regel = new Record(kcol);
  regel.set("datum", run.getString("datum"));
  regel.set("partij", partij.id);
  regel.set("actie", "pasteurisatie");
  const oordeelTekst = b.veiligheidsoordeel ? ", oordeel " + b.veiligheidsoordeel : "";
  regel.set(
    "notitie",
    "Pasteurisatierun gestart (lot " +
      b.lotnummer +
      ", doel " +
      run.getFloat("doel_pu_min") +
      "-" +
      run.getFloat("doel_pu_max") +
      " PU bij " +
      b.doeltemperatuur_c +
      " °C" +
      oordeelTekst +
      ").",
  );
  regel.set("ingevoerd_door", b.uitgevoerd_door_naam || b.ingevoerd_door || "onbekend");
  regel.set("vineyard_id", b.vineyard_id || "");
  txApp.save(regel);

  return { runId: run.id, partijId: partij.id, partijAangemaakt: !b.partij && !!b.nieuwe_partij };
}

/**
 * Rondt een run af. Het eindresultaat (totale_pu, verdeling over de fasen,
 * piektemperatuur) wordt AL BEREKEND aangeleverd door de client — deze
 * server-kant doet geen tweede PU-berekening in JSVM, om te voorkomen dat
 * twee implementaties van dezelfde formule (TypeScript in
 * src/lib/pasteurisatie.ts vs. een JSVM-kopie) uit elkaar gaan lopen. Wat
 * hier wél gebeurt is atomisch: de run bijwerken EN de afsluitregel in het
 * kelderlog wegschrijven, of geen van beide.
 */
function rondRunAf(txApp, b) {
  if (!b.run_id) return { fout: "run_id is verplicht" };
  if (b.totale_pu == null) return { fout: "totale_pu is verplicht" };

  let run = null;
  try {
    run = txApp.findRecordById("pasteurisatie_runs", b.run_id);
  } catch (err) {
    return { fout: "Run niet gevonden." };
  }
  if (run.getString("status") === "afgerond") {
    return { fout: "Deze run is al afgerond." };
  }

  run.set("status", "afgebroken" === b.status ? "afgebroken" : "afgerond");
  run.set("eindtijd", b.eindtijd || new Date().toISOString());
  run.set("totale_pu", b.totale_pu);
  run.set("pu_opwarm", b.pu_opwarm || 0);
  run.set("pu_houd", b.pu_houd || 0);
  run.set("pu_afkoel", b.pu_afkoel || 0);
  if (b.piektemperatuur_c != null) run.set("piektemperatuur_c", b.piektemperatuur_c);
  if (b.aantal_flessen != null) run.set("aantal_flessen", b.aantal_flessen);
  txApp.save(run);

  const partijId = run.getString("partij");
  const kcol = txApp.findCollectionByNameOrId("kelderlog");
  const regel = new Record(kcol);
  regel.set("datum", vandaagStr());
  regel.set("partij", partijId);
  regel.set("actie", "pasteurisatie");
  const doelMin = run.getFloat("doel_pu_min");
  const doelMax = run.getFloat("doel_pu_max");
  const binnenDoel = b.totale_pu >= doelMin && b.totale_pu <= doelMax;
  let notitie =
    "Pasteurisatierun afgerond (lot " +
    run.getString("lotnummer") +
    "): " +
    Math.round(b.totale_pu * 10) / 10 +
    " PU (opwarm " +
    Math.round((b.pu_opwarm || 0) * 10) / 10 +
    " / houd " +
    Math.round((b.pu_houd || 0) * 10) / 10 +
    " / afkoel " +
    Math.round((b.pu_afkoel || 0) * 10) / 10 +
    "), doel " +
    doelMin +
    "-" +
    doelMax +
    " PU " +
    (binnenDoel ? "(binnen doel)" : "(BUITEN doel)") +
    (b.piektemperatuur_c != null ? ", piek " + b.piektemperatuur_c + " °C" : "") +
    (run.getFloat("aantal_flessen") ? ", " + run.getFloat("aantal_flessen") + " flessen" : "") +
    ".";
  if (b.meetgaten && b.meetgaten > 0) {
    notitie +=
      " Let op: " + b.meetgaten + " meetgat(en) tijdens de run — de PU is daardoor minder zeker.";
  }
  regel.set("notitie", notitie);
  regel.set("ingevoerd_door", b.uitgevoerd_door_naam || b.ingevoerd_door || "onbekend");
  regel.set("vineyard_id", run.getString("vineyard_id") || "");
  txApp.save(regel);

  return { ok: true, runId: run.id };
}

module.exports = { leesbareFout, startRun, rondRunAf, vandaagStr };
