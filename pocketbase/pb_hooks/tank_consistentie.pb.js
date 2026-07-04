/// <reference path="../pb_data/types.d.ts" />

// Blok D — nachtelijke consistentiecheck (ARCHITECTURE.md §7.1, "grootste risico":
// de tankinhoud-cache loopt uit de pas met het tankboek). Draait elke nacht om
// 03:00, reconstrueert het verwachte volume per tank uit de volledige
// tankboek-historie (zelfde categorisering als voerBoekingUit() in
// kelder_logica.js en de tanks-herbereken-reconstructie in kelder.pb.js — bij
// een wijziging aan die twee moet dit bestand meeveranderen) en vergelijkt dat
// met de gecachte tanks.huidig_volume_l. Schrijft zelf NIETS weg (dat blijft
// het bestaande /api/tappenmars/tanks-herbereken-endpoint) — dit is puur een
// signaal in de PocketBase-logs (GET /api/logs met een superuser-token) zodat
// een afwijking niet wekenlang onopgemerkt blijft.
//
// Bewust geen top-level helperfuncties in dit bestand (PocketBase-JSVM-
// eigenaardigheid, zie CLAUDE.md): alles staat inline in de cron-callback.
cronAdd("tank_consistentie_check", "0 3 * * *", () => {
  const tanks = $app.findRecordsByFilter("tanks", "id != ''", "code", 500, 0);
  const regels = $app.findRecordsByFilter("tankboek", "id != ''", "datum,tijd,created", 100000, 0);

  const perTank = {};
  for (let i = 0; i < regels.length; i++) {
    const regel = regels[i];
    const vol = regel.getFloat("volume_l");
    const actie = regel.getString("actie");
    const van = regel.getString("van_tank");
    const naar = regel.getString("naar_tank");
    const uitBron =
      ["overhevelen", "aftappen", "botteling", "verlies", "monster"].includes(actie) ||
      (actie === "correctie" && !!van);
    const naarDoel = ["vullen", "overhevelen"].includes(actie) || (actie === "correctie" && !!naar);
    if (van && uitBron) perTank[van] = (perTank[van] || 0) - vol;
    if (naar && naarDoel) perTank[naar] = (perTank[naar] || 0) + vol;
  }

  let afwijkingen = 0;
  for (let i = 0; i < tanks.length; i++) {
    const tank = tanks[i];
    const verwacht = Math.max(0, Math.round((perTank[tank.id] || 0) * 100) / 100);
    const werkelijk = tank.getFloat("huidig_volume_l");
    if (Math.abs(verwacht - werkelijk) > 0.1) {
      afwijkingen++;
      $app
        .logger()
        .warn(
          "tank-consistentiecheck: cache wijkt af van tankboek",
          "tank_code",
          tank.getString("code"),
          "cache_l",
          werkelijk,
          "verwacht_uit_tankboek_l",
          verwacht,
        );
    }
  }

  if (afwijkingen === 0) {
    $app
      .logger()
      .info("tank-consistentiecheck: geen afwijkingen", "tanks_gecontroleerd", tanks.length);
  } else {
    $app
      .logger()
      .warn(
        "tank-consistentiecheck: afwijkingen gevonden — draai /api/tappenmars/tanks-herbereken of onderzoek eerst de oorzaak",
        "aantal_afwijkingen",
        afwijkingen,
      );
  }
});
