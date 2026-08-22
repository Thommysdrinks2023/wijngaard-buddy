// Fase 7 Blok F3 — IoT-voorbereiding (alleen software, geen hardware).
// Fase 14 Blok A generaliseert dit naar een generiek meting-endpoint: elk
// nieuw sensortype (co2, gewicht, dichtheid, ...) is een waarde toevoegen
// aan de select-lijsten in setup-pocketbase.mjs, geen schemawijziging en geen
// nieuw endpoint. Auth blijft via een apart sensor-token (env SENSOR_TOKEN in
// .env) — een sensor logt nooit in als gebruiker (zie CLAUDE.md/mega-prompt).
// Geen token gezet = endpoint uitgeschakeld. Zie docs/sensoren.md.
//
// JSVM-eigenaardigheid (zie CLAUDE.md): top-level const/function in een
// .pb.js-bestand bestaat NIET in de handler-VM-pool ("SENSOR_TYPES is not
// defined" bij het eerste testen). Daarom staan SENSOR_TYPES/
// SENSOR_BRON_TYPES/GRENZEN hieronder BINNEN de handler zelf.

routerAdd("POST", "/api/sensor/meting", (e) => {
  // Zelfde set als SENSOR_TYPES/SENSOR_BRON_TYPES in setup-pocketbase.mjs.
  // Bewust gedupliceerd (JSVM kan geen .mjs importeren) — bij een nieuw
  // sensortype hier EN daar bijwerken.
  const SENSOR_TYPES = ["temperatuur", "co2", "gewicht", "dichtheid", "overig"];
  const SENSOR_BRON_TYPES = ["tank", "kelder", "overig"];
  // Plausibiliteitsgrenzen per type — zelfde motivatie als meetwaarde.ts: een
  // sensor die een onmogelijke waarde stuurt (kapotte sonde, bit-flip) mag
  // niet stilzwijgend een vervuild datapunt in de gistingscurve zetten.
  // "overig" krijgt bewust geen grens: het type is per definitie onbekend.
  const GRENZEN = {
    temperatuur: { min: -20, max: 60 },
    co2: { min: 0, max: 50000 }, // ppm; buiten is ~400, een afgesloten ruimte kan hoog oplopen
    gewicht: { min: 0, max: 5000 }, // kg — ruim boven een volle IBC
    dichtheid: { min: 0, max: 200 }, // °Oe
  };

  const verwachtToken = $os.getenv("SENSOR_TOKEN");
  if (!verwachtToken) {
    throw new ApiError(503, "Sensor-endpoint is uitgeschakeld (geen SENSOR_TOKEN in .env).", {});
  }
  const geleverd = e.request.header.get("X-Sensor-Token") || "";
  if (geleverd !== verwachtToken) {
    throw new ApiError(401, "Ongeldig sensor-token.", {});
  }

  // NB: 0.1 (niet 0 of 0.0) — goja maakt van een "hele" literal een int64-veld
  // en dan weigert bindBody decimale waarden ("cannot unmarshal 17.4"). Zelfde
  // valkuil als het oude endpoint; blijft gelden voor elk numeriek veld hier.
  const b = new DynamicModel({
    type: "",
    waarde: 0.1,
    eenheid: "",
    bron_type: "",
    bron_id: "",
    tank_code: "", // gemak: bron_type=tank kan met een leesbare code i.p.v. een record-id
    sensor_id: "",
    gemeten_op: "",
  });
  e.bindBody(b);

  const type = String(b.type || "");
  if (!SENSOR_TYPES.includes(type)) {
    throw new BadRequestError(`type moet een van ${SENSOR_TYPES.join(", ")} zijn.`);
  }
  const waarde = Number(b.waarde);
  if (isNaN(waarde)) {
    throw new BadRequestError("waarde is verplicht en moet een getal zijn.");
  }
  const grens = GRENZEN[type];
  if (grens && (waarde < grens.min || waarde > grens.max)) {
    throw new BadRequestError(
      `waarde ${waarde} is niet plausibel voor type "${type}" (verwacht ${grens.min}-${grens.max}).`,
    );
  }

  // bron_type: expliciet, of afgeleid uit tank_code voor het gemak.
  let bronType = String(b.bron_type || "");
  let bronId = String(b.bron_id || "");
  if (!bronType && b.tank_code) bronType = "tank";
  if (!SENSOR_BRON_TYPES.includes(bronType)) {
    throw new BadRequestError(`bron_type moet een van ${SENSOR_BRON_TYPES.join(", ")} zijn.`);
  }

  let tank = null;
  if (bronType === "tank") {
    if (!bronId && !b.tank_code) {
      throw new BadRequestError("bron_type tank vereist bron_id of tank_code.");
    }
    try {
      tank = bronId
        ? e.app.findRecordById("tanks", bronId)
        : e.app.findFirstRecordByFilter("tanks", "code = {:c}", { c: String(b.tank_code) });
    } catch (err) {
      throw new BadRequestError(
        "Tank niet gevonden voor " +
          (bronId ? "bron_id " + bronId : "tank_code " + b.tank_code) +
          ".",
      );
    }
    bronId = tank.id;
  }
  // bron_type kelder/overig: bron_id is vrije tekst (bijv. "ruimte-1"), geen
  // opzoeking nodig — er is (nog) geen collectie om tegen te valideren.

  const col = e.app.findCollectionByNameOrId("sensor_metingen");
  const rec = new Record(col);
  rec.set("type", type);
  rec.set("waarde", waarde);
  if (b.eenheid) rec.set("eenheid", String(b.eenheid));
  rec.set("bron_type", bronType);
  rec.set("bron_id", bronId);
  if (b.sensor_id) rec.set("sensor_id", String(b.sensor_id));
  if (b.gemeten_op) rec.set("gemeten_op", String(b.gemeten_op));
  // Oude vaste velden ook vullen bij type=temperatuur+tank, zodat bestaande
  // lezers (of een query die nog op het oude model filtert) niet stuklopen
  // tijdens de overgang. Nooit vereist, nooit leidend.
  if (type === "temperatuur" && tank) {
    rec.set("tank", tank.id);
    rec.set("temperatuur_c", waarde);
  }
  e.app.save(rec);

  return e.json(200, {
    ok: true,
    id: rec.id,
    type: type,
    bron_type: bronType,
    bron_id: bronId,
  });
});
