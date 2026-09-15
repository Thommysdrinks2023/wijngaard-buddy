// Bevestig-flow voor agentacties. Wordt via require() BINNEN de handler in
// agent.pb.js geladen (JSVM-patroon, zie kelder_logica.js). Geen .pb.js-extensie:
// dit bestand registreert zelf niets.
//
// Staat los van agent.pb.js zodat de volgorde testbaar is zonder PocketBase
// (src/lib/agent-bevestig.test.ts). Daarom ook geen PocketBase-globals zoals
// BadRequestError hierin: de handler vertaalt de uitkomst naar HTTP.
//
// Foutafhandeling in twee stappen (13 september 2026, commit a0c09d8, samen
// met Codex' bottelfix a922c33):
//   1. Elke fout in de uitvoering — teruggegeven óf gegooid — rolt de hele
//      transactie terug, ook eventuele writes die de uitvoerder al deed.
//   2. Pas daarna wordt de mislukking in een aparte, kleine transactie
//      vastgelegd, zodat de actie niet op "voorgesteld" blijft hangen.
// De melding wordt vóór het gooien buiten de transactie bewaard, omdat fouten
// die de transactiegrens passeren hun boodschap kunnen verliezen (JSVM-valkuil
// 2 in CLAUDE.md).

function bevestigActie(app, opties) {
  const actieId = opties.actieId;
  const naam = opties.naam;
  const auth = opties.auth;
  const uitvoering = opties.uitvoering;

  let statusNa = "";
  let fout = "";
  let uitgevoerdRecordId = "";
  let gesprekId = "";
  let alVerwerkt = false;
  // bevestigd_door is een relatie naar "users". Een superuser-token zit in
  // _superusers en faalt dan op de relatievalidatie, vandaar leeg laten.
  const bevestigdDoor = auth && !auth.isSuperuser() ? auth.id : "";

  try {
    app.runInTransaction((txApp) => {
      const actie = txApp.findRecordById("agent_acties", actieId);
      if (actie.getString("status") !== "voorgesteld") {
        alVerwerkt = true;
        throw new Error("Dit voorstel is al verwerkt.");
      }
      gesprekId = actie.getString("gesprek_id");
      actie.set("bevestigd_door", bevestigdDoor);
      actie.set("bevestigd_op", new Date().toISOString());

      let resultaat;
      try {
        resultaat = uitvoering.voerBevestigdeActieUit(
          txApp,
          actie.getString("actie_type"),
          uitvoering.leesJsonVeld(actie, "payload"),
          naam,
        );
      } catch (uitvoerFout) {
        fout = (uitvoerFout && uitvoerFout.message) || "De actie kon niet worden uitgevoerd.";
        throw uitvoerFout;
      }
      if (resultaat.fout) {
        fout = resultaat.fout;
        throw new Error(fout);
      }
      actie.set("status", "uitgevoerd");
      actie.set("uitgevoerd_record_id", resultaat.record_id);
      uitgevoerdRecordId = resultaat.record_id;
      statusNa = "uitgevoerd";
      txApp.save(actie);
    });
  } catch (txFout) {
    if (alVerwerkt) return { alVerwerkt: true };
    // Geen melding vastgelegd = de fout kwam niet uit de uitvoering (bv. de
    // actie bestaat niet): ongewijzigd gedrag, gewoon doorgooien.
    if (!fout) throw txFout;
    let gemarkeerd = false;
    app.runInTransaction((txApp) => {
      const actie = txApp.findRecordById("agent_acties", actieId);
      // Een gelijktijdige bevestiging kan hem inmiddels verwerkt hebben.
      if (actie.getString("status") !== "voorgesteld") return;
      actie.set("status", "mislukt");
      actie.set("fout", fout);
      actie.set("bevestigd_door", bevestigdDoor);
      actie.set("bevestigd_op", new Date().toISOString());
      txApp.save(actie);
      gesprekId = actie.getString("gesprek_id");
      gemarkeerd = true;
    });
    // Niet gemarkeerd = een andere aanroep heeft het voorstel intussen
    // verwerkt. Dan is "al verwerkt" het ware antwoord voor deze poging, niet
    // een 200 met lege status en de fout van de verliezende poging
    // (reviewpunt Codex, 14 september).
    if (!gemarkeerd) return { alVerwerkt: true };
    statusNa = "mislukt";
  }

  return { alVerwerkt: false, statusNa, fout, uitgevoerdRecordId, gesprekId };
}

module.exports = { bevestigActie };
