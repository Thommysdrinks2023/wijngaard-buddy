// Fase 15 Blok B — lege-flessenvoorraad. Gedeelde logica, via require() BINNEN
// elke handler geladen (JSVM-pool-eigenaardigheid, zie kelder_logica.js).
// Dit bestand heeft bewust geen .pb.js-extensie: het registreert zelf niets.

function leesbareFout(err) {
  if (err && err.status) return err;
  return new BadRequestError(
    "Flessen-endpoint fout: " + (err && err.message ? err.message : String(err)),
  );
}

// Som van alle mutaties voor een flestype = de huidige stand. Bron van
// waarheid blijft flessen_mutaties (zelfde principe als tanks-herbereken) —
// dit is alleen de rekenstap, geen cache.
function huidigeStand(txApp, flestypeId) {
  const regels = txApp.findRecordsByFilter("flessen_mutaties", "flestype = {:id}", "", 100000, 0, {
    id: flestypeId,
  });
  let stand = 0;
  for (let i = 0; i < regels.length; i++) stand += regels[i].getFloat("aantal");
  return stand;
}

/**
 * Boekt één flessenmutatie. Retourneert { fout } (nog niets geschreven) of
 * { regelId, nieuweStand }. Gooit zelf nooit (transactiegrens-regel, zie
 * kelder_logica.js voor de motivatie).
 */
function voerMutatieUit(txApp, b) {
  if (!b.flestype) return { fout: "flestype is verplicht" };
  if (!b.mutatie_type) return { fout: "mutatie_type is verplicht" };
  if (!b.datum || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.datum)))
    return { fout: "datum is verplicht (jjjj-mm-dd)" };
  const aantal = Number(b.aantal);
  if (!Number.isFinite(aantal) || aantal === 0)
    return { fout: "aantal moet een getal ongelijk aan 0 zijn (richting volgt uit het teken)" };

  let flestype = null;
  try {
    flestype = txApp.findRecordById("flestypes", b.flestype);
  } catch (err) {
    return { fout: "Flestype niet gevonden." };
  }

  const negatieveTypes = ["verbruik_botteling", "breuk"];
  if (negatieveTypes.includes(b.mutatie_type) && aantal > 0)
    return { fout: 'Mutatie "' + b.mutatie_type + '" moet een negatief aantal hebben.' };
  if (b.mutatie_type === "ontvangst" && aantal < 0)
    return { fout: "Een ontvangst moet een positief aantal hebben." };

  const col = txApp.findCollectionByNameOrId("flessen_mutaties");
  const regel = new Record(col);
  regel.set("flestype", b.flestype);
  regel.set("mutatie_type", b.mutatie_type);
  regel.set("aantal", aantal);
  regel.set("datum", b.datum);
  if (b.bottelronde) regel.set("bottelronde", b.bottelronde);
  regel.set("leverancier", b.leverancier || "");
  if (b.aantal_pallets != null) regel.set("aantal_pallets", Number(b.aantal_pallets));
  regel.set("toelichting", b.toelichting || "");
  regel.set("ingevoerd_door", b.ingevoerd_door || "onbekend");
  regel.set("vineyard_id", b.vineyard_id || "");
  txApp.save(regel);

  return { regelId: regel.id, nieuweStand: huidigeStand(txApp, b.flestype) + 0 };
}

/**
 * Telcorrectie: Thomas voert de FYSIEK GETELDE stand in ("tellen wint van
 * rekenen"); de app berekent zelf het verschil t.o.v. de huidige (berekende)
 * stand en boekt dat verschil als telcorrectie-mutatie, met oud/nieuw saldo
 * in de toelichting. Bij verschil 0 wordt bewust niets geboekt (geen
 * mutatieregel zonder inhoud).
 */
function voerTelcorrectieUit(txApp, b) {
  if (!b.flestype) return { fout: "flestype is verplicht" };
  if (!b.datum || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.datum)))
    return { fout: "datum is verplicht (jjjj-mm-dd)" };
  const geteld = Number(b.geteld_aantal);
  if (!Number.isFinite(geteld) || geteld < 0)
    return { fout: "geteld_aantal moet 0 of positief zijn" };

  try {
    txApp.findRecordById("flestypes", b.flestype);
  } catch (err) {
    return { fout: "Flestype niet gevonden." };
  }

  const huidig = huidigeStand(txApp, b.flestype);
  const verschil = geteld - huidig;
  if (verschil === 0) return { regelId: "", nieuweStand: huidig, waarschuwing: "" };

  const toelichting =
    `Telcorrectie: systeem toonde ${huidig}, geteld ${geteld} ` +
    `(verschil ${verschil > 0 ? "+" : ""}${verschil}).` +
    (b.toelichting ? " " + b.toelichting : "");

  return voerMutatieUit(txApp, {
    flestype: b.flestype,
    mutatie_type: "telcorrectie",
    aantal: verschil,
    datum: b.datum,
    toelichting,
    ingevoerd_door: b.ingevoerd_door,
    vineyard_id: b.vineyard_id,
  });
}

module.exports = {
  leesbareFout,
  huidigeStand,
  voerMutatieUit,
  voerTelcorrectieUit,
};
