// Gedeelde kelderlogica. Wordt via require() BINNEN elke handler geladen —
// het enige patroon dat werkt in PocketBase's JSVM-pool (top-level functies
// uit *.pb.js-bestanden bestaan niet in de executor-VM's).
// Dit bestand heeft bewust geen .pb.js-extensie: het registreert zelf niets.

function leesbareFout(err) {
  if (err && err.status) return err;
  return new BadRequestError(
    "Kelder-endpoint fout: " + (err && err.message ? err.message : String(err)),
  );
}

/**
 * Valideert een boeking en voert haar uit binnen de meegegeven transactie.
 * Retourneert { fout } bij een validatieprobleem (er is dan nog NIETS
 * geschreven), anders { waarschuwing, regelId }. Gooit zelf nooit: fouten
 * die de transactiegrens passeren verliezen hun boodschap.
 */
function voerBoekingUit(txApp, b) {
  if (!b.partij) return { fout: "partij is verplicht" };
  if (!b.actie) return { fout: "actie is verplicht" };
  if (!b.datum || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.datum)))
    return { fout: "datum is verplicht (jjjj-mm-dd)" };
  if (!b.verantwoordelijke) return { fout: "verantwoordelijke is verplicht" };
  const volume = Number(b.volume_l == null ? 0 : b.volume_l);
  if (Number.isNaN(volume) || volume < 0)
    return { fout: "volume_l moet 0 of positief zijn (richting volgt uit de actie)" };

  // Regel 6 — geen toekomstboekingen (hard); terugdateren >24u = waarschuwing (zacht)
  const nu = new Date();
  const vandaagStr =
    nu.getFullYear() +
    "-" +
    String(nu.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(nu.getDate()).padStart(2, "0");
  if (b.datum > vandaagStr) return { fout: "Boekingsdatum kan niet in de toekomst liggen." };
  let waarschuwing = "";
  const uurVerschil = (nu.getTime() - new Date(b.datum + "T12:00:00").getTime()) / 3600000;
  if (uurVerschil > 24) {
    waarschuwing =
      "Let op: deze boeking is " + Math.round(uurVerschil / 24) + " dag(en) teruggedateerd.";
  }

  let partij = null;
  try {
    partij = txApp.findRecordById("partijen", b.partij);
  } catch (err) {
    return { fout: "Partij niet gevonden." };
  }

  let vanTank = null;
  let naarTank = null;
  if (b.van_tank) {
    try {
      vanTank = txApp.findRecordById("tanks", b.van_tank);
    } catch (err) {
      return { fout: "Van-tank niet gevonden." };
    }
  }
  if (b.naar_tank) {
    try {
      naarTank = txApp.findRecordById("tanks", b.naar_tank);
    } catch (err) {
      return { fout: "Naar-tank niet gevonden." };
    }
  }

  // welke acties bewegen volume in welke richting?
  const uitBron = ["overhevelen", "aftappen", "botteling", "verlies", "monster"].includes(b.actie);
  const naarDoel = ["vullen", "overhevelen"].includes(b.actie);

  if (b.actie === "overhevelen" && (!vanTank || !naarTank))
    return { fout: "Overhevelen vereist een van-tank én een naar-tank." };
  if (b.actie === "vullen" && !naarTank) return { fout: "Vullen vereist een naar-tank." };
  if (uitBron && b.actie !== "overhevelen" && !vanTank)
    return { fout: 'Actie "' + b.actie + '" vereist een van-tank.' };

  // Regel 4 — reiniging/defect blokkeert elke beweging
  const tanksBetrokken = [vanTank, naarTank];
  for (let i = 0; i < tanksBetrokken.length; i++) {
    const t = tanksBetrokken[i];
    if (t && (t.getString("status") === "reiniging" || t.getString("status") === "defect")) {
      return {
        fout:
          "Tank " +
          t.getString("code") +
          ' staat op "' +
          t.getString("status") +
          '" — geen boekingen mogelijk.',
      };
    }
  }

  // Regel 3 — bronvolume-continuïteit ("systeem toont X, jij boekt Y")
  if (vanTank && uitBron && volume > 0) {
    const inBron = vanTank.getFloat("huidig_volume_l");
    if (volume > inBron) {
      return {
        fout:
          "Volume klopt niet: het systeem toont " +
          inBron +
          " L in tank " +
          vanTank.getString("code") +
          ", jij boekt " +
          volume +
          " L. Controleer de tank of boek eerst een correctie.",
      };
    }
    const bronPartij = vanTank.getString("huidige_partij");
    if (bronPartij && bronPartij !== b.partij) {
      return {
        fout:
          "Tank " + vanTank.getString("code") + " bevat een andere partij dan waarvoor je boekt.",
      };
    }
  }

  // Regel 2 — doeltank moet leeg zijn óf dezelfde partij bevatten
  if (naarTank && naarDoel) {
    const doelPartij = naarTank.getString("huidige_partij");
    const doelVolume = naarTank.getFloat("huidig_volume_l");
    if (doelPartij && doelPartij !== b.partij && doelVolume > 0) {
      return {
        fout:
          "Tank " +
          naarTank.getString("code") +
          " is niet leeg (bevat een andere partij). Verplaats of verwerk eerst die inhoud.",
      };
    }
    // Regel 1 — capaciteit
    const capaciteit = naarTank.getFloat("capaciteit_l");
    if (capaciteit > 0 && doelVolume + volume > capaciteit) {
      return {
        fout:
          "Tank " +
          naarTank.getString("code") +
          " kan dit niet hebben: huidig " +
          doelVolume +
          " L + " +
          volume +
          " L erbij > capaciteit " +
          capaciteit +
          " L.",
      };
    }
  }

  // Validatie geslaagd — nu pas schrijven.
  const col = txApp.findCollectionByNameOrId("tankboek");
  const regel = new Record(col);
  regel.set("datum", b.datum);
  regel.set("tijd", b.tijd || "");
  regel.set("partij", b.partij);
  regel.set("producent", b.producent || partij.getString("producent") || "");
  regel.set("actie", b.actie);
  regel.set("van_tank", b.van_tank || "");
  regel.set("naar_tank", b.naar_tank || "");
  regel.set("volume_l", volume);
  regel.set("middel", b.middel || "");
  regel.set("dosering", b.dosering || "");
  regel.set("verantwoordelijke", b.verantwoordelijke);
  regel.set("corrigeert", b.corrigeert || "");
  regel.set("notitie", b.notitie || "");
  regel.set("vineyard_id", b.vineyard_id || "");
  txApp.save(regel);

  // Tankcaches bijwerken (regel 4: status volgt volume)
  if (vanTank && uitBron && volume > 0) {
    const nieuw = Math.max(0, vanTank.getFloat("huidig_volume_l") - volume);
    vanTank.set("huidig_volume_l", nieuw);
    if (nieuw <= 0) {
      vanTank.set("huidige_partij", "");
      vanTank.set("status", "leeg");
    } else {
      vanTank.set("status", "in_gebruik");
    }
    txApp.save(vanTank);
  }
  if (naarTank && naarDoel && volume > 0) {
    const nieuw = naarTank.getFloat("huidig_volume_l") + volume;
    naarTank.set("huidig_volume_l", nieuw);
    naarTank.set("huidige_partij", b.partij);
    naarTank.set("status", "in_gebruik");
    txApp.save(naarTank);
  }

  return { waarschuwing: waarschuwing, regelId: regel.id };
}

