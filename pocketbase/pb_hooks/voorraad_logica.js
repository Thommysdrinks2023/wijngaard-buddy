// Gedeelde voorraadlogica (Fase 4). Wordt via require() BINNEN elke handler
// geladen — zelfde JSVM-pool-eigenaardigheid als kelder_logica.js (zie
// CLAUDE.md/DECISIONS-FASE3.md). Dit bestand heeft bewust geen .pb.js-
// extensie: het registreert zelf niets.

function leesbareFout(err) {
  if (err && err.status) return err;
  return new BadRequestError(
    "Voorraad-endpoint fout: " + (err && err.message ? err.message : String(err)),
  );
}

// Afname-types boeken altijd negatief, ongeacht het teken dat de client
// stuurt — de UI vraagt gewoon "hoeveel flessen", positief. Alleen
// "correctie" mag een expliciet teken meegeven (omhoog of omlaag).
const AFNAME_TYPES = ["verkocht", "eigen_gebruik", "kapot", "weggegeven"];

/**
 * Valideert een voorraadmutatie en voert haar uit binnen de meegegeven
 * transactie. Retourneert { fout } bij een validatieprobleem (nog niets
 * geschreven), anders { waarschuwing, regelId, aantal_huidig, status }.
 * Gooit zelf nooit: fouten die de transactiegrens passeren verliezen hun
 * boodschap (zelfde les als kelder_logica.js).
 */
function voerMutatieUit(txApp, b) {
  if (!b.voorraad) return { fout: "voorraad is verplicht" };
  if (!b.mutatie_type) return { fout: "mutatie_type is verplicht" };
  if (!b.datum || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.datum)))
    return { fout: "datum is verplicht (jjjj-mm-dd)" };
  if (!b.ingevoerd_door) return { fout: "ingevoerd_door is verplicht" };

  let aantal = Number(b.aantal);
  if (Number.isNaN(aantal) || aantal === 0)
    return { fout: "aantal moet een geldig, niet-nul getal zijn" };
  if (AFNAME_TYPES.indexOf(b.mutatie_type) !== -1) aantal = -Math.abs(aantal);

  // Rule V4 — geen toekomstboekingen (hard); terugdateren >24u = waarschuwing (zacht)
  const nu = new Date();
  const vandaagStr =
    nu.getFullYear() +
    "-" +
    String(nu.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(nu.getDate()).padStart(2, "0");
  if (b.datum > vandaagStr) return { fout: "Mutatiedatum kan niet in de toekomst liggen." };
  let waarschuwing = "";
  const uurVerschil = (nu.getTime() - new Date(b.datum + "T12:00:00").getTime()) / 3600000;
  if (uurVerschil > 24) {
    waarschuwing =
      "Let op: deze mutatie is " + Math.round(uurVerschil / 24) + " dag(en) teruggedateerd.";
  }

  let voorraad;
  try {
    voorraad = txApp.findRecordById("voorraad_flessen", b.voorraad);
  } catch (err) {
    return { fout: "Voorraadrecord niet gevonden." };
  }

  const huidig = voorraad.getFloat("aantal_huidig");
  const nieuw = huidig + aantal;

  // Rule V1 — voorraad-continuïteit ("systeem toont X, jij boekt Y af")
  if (nieuw < 0) {
    return {
      fout:
        "Aantal klopt niet: het systeem toont " +
        huidig +
        " flessen, jij boekt " +
        Math.abs(aantal) +
        " af. Controleer de voorraad of boek eerst een correctie.",
    };
  }

  // Validatie geslaagd — nu pas schrijven.
  const col = txApp.findCollectionByNameOrId("voorraad_mutaties");
  const regel = new Record(col);
  regel.set("voorraad", b.voorraad);
  regel.set("mutatie_type", b.mutatie_type);
  regel.set("aantal", aantal);
  regel.set("datum", b.datum);
  regel.set("afnemer_of_reden", b.afnemer_of_reden || "");
  regel.set("ingevoerd_door", b.ingevoerd_door);
  regel.set("notities", b.notities || "");
  regel.set("vineyard_id", b.vineyard_id || "");
  txApp.save(regel);

  // Rule V3 — status volgt aantal_huidig
  const nieuweStatus = nieuw <= 0 ? "uitverkocht" : "op_voorraad";
  voorraad.set("aantal_huidig", nieuw);
  voorraad.set("status", nieuweStatus);
  txApp.save(voorraad);

  return {
    waarschuwing: waarschuwing,
    regelId: regel.id,
    aantal_huidig: nieuw,
    status: nieuweStatus,
  };
}

// record.get("jsonveld") levert in de JSVM een types.JSONRaw (byte-array) op —
// zelfde valkuil als gedocumenteerd in CLAUDE.md/agent_uitvoering.js.
function leesJsonVeld(record, veld) {
  const ruw = record.get(veld);
  if (ruw == null) return null;
  // Zie agent_uitvoering.js: een kale SyntaxError levert een onbruikbare
  // melding op bij een leeg/half weggeschreven veld.
  const parse = (tekst) => {
    try {
      return JSON.parse(tekst);
    } catch (e) {
      throw new Error(
        `Het opgeslagen veld "${veld}" is onleesbaar (geen geldige JSON). De mutatie is niet uitgevoerd.`,
      );
    }
  };
  if (typeof ruw === "object" && typeof ruw.string === "function") return parse(ruw.string());
  if (typeof ruw === "string") return parse(ruw);
  return ruw;
}

module.exports = { leesbareFout, voerMutatieUit, leesJsonVeld };
