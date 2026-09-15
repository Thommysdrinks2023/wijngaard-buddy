function eis(voorwaarde, melding) {
  if (!voorwaarde) throw new Error(melding);
}

function run(app) {
  // Minimaal fixtureschema, niet het volledige productieschema. Wel echte
  // records, validatie en SQLite-transacties, zonder kopie van bedrijfsdata.
  const schema = {
    partijen: ["naam eigenaar", "jaargang"],
    tanks: ["code huidige_partij status", "capaciteit_l huidig_volume_l"],
    tankboek: ["datum partij actie van_tank naar_tank notitie", "volume_l"],
    kelderlog: ["datum partij tank actie eenheid notitie ingevoerd_door", "hoeveelheid"],
    bottelrondes: ["partij van_tank flestype_ref notities", "aantal_flessen flessen_breuk"],
    voorraad_flessen: ["partij bottelronde status", "aantal_beginvoorraad aantal_huidig"],
    flestypes: ["test_fout", ""],
    flessen_mutaties: ["flestype mutatie_type datum bottelronde toelichting", "aantal"],
  };
  for (const naam of Object.keys(schema)) {
    const fields = [];
    for (const veld of schema[naam][0].split(" ").filter(Boolean))
      fields.push({ name: veld, type: "text", max: veld === "notities" ? 5 : 5000 });
    for (const veld of schema[naam][1].split(" ").filter(Boolean))
      fields.push({ name: veld, type: "number" });
    app.save(new Collection({ name: naam, type: "base", fields }));
  }
  const maak = (col, waarden) => {
    const r = new Record(app.findCollectionByNameOrId(col));
    for (const veld of Object.keys(waarden)) r.set(veld, waarden[veld]);
    app.save(r);
    return r;
  };
  const aantallen = () =>
    Object.keys(schema).map((naam) => app.findRecordsByFilter(naam, "", "", 1000, 0).length);
  const logica = require(`${__hooks}/kelder_logica.js`);
  const geslaagd = [];
  for (const fout of ["", "verbruik_botteling", "breuk", "databasevalidatie"]) {
    const partij = maak("partijen", { naam: "TEST" });
    const bron = maak("tanks", {
      code: "TEST",
      huidige_partij: partij.id,
      status: "in_gebruik",
      capaciteit_l: 500,
      huidig_volume_l: 100,
    });
    const type = maak("flestypes", { test_fout: fout });
    maak("flessen_mutaties", { flestype: type.id, mutatie_type: "ontvangst", aantal: 1000 });
    const voor = JSON.stringify(aantallen());
    let fouttekst = "";
    try {
      app.runInTransaction((tx) => {
        try {
          const r = logica.voerBottelrondeUit(tx, {
            partij: partij.id,
            van_tank: bron.id,
            aantal_flessen: 80,
            flesinhoud_ml: 750,
            flessen_breuk: 2,
            flestype_ref: type.id,
            botteldatum: "2026-01-01",
            ingevoerd_door: "integratietest",
            notities: fout === "databasevalidatie" ? "te lange notitie" : "",
          });
          // De test mag de oude bug niet zelf maskeren door alsnog de
          // fout terug te gooien: de helper moet de late fout zelf gooien.
          if (r.fout)
            throw new Error("Helper retourneerde fout; verwacht een exception uit de helper.");
        } catch (e) {
          fouttekst = String(e);
          throw e;
        }
      });
    } catch (e) {
      if (!fouttekst) throw e;
    }
    const stand = app.findRecordById("tanks", bron.id);
    const flessen = require(`${__hooks}/flessen_echt.js`).huidigeStand(app, type.id);
    if (fout) {
      eis(fouttekst.length > 0, "Verwachte fout ontbreekt: " + fout);
      if (fout !== "databasevalidatie")
        eis(fouttekst.includes("Geïnjecteerde fout: " + fout), fouttekst);
      eis(JSON.stringify(aantallen()) === voor, "Records achtergebleven: " + fout);
      eis(stand.getFloat("huidig_volume_l") === 100, "Tank niet teruggedraaid: " + fout);
      eis(stand.getString("huidige_partij") === partij.id, "Partij gewijzigd: " + fout);
      eis(flessen === 1000, "Lege flessen niet teruggedraaid: " + fout);
    } else {
      eis(!fouttekst, fouttekst);
      eis(stand.getFloat("huidig_volume_l") === 40, "Tankvolume na botteling onjuist");
      eis(flessen === 918, "Verbruik en breuk niet beide geboekt");
      eis(
        app.findRecordsByFilter("bottelrondes", "partij = {:id}", "", 10, 0, { id: partij.id })
          .length === 1,
        "Bottelronde ontbreekt",
      );
      eis(
        app
          .findRecordsByFilter("voorraad_flessen", "partij = {:id}", "", 10, 0, {
            id: partij.id,
          })[0]
          .getFloat("aantal_huidig") === 80,
        "Flessenvoorraad onjuist",
      );
    }
    geslaagd.push(fout ? "rollback: " + fout : "geslaagde botteling met breuk");
  }
  for (const faal of [false, true]) {
    const partij = maak("partijen", { naam: "OVERHEVELTEST" });
    const bron = maak("tanks", {
      code: "BRON",
      huidige_partij: partij.id,
      status: "in_gebruik",
      capaciteit_l: 500,
      huidig_volume_l: 100,
    });
    const doel = maak("tanks", {
      code: "DOEL",
      status: "leeg",
      capaciteit_l: 500,
      huidig_volume_l: 0,
    });
    const voor = JSON.stringify(aantallen());
    let fouttekst = "";
    let geschrevenVoorFout = 0;
    try {
      app.runInTransaction((tx) => {
        try {
          const r = logica.voerBoekingUit(tx, {
            partij: partij.id,
            actie: "overhevelen",
            van_tank: bron.id,
            naar_tank: doel.id,
            volume_l: 40,
            verlies_l: 5,
            verlies_type: "droesem",
            datum: "2026-01-01",
            verantwoordelijke: "integratietest",
            notitie: faal ? "x".repeat(4930) : "Na klaring",
          });
          eis(!r.fout, "Onverwachte validatiefout: " + r.fout);
        } catch (e) {
          geschrevenVoorFout = tx.findRecordsByFilter("tankboek", "partij = {:id}", "", 10, 0, {
            id: partij.id,
          }).length;
          fouttekst = String(e);
          throw e;
        }
      });
    } catch (e) {
      if (!fouttekst) throw e;
    }
    const logs = app.findRecordsByFilter("kelderlog", "partij = {:id}", "", 10, 0, {
      id: partij.id,
    });
    const bronNa = app.findRecordById("tanks", bron.id);
    const doelNa = app.findRecordById("tanks", doel.id);
    if (faal) {
      eis(!!fouttekst, "Werklogvalidatie moest falen");
      eis(geschrevenVoorFout === 2, "Fout moet pas na beide tankboekregels optreden");
      eis(JSON.stringify(aantallen()) === voor, "Halve overheveling achtergebleven");
      eis(bronNa.getFloat("huidig_volume_l") === 100, "Bron niet teruggedraaid");
      eis(doelNa.getFloat("huidig_volume_l") === 0, "Doel niet teruggedraaid");
      eis(doelNa.getString("status") === "leeg", "Doelstatus niet teruggedraaid");
    } else {
      eis(!fouttekst, fouttekst);
      eis(logs.length === 1, "Precies één werklog vereist");
      eis(logs[0].getFloat("hoeveelheid") === 40, "Werklogvolume onjuist");
      eis(logs[0].getString("notitie").includes("Verlies: 5 L"), "Verlies ontbreekt in werklog");
      eis(bronNa.getFloat("huidig_volume_l") === 55, "Bronvolume onjuist");
      eis(doelNa.getFloat("huidig_volume_l") === 40, "Doelvolume onjuist");
    }
    geslaagd.push(
      faal ? "rollback: werklog bij overhevelen" : "overhevelen met verlies en één werklog",
    );
  }
  return { ok: true, geslaagd };
}
module.exports = { run };
