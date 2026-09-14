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
  return { ok: true, geslaagd };
}
module.exports = { run };
