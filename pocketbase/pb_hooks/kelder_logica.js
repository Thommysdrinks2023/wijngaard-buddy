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
  if (b.verlies_l != null) {
    const verlies = Number(b.verlies_l);
    const aangekomen = Number(b.volume_l);
    if (
      b.actie !== "overhevelen" ||
      !Number.isFinite(verlies) ||
      verlies < 0 ||
      !Number.isFinite(aangekomen) ||
      aangekomen < 0 ||
      !Number.isFinite(aangekomen + verlies)
    )
      return {
        fout: "Verlies is alleen toegestaan bij overhevelen en moet een geldig positief volume of nul zijn.",
      };
    let bron;
    try {
      bron = txApp.findRecordById("tanks", b.van_tank);
    } catch {
      return { fout: "Van-tank niet gevonden." };
    }
    if (aangekomen + verlies > bron.getFloat("huidig_volume_l"))
      return { fout: "Aangekomen volume plus verlies is groter dan de inhoud van de brontank." };
    const basis = Object.assign({}, b);
    delete basis.verlies_l;
    delete basis.verlies_type;
    const transfer = voerBoekingUit(txApp, basis);
    if (transfer.fout || verlies === 0) return transfer;
    const verliesregel = voerBoekingUit(
      txApp,
      Object.assign({}, basis, {
        actie: "verlies",
        naar_tank: "",
        volume_l: verlies,
        notitie:
          "Verlies bij overhevelen (" +
          (b.verlies_type || "overig") +
          ")" +
          (b.notitie ? " — " + b.notitie : ""),
      }),
    );
    // Na de eerste write moet een fout gooien: ook aanroepers die een
    // { fout }-resultaat alleen registreren mogen geen halve boeking committen.
    if (verliesregel.fout) throw new Error(verliesregel.fout);
    return Object.assign({}, transfer, { verliesRegelId: verliesregel.regelId });
  }
  if (!b.partij) return { fout: "partij is verplicht" };
  if (!b.actie) return { fout: "actie is verplicht" };
  if (!b.datum || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.datum)))
    return { fout: "datum is verplicht (jjjj-mm-dd)" };
  if (!b.verantwoordelijke) return { fout: "verantwoordelijke is verplicht" };
  const volume = Number(b.volume_l == null ? 0 : b.volume_l);
  if (!Number.isFinite(volume) || volume < 0)
    return { fout: "volume_l moet 0 of positief zijn (richting volgt uit de actie)" };
  const boekingsdatum = new Date(b.datum + "T12:00:00Z");
  if (
    !Number.isFinite(boekingsdatum.getTime()) ||
    boekingsdatum.toISOString().slice(0, 10) !== b.datum
  )
    return { fout: "Boekingsdatum bestaat niet. Controleer dag, maand en jaar." };
  if (b.actie === "overhevelen" && b.van_tank && b.van_tank === b.naar_tank)
    return { fout: "Kies voor overhevelen twee verschillende tanks." };

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

  // Regel D1 (peiling/correctie, ARCHITECTURE.md §7.3) — "correctie" bestond al
  // als actie-waarde maar bewoog vóór deze fix geen enkele liter (stond niet in
  // uitBron/naarDoel hieronder, en dus ook niet in de tanks-herbereken-reconstructie
  // in kelder.pb.js — beide moeten hierop in lijn blijven). Een correctie krijgt nu
  // wél cache-effect, gestuurd door welke van de twee tankvelden is ingevuld:
  // van_tank = naar beneden bijstellen (peiling toont minder dan het systeem),
  // naar_tank = naar boven bijstellen. Nooit allebei of geen van beide.
  if (b.actie === "correctie") {
    if (!b.van_tank && !b.naar_tank)
      return {
        fout: "Correctie vereist een tank: van_tank om naar beneden bij te stellen, naar_tank om naar boven bij te stellen.",
      };
    if (b.van_tank && b.naar_tank)
      return {
        fout: "Correctie kan niet tegelijk van_tank én naar_tank hebben — kies één richting.",
      };
  }

  // welke acties bewegen volume in welke richting?
  const uitBron =
    ["overhevelen", "aftappen", "botteling", "verlies", "monster"].includes(b.actie) ||
    (b.actie === "correctie" && !!b.van_tank);
  const naarDoel =
    ["vullen", "overhevelen"].includes(b.actie) || (b.actie === "correctie" && !!b.naar_tank);

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
    // Een capaciteit van 0 betekent "nog niet ingesteld", niet "onbeperkt".
    // Eerder werd 0 als geen-plafond behandeld, waardoor een fysiek onmogelijk
    // volume in het onwijzigbare tankboek kon belanden (pentest 10 sep. 2026,
    // bevinding 1). Een boeking IN een tank zonder bekende capaciteit wordt nu
    // hard geweigerd — de accijnsbron mag geen ongelimiteerde stand krijgen.
    const capaciteit = naarTank.getFloat("capaciteit_l");
    if (volume > 0 && capaciteit <= 0) {
      return {
        fout:
          "Tank " +
          naarTank.getString("code") +
          " heeft geen capaciteit ingesteld — er kan niets in geboekt worden. Stel eerst de capaciteit van de tank in.",
      };
    }
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
  regel.set("eigenaar", b.eigenaar || partij.getString("eigenaar") || "");
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
 * bottelrondeId, voorraadId }. Fouten na writes gooien voor rollback.
 */
