// Alleen foutinjectie; alle overige mutaties gebruiken de echte productiehelper.
module.exports = {
  huidigeStand: (app, id) => require(`${__hooks}/flessen_echt.js`).huidigeStand(app, id),
  voerMutatieUit: (app, b) => {
    const type = app.findRecordById("flestypes", b.flestype);
    if (type.getString("test_fout") === b.mutatie_type)
      return { fout: "Geïnjecteerde fout: " + b.mutatie_type };
    return require(`${__hooks}/flessen_echt.js`).voerMutatieUit(app, b);
  },
};
