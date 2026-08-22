# Sensoren (IoT-voorbereiding, Fase 7 Blok F3 + Fase 14)

**Status: alleen de software-kant is gebouwd.** Er is bewust geen hardware
gekocht of gekoppeld — dat is een apart besluit van Thomas. Fase 14
generaliseerde het schema van "alleen temperatuur op een tank" naar elk
sensortype op elke bron, zodat de eerste échte sensor straks alleen nog hoeft
aan te sluiten op iets dat al werkt.

## Wat er is

- Collectie `sensor_metingen`: `type` (temperatuur/co2/gewicht/dichtheid/
  overig — uitbreidbaar zonder schemamigratie), `waarde`, `eenheid`,
  `bron_type` (tank/kelder/overig), `bron_id`, `sensor_id`, `gemeten_op`
  (door de sensor opgegeven), `ontvangen_op` (automatisch, wanneer de server
  het ontving). De oude velden `tank`/`temperatuur_c`/`gemeten_op` bestaan nog
  (niet-required, niet leidend) voor bestaande data uit Fase 7.
  Alleen het endpoint mag schrijven (API-rules create/update/delete = null);
  ingelogde gebruikers kunnen lezen.
- Endpoint `POST /api/sensor/meting` (`pocketbase/pb_hooks/sensor.pb.js`):

```
POST http://<server>:8090/api/sensor/meting
Header:  X-Sensor-Token: <SENSOR_TOKEN uit .env>
Body:    {
  "type": "temperatuur",           // temperatuur | co2 | gewicht | dichtheid | overig
  "waarde": 17.4,
  "eenheid": "°C",                 // optioneel, vrije tekst
  "bron_type": "tank",             // tank | kelder | overig
  "tank_code": "3",                // gemak bij bron_type=tank: leesbare code i.p.v. record-id
  "sensor_id": "ruuvi-01",         // optioneel
  "gemeten_op": "2026-07-17T14:00:00Z"   // optioneel, anders ontvangen_op
}
```

  Bij `bron_type` `kelder` of `overig` is `bron_id` vrije tekst (bijv.
  `"ruimte-1"`) — er is geen collectie om tegen te valideren.

- Auth via een **apart sensor-token** (env `SENSOR_TOKEN` in `.env`, naast de
  bestaande sleutels). Geen token gezet = endpoint geeft 503 en is dus
  standaard uitgeschakeld. Het token is bewust géén gebruikersaccount: een
  sensor hoort geen app-rechten te hebben.
- Grenscontrole per type (`GRENZEN` in `sensor.pb.js`): temperatuur −20..60°C,
  co2 0..50000 ppm, gewicht 0..5000 kg, dichtheid 0..200 °Oe. Type "overig"
  krijgt bewust geen grens — het is per definitie onbekend wat een toekomstig
  sensortype plausibel maakt.
- **Tag-opzoek** (RFID/NFC): `tanks.nfc_tag` (uniek, optioneel) +
  `GET /api/tappenmars/tank-bij-tag?tag=...` (normale gebruikersauth, geen
  sensor-token — dit is voor een mens die met de telefoon scant, niet voor
  onbemande hardware). `partijen.nfc_tag` bestaat ook al, voor toekomstige
  bottelronde-scanning.
- **Gistingsprogramma**: `partijen.temperatuur_programma`, zie
  `ARCHITECTURE.md` §8.3 en `src/lib/temperatuurprogramma.ts`.
- **Sensor-alerts**: `sensor_alerts`, zie `ARCHITECTURE.md` §8.4. Nog geen
  drempelregels — alleen het pad, getest met een handmatig record.

## Welke hardware kan hier later op aan

Bewust geen keuze gemaakt (leverancier/protocol-neutraal) — de tabel hieronder
is illustratief, niet een besluit:

| Optie                                | Hoe                                                                                  | Opmerking                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **RuuviTag** (BLE)                   | Raspberry Pi als gateway leest BLE-advertenties en POST elke X min naar het endpoint | Past mooi bij de geplande Pi-productiebackend; batterij ~2 jaar |
| **ESP32 + DS18B20**                  | ESP32 met wifi POST rechtstreeks (HTTP)                                              | Goedkoopst (~€10/tank); dompelsonde DS18B20 in thermobuis       |
| **Shelly/Tuya met temperatuursonde** | Via lokale webhook of MQTT→bridge-script                                             | Kant-en-klaar, maar cloud-afhankelijkheid vermijden             |
| **NFC/RFID-tags op tanks**           | Elk merk dat een tekstwaarde kan opslaan/uitlezen (Mifare, NTAG, ...)                | `tanks.nfc_tag` is gewoon tekst — geen chipkeuze vastgelegd     |

Aanrader voor later: ESP32 + DS18B20 per gistende tank (alleen actieve
gistingen hoeven bewaakt), elke 15 minuten een meting.

## Waar de data heen gaat

Temperatuurmetingen verschijnen als lijn naast de gistingscurve op het
partijdetail, samen met het gistingsprogramma (indien ingesteld) als
vergelijkingslijn. Verdere automatisering (een signaal bij een te warme
gisting) is een logische Fase 15-uitbreiding zodra er echte sensordata binnen-
komt om een zinnige drempel op te baseren — het datamodel (`sensor_alerts`,
de naamconventie in `ARCHITECTURE.md` §8.4) staat er al klaar voor.

## Eerste échte sensor aansluiten — stappen

1. Kies hardware (bovenstaande tabel is een startpunt, geen verplichting).
2. Vul `SENSOR_TOKEN` in `.env` in als dat nog niet gebeurd is.
3. Configureer de sensor/gateway om elke meting te POSTen naar
   `/api/sensor/meting` met het juiste `type`, `waarde` en `bron_type`/
   `tank_code` (of `bron_id`).
4. Klaar — de meting verschijnt automatisch op de gistingscurve van de partij
   in die tank, zonder verdere codewijziging.
5. Wil je een NFC-tag op de tank: vul `tanks.nfc_tag` in via het tankdetail-
   scherm (of rechtstreeks in de database) en scan hem via de app.