/**
 * Fase 4 (Botteling & Voorraad, zie DECISIONS-FASE4.md): één bottelronde ->
 * drie samenhangende records atomisch (tankboekregel + bottelrondes +
 * voorraad_flessen). Hergebruikt voerBoekingUit() voor de tankboekregel
 * (geen aparte "botteling"-validatietak nodig, zie discrepantie 1) zodat de
 * server-endpoint (kelder.pb.js) en de bevestigde AI-agent-actie
 * (agent_uitvoering.js) exact dezelfde logica delen i.p.v. hem te dupliceren.
 * Retourneert { fout } (nog niets geschreven) of { waarschuwing,
 * bottelrondeId, voorraadId }. Gooit zelf nooit (transactiegrens-regel).
 */
function voerBottelrondeUit(txApp, b) {
  if (!b.partij) return { fout: "partij is verplicht" };
  if (!b.van_tank) return { fout: "van_tank is verplicht" };
  const aantalFlessen = Number(b.aantal_flessen);
  const flesinhoudMl = Number(b.flesinhoud_ml);
  if (!aantalFlessen || aantalFlessen <= 0) return { fout: "aantal_flessen moet positief zijn" };
  if (!flesinhoudMl || flesinhoudMl <= 0) return { fout: "flesinhoud_ml moet positief zijn" };
  const volumeL = (aantalFlessen * flesinhoudMl) / 1000;

  const resultaat = voerBoekingUit(txApp, {
    datum: b.botteldatum,
    partij: b.partij,
    producent: b.producent,
    actie: "botteling",
    van_tank: b.van_tank,
    volume_l: volumeL,
    verantwoordelijke: b.ingevoerd_door || "onbekend",
    notitie: `Bottelronde: ${aantalFlessen} x ${flesinhoudMl} ml`,
    vineyard_id: b.vineyard_id,
  });
  if (resultaat.fout) return { fout: resultaat.fout };

  const partijRecord = txApp.findRecordById("partijen", b.partij);

  const bcol = txApp.findCollectionByNameOrId("bottelrondes");
  const bottelronde = new Record(bcol);
  bottelronde.set("partij", b.partij);
  if (b.producent) bottelronde.set("producent", b.producent);
  bottelronde.set("van_tank", b.van_tank);
  bottelronde.set("botteldatum", b.botteldatum);
  bottelronde.set("aantal_flessen", aantalFlessen);
  bottelronde.set("flesinhoud_ml", flesinhoudMl);
  bottelronde.set("flestype", b.flestype || "");
  bottelronde.set("kleur_fles", b.kleur_fles || "");
  bottelronde.set("parelwijn", !!b.parelwijn);
  bottelronde.set("lotnummer", b.lotnummer || partijRecord.getString("lotnummer") || "");
  if (b.voedingswaarde_berekening)
    bottelronde.set("voedingswaarde_berekening", b.voedingswaarde_berekening);
  bottelronde.set("notities", b.notities || "");
  bottelronde.set("ingevoerd_door", b.ingevoerd_door || "onbekend");
  bottelronde.set("vineyard_id", b.vineyard_id || "");
  txApp.save(bottelronde);

  const vcol = txApp.findCollectionByNameOrId("voorraad_flessen");
  const voorraad = new Record(vcol);
  voorraad.set("bottelronde", bottelronde.id);
  voorraad.set("partij", b.partij);
  if (b.producent) voorraad.set("producent", b.producent);
  voorraad.set("wijnnaam", b.wijnnaam || partijRecord.getString("naam"));
  voorraad.set("jaargang", b.jaargang || partijRecord.getFloat("jaargang"));
  voorraad.set("aantal_beginvoorraad", aantalFlessen);
  voorraad.set("aantal_huidig", aantalFlessen);
  voorraad.set("locatie", b.locatie || "");
  voorraad.set("status", "op_voorraad");
  voorraad.set("vineyard_id", b.vineyard_id || "");
  txApp.save(voorraad);

  return {
    waarschuwing: resultaat.waarschuwing || "",
    bottelrondeId: bottelronde.id,
    voorraadId: voorraad.id,
  };
}

module.exports = { leesbareFout, voerBoekingUit, voerBottelrondeUit };