function voerBottelrondeUit(txApp, b) {
  if (!b.partij) return { fout: "partij is verplicht" };
  if (!b.van_tank) return { fout: "van_tank is verplicht" };

  // Fase 15 Blok C — `aantal_flessen_gevuld` is het exacte aantal na
  // bottelverlies en is vanaf nu leidend. `aantal_flessen` blijft de
  // terugval: de agent-actieflow (agent_uitvoering.js) en bestaande
  // integraties sturen nog het oude veld, en die moeten blijven werken.
  const aantalFlessen = Number(
    b.aantal_flessen_gevuld != null && b.aantal_flessen_gevuld !== ""
      ? b.aantal_flessen_gevuld
      : b.aantal_flessen,
  );
  const flesinhoudMl = Number(b.flesinhoud_ml);
  if (!Number.isSafeInteger(aantalFlessen) || aantalFlessen <= 0)
    return { fout: "aantal_flessen moet een positief geheel getal zijn" };
  if (!Number.isFinite(flesinhoudMl) || flesinhoudMl <= 0)
    return { fout: "flesinhoud_ml moet positief en eindig zijn" };
  const breuk = Number(b.flessen_breuk || 0);
  if (!Number.isSafeInteger(breuk) || breuk < 0)
    return { fout: "flessen_breuk moet een geheel getal van nul of meer zijn" };

  // Het gebottelde volume (wat in de flessen zit).
  const gebotteldL = (aantalFlessen * flesinhoudMl) / 1000;
  // Het volume dat werkelijk uit de tank ging. Zonder opgave is dat gelijk
  // aan het gebottelde volume (geen verlies geregistreerd) — het oude
  // gedrag, zodat bestaande aanroepen ongewijzigd blijven werken.
  const volumeUitTankL =
    b.volume_uit_tank_l != null && b.volume_uit_tank_l !== ""
      ? Number(b.volume_uit_tank_l)
      : gebotteldL;
  if (!(volumeUitTankL > 0)) return { fout: "volume_uit_tank_l moet positief zijn" };
  if (volumeUitTankL < gebotteldL)
    return {
      fout:
        "Er kan niet meer gebotteld zijn dan er uit de tank ging: " +
        Math.round(gebotteldL * 100) / 100 +
        " L in flessen versus " +
        volumeUitTankL +
        " L uit de tank.",
    };

  const resultaat = voerBoekingUit(txApp, {
    datum: b.botteldatum,
    partij: b.partij,
    eigenaar: b.eigenaar,
    actie: "botteling",
    van_tank: b.van_tank,
    volume_l: volumeUitTankL,
    verantwoordelijke: b.ingevoerd_door || "onbekend",
    notitie:
      `Bottelronde: ${aantalFlessen} x ${flesinhoudMl} ml` +
      (volumeUitTankL > gebotteldL
        ? ` (bottelverlies ${Math.round((volumeUitTankL - gebotteldL) * 100) / 100} L)`
        : ""),
    vineyard_id: b.vineyard_id,
  });
  if (resultaat.fout) return { fout: resultaat.fout };

  const partijRecord = txApp.findRecordById("partijen", b.partij);

  const bcol = txApp.findCollectionByNameOrId("bottelrondes");
  const bottelronde = new Record(bcol);
  bottelronde.set("partij", b.partij);
  if (b.eigenaar) bottelronde.set("eigenaar", b.eigenaar);
  bottelronde.set("van_tank", b.van_tank);
  bottelronde.set("botteldatum", b.botteldatum);
  bottelronde.set("aantal_flessen", aantalFlessen);
  bottelronde.set("aantal_flessen_gevuld", aantalFlessen);
  bottelronde.set("flessen_breuk", breuk);
  bottelronde.set("volume_uit_tank_l", Math.round(volumeUitTankL * 100) / 100);
  // Accijnsplichtig volume = wat er in de flessen zit. Het belastbare moment
  // is BOTTELING (regelgeving_instellingen: accijns_belastbaar_moment), dus
  // dit getal is meteen definitief: over elke gevulde fles is afgedragen.
  // Breuk telt niet mee — die flessen komen nooit in de handel.
  bottelronde.set("accijnsplichtig_volume_l", Math.round(gebotteldL * 100) / 100);
  if (b.accijns_categorie) bottelronde.set("accijns_categorie", b.accijns_categorie);
  bottelronde.set("flesinhoud_ml", flesinhoudMl);
  if (b.flestype_ref) bottelronde.set("flestype_ref", b.flestype_ref);
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
  if (b.eigenaar) voorraad.set("eigenaar", b.eigenaar);
  voorraad.set("wijnnaam", b.wijnnaam || partijRecord.getString("naam"));
  voorraad.set("jaargang", b.jaargang || partijRecord.getFloat("jaargang"));
  voorraad.set("aantal_beginvoorraad", aantalFlessen);
  voorraad.set("aantal_huidig", aantalFlessen);
  voorraad.set("locatie", b.locatie || "");
  voorraad.set("status", "op_voorraad");
  voorraad.set("vineyard_id", b.vineyard_id || "");
  txApp.save(voorraad);

  // Fase 15 Blok C — de lege-flessenvoorraad afboeken, binnen DEZELFDE
  // transactie: faalt dit, dan rollen de tankboekregel, de bottelronde en
  // het voorraadrecord allemaal mee terug. Geen halve administratie.
  //
  // Alleen als er een flestype gekoppeld is: bestaande aanroepen (agent,
  // oude clients) sturen dat veld niet en mogen niet gaan falen op een
  // voorraad die ze niet kennen.
  let voorraadWaarschuwing = "";
  if (b.flestype_ref) {
    const flessen = require(`${__hooks}/flessen_logica.js`);

    // Waarschuwen, NIET blokkeren (besluit vooraf: de fysieke werkelijkheid
    // wint). Als de administratie minder flessen kent dan er zijn gevuld,
    // klopt de administratie niet — maar de botteling heeft al
    // plaatsgevonden, dus die tegenhouden helpt niemand.
    const standVoor = flessen.huidigeStand(txApp, b.flestype_ref);
    const nodig = aantalFlessen + breuk;
    if (standVoor < nodig) {
      voorraadWaarschuwing =
        "Let op: de flessenvoorraad toont " +
        standVoor +
        " stuks, maar er zijn er " +
        nodig +
        " nodig. De stand komt op " +
        (standVoor - nodig) +
        " — boek een telcorrectie zodra je de werkelijke stand hebt geteld.";
    }

    const verbruik = flessen.voerMutatieUit(txApp, {
      flestype: b.flestype_ref,
      mutatie_type: "verbruik_botteling",
      aantal: -aantalFlessen,
      datum: b.botteldatum,
      bottelronde: bottelronde.id,
      toelichting: `Botteling ${partijRecord.getString("naam")} (${aantalFlessen} flessen)`,
      ingevoerd_door: b.ingevoerd_door,
      vineyard_id: b.vineyard_id,
    });
    // De agent registreert een teruggegeven fout zonder rollback. Na writes
    // moet de fout daarom de transactie verlaten, niet als resultaat terugkomen.
    if (verbruik.fout) throw new Error(verbruik.fout);

    if (breuk > 0) {
      const breukRegel = flessen.voerMutatieUit(txApp, {
        flestype: b.flestype_ref,
        mutatie_type: "breuk",
        aantal: -breuk,
        datum: b.botteldatum,
        bottelronde: bottelronde.id,
        toelichting: `Breuk tijdens botteling ${partijRecord.getString("naam")}`,
        ingevoerd_door: b.ingevoerd_door,
        vineyard_id: b.vineyard_id,
      });
      if (breukRegel.fout) throw new Error(breukRegel.fout);
    }
  }

  const waarschuwingen = [resultaat.waarschuwing || "", voorraadWaarschuwing].filter(Boolean);
  return {
    waarschuwing: waarschuwingen.join(" "),
    bottelrondeId: bottelronde.id,
    voorraadId: voorraad.id,
    bottelverliesL: Math.round((volumeUitTankL - gebotteldL) * 100) / 100,
    gebotteldL: Math.round(gebotteldL * 100) / 100,
  };
}

