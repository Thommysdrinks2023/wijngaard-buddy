// Fase 7 Blok F3 — IoT-voorbereiding (alleen software, geen hardware).
// Generiek endpoint voor temperatuursensoren; auth via een apart sensor-token
// (env SENSOR_TOKEN in .env). Geen token gezet = endpoint uitgeschakeld.
// Zie docs/sensoren.md voor de hardware-opties (RuuviTag/ESP32) en het
// aanroepformat.

routerAdd("POST", "/api/sensor/meting", (e) => {
  const verwachtToken = $os.getenv("SENSOR_TOKEN");
  if (!verwachtToken) {
    throw new ApiError(503, "Sensor-endpoint is uitgeschakeld (geen SENSOR_TOKEN in .env).", {});
  }
  const geleverd = e.request.header.get("X-Sensor-Token") || "";
  if (geleverd !== verwachtToken) {
    throw new ApiError(401, "Ongeldig sensor-token.", {});
  }

  // NB: 0.1 (niet 0 of 0.0) — goja maakt van een "hele" literal een int64-veld
  // en dan weigert bindBody decimale temperaturen ("cannot unmarshal 17.4").
  const b = new DynamicModel({ tank_code: "", temperatuur_c: 0.1, sensor_id: "", gemeten_op: "" });
  e.bindBody(b);

  if (!b.tank_code) throw new BadRequestError("tank_code is verplicht.");
  const temperatuur = Number(b.temperatuur_c);
  if (isNaN(temperatuur) || temperatuur < -20 || temperatuur > 60) {
    throw new BadRequestError("temperatuur_c moet een getal tussen -20 en 60 zijn.");
  }

  let tank;
  try {
    tank = e.app.findFirstRecordByFilter("tanks", "code = {:c}", { c: String(b.tank_code) });
  } catch (err) {
    throw new BadRequestError("Geen tank met code " + b.tank_code + ".");
  }

  const col = e.app.findCollectionByNameOrId("sensor_metingen");
  const rec = new Record(col);
  rec.set("tank", tank.id);
  rec.set("temperatuur_c", temperatuur);
  rec.set("gemeten_op", b.gemeten_op || new Date().toISOString());
  if (b.sensor_id) rec.set("sensor_id", String(b.sensor_id));
  e.app.save(rec);

  return e.json(200, { ok: true, id: rec.id, tank: tank.getString("code") });
});
