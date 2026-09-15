// Idempotentie van tankboekboekingen (15 september 2026). Wordt via require()
// BINNEN de handler in kelder.pb.js geladen (JSVM-patroon, zie
// kelder_logica.js). Geen .pb.js-extensie: dit bestand registreert niets.
//
// Aanleiding: na een verloren antwoord (time-out op een overbelaste machine,
// 14 september) is een tweede tik op "Boeken" een tweede regel in het
// onwijzigbare register. Het formulier stuurt daarom één sleutel mee die
// gelijk blijft tot de boeking geslaagd is; met een bekende sleutel boekt de
// server niet opnieuw maar geeft de bestaande regel terug.
//
// De sleutel wordt ná de boeking op de hoofdregel gezet (aparte save binnen
// dezelfde transactie), zodat de boekingslogica zelf ongewijzigd blijft.
// Een unieke deelindex op tankboek.boeking_sleutel vangt twee gelijktijdige
// aanvragen met dezelfde sleutel: de verliezer ketst op de index en krijgt
// alsnog de regel van de winnaar terug.

const MAX_SLEUTEL_LENGTE = 100;

function leesSleutel(b) {
  const s = b && b.boeking_sleutel;
  if (typeof s !== "string") return "";
  const schoon = s.trim();
  if (!schoon || schoon.length > MAX_SLEUTEL_LENGTE) return "";
  return schoon;
}

function zoekBestaandeBoeking(app, sleutel) {
  if (!sleutel) return null;
  try {
    return app.findFirstRecordByFilter("tankboek", "boeking_sleutel = {:s}", { s: sleutel });
  } catch (_) {
    return null;
  }
}

function koppelSleutel(txApp, regelId, sleutel) {
  if (!sleutel) return;
  const regel = txApp.findRecordById("tankboek", regelId);
  regel.set("boeking_sleutel", sleutel);
  txApp.save(regel);
}

/**
 * Voert `voerBoekingUit(txApp, b)` idempotent uit. Geeft terug:
 *   { fout }                                     — validatiefout, niets geschreven
 *   { regelId, waarschuwing, alGeboekt: false }  — nu geboekt
 *   { regelId, waarschuwing: "", alGeboekt: true } — eerder al geboekt met deze sleutel
 * Andere fouten worden ongewijzigd doorgegooid (de aanroeper vertaalt ze).
 */
function boekMetSleutel(app, b, voerBoekingUit) {
  const sleutel = leesSleutel(b);
  let resultaat = null;
  let alGeboekt = false;
  try {
    app.runInTransaction((txApp) => {
      const bestaand = zoekBestaandeBoeking(txApp, sleutel);
      if (bestaand) {
        resultaat = { regelId: bestaand.id, waarschuwing: "" };
        alGeboekt = true;
        return;
      }
      resultaat = voerBoekingUit(txApp, b);
      // Melding buiten de transactie bewaard (JSVM-valkuil 2); gooien = rollback.
      if (resultaat.fout) throw new Error(resultaat.fout);
      koppelSleutel(txApp, resultaat.regelId, sleutel);
    });
  } catch (err) {
    if (resultaat && resultaat.fout) return { fout: resultaat.fout };
    const winnaar = zoekBestaandeBoeking(app, sleutel);
    if (winnaar) return { regelId: winnaar.id, waarschuwing: "", alGeboekt: true };
    throw err;
  }
  return {
    regelId: resultaat.regelId,
    waarschuwing: resultaat.waarschuwing || "",
    alGeboekt,
  };
}

module.exports = { leesSleutel, zoekBestaandeBoeking, koppelSleutel, boekMetSleutel };