// ============= Rollen (Eindsprint Blok B) =============
// Superuser telt als beheerder; een leeg rol-veld telt als medewerker
// (least privilege zonder de gewone invoer te blokkeren). Handhaving zit
// hier server-side, niet alleen in de UI.
//
// INLOGGEN WEER VERWIJDERD (besluit Thomas, 22 augustus 2026): er is geen
// ingelogde gebruiker meer, dus `auth` is bij elke aanroep leeg. Zonder
// aanpassing zou rolVan() dan "" teruggeven en eisBeheerder() ALLES
// weigeren — de kelder- en voorraadendpoints zouden onbruikbaar worden.
// Daarom telt "geen auth" weer als beheerder. Geschiedenis: tweede keer
// (eerder 26 juli 2026, op 21 augustus hersteld naar "" bij geen auth, nu
// weer terug naar "beheerder"). Zie CLAUDE.md.
function rolVan(auth) {
  if (!auth) return "beheerder";
  if (typeof auth.isSuperuser === "function" && auth.isSuperuser()) return "beheerder";
  return auth.getString("rol") || "medewerker";
}
// Retourneert null als het mag, anders een nette Nederlandse weigering.
function eisSchrijfrecht(auth) {
  if (rolVan(auth) === "alleen_lezen")
    return "Je account heeft alleen leesrechten — vraag de beheerder om een andere rol.";
  return null;
}
function eisBeheerder(auth, actieNaam) {
  if (rolVan(auth) !== "beheerder") return "Alleen een beheerder mag " + actieNaam + ".";
  return null;
}

module.exports = {
  leesbareFout,
  voerBoekingUit,
  voerBottelrondeUit,
  rolVan,
  eisSchrijfrecht,
  eisBeheerder,
};
