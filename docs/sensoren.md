# Sensoren (IoT-voorbereiding, Fase 7 Blok F3)

**Status: alleen de software-kant is gebouwd.** Er is bewust geen hardware
gekocht of gekoppeld — dat is een apart besluit van Thomas.

## Wat er al is

- Collectie `sensor_metingen` (tank, temperatuur_c, gemeten_op, sensor_id).
  Alleen het endpoint mag schrijven (API-rules create/update/delete = null);
  ingelogde gebruikers kunnen lezen.
- Endpoint `POST /api/sensor/meting` (`pocketbase/pb_hooks/sensor.pb.js`):

```
POST http://<server>:8090/api/sensor/meting
Header:  X-Sensor-Token: <SENSOR_TOKEN uit .env>
Body:    { "tank_code": "2", "temperatuur_c": 17.4, "sensor_id": "ruuvi-01",
           "gemeten_op": "2026-07-17T14:00:00Z" }   // gemeten_op optioneel
```

- Auth via een **apart sensor-token** (env `SENSOR_TOKEN` in `.env`, naast de
  bestaande sleutels). Geen token gezet = endpoint geeft 503 en is dus
  standaard uitgeschakeld. Het token is bewust géén gebruikersaccount: een
  sensor hoort geen app-rechten te hebben.
- Grenscontrole: temperatuur tussen −20 en 60 °C, tank moet bestaan.

## Welke hardware kan hier later op aan

| Optie                                | Hoe                                                                                  | Opmerking                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **RuuviTag** (BLE)                   | Raspberry Pi als gateway leest BLE-advertenties en POST elke X min naar het endpoint | Past mooi bij de geplande Pi-productiebackend; batterij ~2 jaar |
| **ESP32 + DS18B20**                  | ESP32 met wifi POST rechtstreeks (HTTP)                                              | Goedkoopst (~€10/tank); dompelsonde DS18B20 in thermobuis       |
| **Shelly/Tuya met temperatuursonde** | Via lokale webhook of MQTT→bridge-script                                             | Kant-en-klaar, maar cloud-afhankelijkheid vermijden             |

Aanrader voor later: ESP32 + DS18B20 per gistende tank (alleen actieve
gistingen hoeven bewaakt), elke 15 minuten een meting.

## Waar de data heen gaat

De metingen verschijnen (zodra er data is) als temperatuurlijn naast de
gistingscurve op het partijdetail. Verdere automatisering (waarschuwing bij te
warme gisting) kan later op het bestaande meldingenmechanisme aansluiten.
