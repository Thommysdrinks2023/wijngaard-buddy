# Hardware in de kelder — brainstorm & opzet

Verkennend document (21 augustus 2026). Nog geen besluit, nog geen aankoop.
Doel: wat kunnen we met fysieke apparatuur toevoegen aan De Tappenmars Buddy
zodat kelderwerk makkelijker en sneller gaat én de wijn beter wordt?

Vertrekpunt: `POST /api/sensor/meting` + collectie `sensor_metingen` bestaan al
(zie `docs/sensoren.md`). Er hangt alleen nog geen hardware aan.

---

## Het grondprincipe

De app weet nu alleen wat Thomas intikt. Elke meting die niet wordt ingevoerd,
bestaat niet. Hardware verandert dat op drie manieren, in oplopende waarde:

1. **Meten wat nu niet gemeten wordt** (temperatuur 's nachts, CO2 in de ruimte)
2. **Invoerwerk laten verdwijnen** (de meting schrijft zichzelf weg)
3. **De app iets laten dóén** (koeling aan, alarm, verwarmingsmatje)

Stap 3 is waar de kwaliteitswinst zit, maar stap 1 en 2 moeten eerst
betrouwbaar draaien. Een aansturing die op onbetrouwbare data reageert is
gevaarlijker dan geen aansturing.

---

## Laag 0 — De basis: een echte kelderserver

Nu draait PocketBase op de Windows-laptop. Voor hardware is dat het verkeerde
fundament: sensoren moeten 24/7 kunnen inleveren, ook als de laptop dicht is.

**Raspberry Pi 5 in de schuur/kelder** (al gepland in `ARCHITECTURE.md`) wordt
dan dubbel nuttig: backend én sensor-gateway (Bluetooth-ontvanger, MQTT-broker).
Kosten ~€120 incl. SSD en behuizing.

**Planning: de Pi komt pas in november/december (winter)**, dus dit is niet het
startpunt. De periode tot dan is bedoeld om concepten en losse sensoren te
bouwen en uit te proberen — zie "Wat kan al vóór de Pi" hieronder — en om
gedurende het seizoen te rapporteren wat er in de praktijk nodig blijkt.

> Let op: zodra de Pi er is, is dit ook het moment waarop het inloggen terug
> moet (zie CLAUDE.md, "Inloggen verwijderd") én rate-limiting op het
> agent-endpoint. De Pi hangt aan het netwerk, niet meer aan `127.0.0.1`.

### Wat kan al vóór de Pi (nu, op de laptop)

De laptop draait PocketBase nu al lokaal en het endpoint `/api/sensor/meting`
bestaat al. Een enkele proefsonde kan dus vandaag al testen zonder op de Pi te
wachten:

- ESP32 verbindt met dezelfde wifi als de laptop, POST't naar
  `http://<laptop-ip>:8090/api/sensor/meting`
- Werkt alleen zolang de laptop aan staat en op het netwerk hangt — geen
  probleem voor een proef van een paar dagen tijdens een gisting, wél een
  reden om niet blijvend zo te draaien
- Precies genoeg om laag 1 (meten) en laag 2 (iSpindel/weegcel) dit seizoen te
  valideren, terwijl laag 3 (automatisch schakelen) wacht tot de Pi er is —
  regelen op een laptop die 's avonds dichtklapt is toch geen optie

---

## Laag 1 — Meten (laaghangend fruit)

### 1a. Tanktemperatuur per gistende tank

Het klassieke begin, en meteen het meest waardevolle. Gisting is een
temperatuurproces: te warm = aroma's weg en risico op stinkers, te koud =
stagnatie (waar de app nu al op signaleert, maar zonder te weten waaróm).

- **ESP32 + DS18B20-dompelsonde in een thermobuis**, ~€12 per tank
- Meting elke 5–15 min naar het bestaande endpoint
- Alleen op tanks die actief gisten — 4 à 6 sondes is genoeg, verplaatsbaar

**Wat de app ermee doet:** temperatuurlijn onder de gistingscurve op het
partijdetail; melding "tank 12 loopt boven 24 °C"; de agent kan het citeren
("de stagnatie viel samen met een val naar 11 °C in de nacht van dinsdag").

### 1b. CO2-melder in de kelder — dit is een veiligheidsding

Tijdens de hoofdgisting produceert een tank van 1000 L honderden liters CO2.
CO2 is zwaarder dan lucht, zakt naar de vloer en is reukloos. Wijnmakers
overlijden hieraan, elk jaar weer, meestal bij het bukken over een put of het
inklimmen van een tank.

- **NDIR CO2-sensor** (SCD41 op ESP32, ~€35) of een gecertificeerde
  vaste melder (~€250)
- Twee stuks: één op ~30 cm hoogte, één op ademhoogte
- Sirene lokaal **plus** pushmelding in de app

Mijn nadrukkelijke aanbeveling: als er maar één hardware-ding komt, laat het
deze zijn. De andere ideeën maken de wijn beter; deze houdt de wijnmaker in
leven. En hij is meteen een bruikbare procesmeter: de CO2-curve in de ruimte
is een gratis tweede gistingsindicator.

### 1c. Omgeving: temperatuur + luchtvochtigheid van de kelder zelf

Goedkoop (~€20), maar het verklaart veel. Rijping op vat, schimmelrisico, en de
vraag "waarom gaan die twee tanks anders dan de rest?" Één sensor per kelderzone.

### 1d. Deur- en luikcontacten

Reed-contact van €3. Vertelt de app wanneer de keldertoegang openstond — de
verklaring voor een temperatuursprong, en de bewaking van "iemand is beneden"
in combinatie met de CO2-melder.

---

## Laag 2 — Invoerwerk laten verdwijnen

### 2a. Weegplateau onder de tank

Volume is nu een boekhoudkundig getal: de app rekent uit wat er zou moeten
staan, en Thomas corrigeert. Een weegcel meet wat er écht staat.

- Vier weegcellen + HX711 onder een tank op een pallet, ~€60
- Bij overhevelen ziet de app het volume dalen en stijgen; de bestaande
  "systeem toont X L, jij boekt Y L"-validatie krijgt een echte tegenhanger
- **Verliezenboekhouding (Fase 7) wordt hiermee automatisch**: verdamping,
  droesemverlies, morsen — allemaal zichtbaar zonder handmatige schatting

Out-of-the-box gedacht: het gewichtsverloop tijdens gisting is óók een
gistingscurve. Suiker → alcohol + CO2, en die CO2 ontsnapt. Een tank die gist
wordt lichter, elke dag, in een voorspelbaar tempo. Je meet dan de gisting
zonder ooit het deksel te openen of een monster te trekken. Dat is precies het
soort meting waar `gisting-verwachting.ts` op wacht.

### 2b. Digitale dichtheidsmeter met uitlezing

Een Anton Paar DMA 35 (duur, ~€2500) of een goedkopere Bluetooth-refractometer
kan zijn meting direct naar de app sturen in plaats van via overtikken. Overweeg
alleen als het overtikken echt een knelpunt of foutbron blijkt.

### 2c. Drijvende gistingssensor in de tank

Een Tilt of iSpindel (~€30 zelfbouw): drijft in de most, meet dichtheid via
kantelhoek plus temperatuur, zendt via Bluetooth. Gisting wordt daarmee
**continu** gevolgd in plaats van één keer per dag.

Dit is de meest directe kwaliteitswinst van de hele lijst: stagnatie wordt uren
in plaats van een dag later zichtbaar, en het exacte moment voor afsteken of
stoppen is precies te raken.

### 2d. Barcodescanner bij botteling

Bij botteling en verkoop is de flessentelling nu handwerk. Een goedkope
scanner (~€30) op de Pi maakt van "welke partij zit in deze doos" een tik.

### 2e. RFID voor tank/partij-identificatie

De app heeft al QR-printvellen (`/kelder/qr`) om een tank te herkennen — RFID
lost een net iets ander probleem op dan QR, en het is de moeite waard om het
verschil scherp te hebben voordat je kiest.

**Waarin RFID QR verslaat:**
- **Geen zicht/richting nodig.** Een QR-code moet je met de camera recht
  aankijken; een RFID-tag lees je met een lezer die in de buurt komt (tot
  enkele cm–meters, afhankelijk van het type), ook als het label vies,
  bevroren of half afgescheurd is — realistischer voor een kelderomgeving met
  vocht en gemorste most.
- **Geen telefoon nodig.** Een vaste lezer bij de tankrij of een handlezer kan
  automatisch loggen "deze tank is nu actief bekeken/bewerkt" zonder dat
  iemand een app hoeft te openen. Dat sluit direct aan op antwoord 4 hierboven
  (metingen worden soms niet of te laat genoteerd) — het scannen zélf kan de
  eerste regel van een handeling worden, ook als de rest van de invoer later
  volgt.
- **Kan continu/passief.** Een vaste lezer bij elke koelplek kan detecteren
  wélke tank er staat zonder dat iemand iets doet — een RFID-tag aan de tank
  zelf (niet aan de vloeistof) plus een vaste lezer per koelpositie herkent
  automatisch een verplaatsing of wissel.

**Waarin QR wint (en waarom het al gekozen is):** geen extra hardware nodig
(elke telefoon kan een QR-code lezen), geen leesapparaat om te kopen of te
bedraden, en het printvel bestaat al. RFID kost per tag ~€0,30–1 (passief) en
een lezer ~€15–40 (RC522, simpel; NFC op de telefoon zelf kan ook, zonder
losse lezer) — laag qua materiaal, maar wél een extra apparaat erbij.

**Voorstel:** niet i.p.v. QR, maar ernaast, en klein beginnen. NFC-tags
(passief, ~€0,50/stuk, leesbaar met de telefoon zelf via NFC — geen aparte
lezer nodig) op de 10 tanks plakken, gekoppeld aan hetzelfde `tanks`-record
als de QR-code nu. Dat is vrijwel gratis om te proberen naast fase A (de
proefsonde) en vraagt geen aparte lezer-hardware — precies waar "zelfbouw,
laag budget" om vraagt. Een vaste RFID-lezer per koelplek (voor volautomatisch
herkennen zonder dat iemand een telefoon erbij pakt) is een logische
vervolgstap, maar hoort qua opzet bij laag 3 (het "de app laat het zelf
gebeuren"-niveau) en dus eerder bij de Pi-fase dan bij dit seizoen.

---

## Laag 3 — De app laten dóén (regelen)

Hier gaat de app van dagboek naar kelderbeheerder.

### 3a. Slimme stekker op koeling/verwarming per tank

Verwarmingsmatje of koelmantel op een **Shelly Plus 1** (~€20, lokaal
bestuurbaar zonder cloud). De Pi vergelijkt gemeten tanktemperatuur met een
setpoint per partij en schakelt.

Belangrijk ontwerpprincipe: **de regeling draait op de Pi, niet in de browser.**
Als de app of het netwerk uitvalt moet de regeling doorlopen, en bij twijfel
uitschakelen (fail-safe). Elke schakelactie wordt een regel in de kelderlog, met
reden — dan blijft het traceerbaar en verklaarbaar.

### 3b. Gistingsprogramma per partij

De echte outside-the-box stap: een **temperatuurcurve** in plaats van één getal.
"Muscaris: eerste 48 uur 14 °C, dan geleidelijk naar 18 °C, laatste 5 Brix terug
naar 16 °C." Dat is precies hoe een professionele wijnkelder werkt, en het is
puur software bovenop 1a + 3a.

Elk seizoen kan het programma bijgesteld worden op basis van wat de proefnotities
zeggen. Dan begint de app iets te doen dat een mens niet volhoudt: elk jaar
consequent en meetbaar leren van het vorige jaar.

### 3c. Automatische remontage bij rode wijn

Een pomp op een geschakelde stekker, op tijdschema of temperatuurgestuurd.
Regent en Pinot Noir hebben tijdens de schilgisting meerdere keren per dag een
overpomping nodig — dat is precies het werk dat 's nachts niet gebeurt.

Wél voorzichtig: een pomp die onbeheerd draait kan overlopen. Alleen doen met
een niveau- of lekbewaking erbij en een harde tijdlimiet.

### 3d. Camera op de tankrij

Een Pi-camera die elk uur een foto maakt. Twee toepassingen:

- **tijdlapse van de gisting** (schuimkraag, kleur) — leuk én diagnostisch
- de app heeft al foto-analyse via de agent; die kan naar schuimvorming,
  lekkage of het niveau in het kijkglas kijken

### 3e. E-ink kaartje aan elke tank

Een klein e-inkschermpje (~€25) op elke actieve tank dat partij, volume, Brix en
laatste actie toont, gevoed uit de app. Geen krijtbord meer dat niet klopt.
Combineert met de al bestaande QR-printvellen (`/kelder/qr`): QR om gegevens ín
te voeren, e-ink om ze uit te lezen.

---

## Voorgestelde volgorde

Bijgewerkt op basis van Thomas' antwoorden: budget krap → zelfbouw, Pi pas in
november/december, en er is al koelcapaciteit per tank voor **10 tanks**
(waar eerder 4–6 werd aangehouden).

| Fase  | Wat                                                                | Ruwe kosten     | Waarom hier / wanneer                                                                                       |
| ----- | --------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| **A** | 1 zelfgebouwde ESP32+DS18B20-proefsonde, POST naar de laptop          | ~€12            | **Nu al te doen**, geen Pi nodig. Valideert ontwerp + bestaand endpoint tijdens de gistingen dit seizoen.   |
| **B** | CO2-melder + sirene                                                    | €100–250        | Veiligheid gaat voor, sluit direct aan op "geen toezicht 's nachts". Los van de Pi te installeren.          |
| **C** | Opschalen naar 10× ESP32+DS18B20 (1 per tank) + 1× kelderklimaat      | ~€130           | Zodra proef A goedgekeurd is: kopiëren is goedkoper dan opnieuw ontwerpen. Dekt de volledige koelcapaciteit. |
| **D** | 1–2 drijvende gistingssensoren (iSpindel, zelfbouw)                    | €60–120         | Continue gistingscurve, dicht het "'s nachts geen toezicht"-gat het meest direct.                            |
| **E** | Weegplateau onder één tank (proef)                                     | €60             | Maakt de verliezenboekhouding echt. Eerst één tank als proef, later evt. opschalen.                          |
| **F** | Raspberry Pi als kelderserver (+ inloggen terug, rate-limiting)       | €120            | **Winter (nov/dec).** Fundament voor alles wat 24/7 moet draaien en voor regelen (fase G).                   |
| **G** | Slimme stekkers op de bestaande 10 koelplekken + gistingsprogramma    | ~€200 (10× €20) | Pas ná de Pi, en pas als A–E bewezen betrouwbaar draaien. Dit is de stap van meten naar automatisch regelen. |
| **H** | E-ink tankkaartjes, camera, scanner                                    | €200+           | Comfort en plezier, geen noodzaak.                                                                            |

Fase A t/m E (dit seizoen, vóór de Pi) is samen ruwweg **€360–550**, en dekt —
gezien Thomas' antwoord op knelpunten — precies de twee grootste pijnpunten:
inconsistente/gemiste metingen en gebrek aan toezicht 's nachts.

---

## Technische opzet (in grote lijnen)

```
  sensoren (ESP32 / iSpindel / CO2)
        |  wifi / bluetooth
        v
  Raspberry Pi in de kelder
    - PocketBase  (de app + database, zoals nu)
    - gateway-script (bluetooth -> HTTP), MQTT-broker
    - regelaar-script (leest setpoints, schakelt Shelly's)
        |
        v
  De Tappenmars Buddy (telefoon)  <— push bij alarm
```

Ontwerpregels die ik zou vasthouden:

- **Eén ingang.** Alle hardware praat via HTTP-endpoints met een sensor-token,
  net als het bestaande `/api/sensor/meting`. Geen tweede datapad.
- **De sensor is dom, de server is slim.** Sensoren sturen alleen ruwe metingen.
  Alle logica (grenzen, alarmen, regeling) staat op de Pi, waar we het kunnen
  wijzigen zonder een ladder te pakken.
- **Alles wat de app schakelt, komt in de kelderlog.** Automatisch handelen
  zonder spoor is precies wat een accijnsregister en een wijnmaker niet kunnen
  gebruiken.
- **Alle metingen zijn append-only**, zoals `sensor_metingen` nu al is.
- **Geen cloud-afhankelijkheid.** Alles moet werken als de internetverbinding
  in de schuur wegvalt.
- **Fail-safe bij twijfel**: geen data = verwarming uit, koeling uit, alarm aan.

---

## Antwoorden van Thomas (21 augustus 2026)

1. **Stroom + wifi in de kelder**: aanwezig en zeer stabiel — beter dan
   gemiddelde huiskamer-wifi. Geen belemmering voor wifi-sensoren (ESP32) of
   een vaste Pi-gateway.
2. **Piekbelasting**: max. **10 tanks** kunnen tegelijk koelen/gisten (niet
   allemaal tegelijk in gebruik, maar reken op 10 als bovengrens). Dit stuurt
   het aantal sondes/stekkers in fase C/F hieronder bij, van 4–6 naar 10.
3. Sluit aan op 2 — koelcapaciteit is er al **per tank** (10 stuks), niet
   alleen ruimteklimaat. Dat is precies wat fase F (slimme stekker per tank)
   nodig heeft: de hardware om te schakelen bestaat al, er ontbreekt alleen de
   sensor + regellogica ertussen.
4. **Grootste knelpunt = eigenlijk alles**: metingen zijn soms inconsistent,
   worden niet altijd (op tijd) of goed genoteerd, én er is 's nachts weinig
   tot geen toezicht op de gisting. Dat wijst naar laag 1 (meten) en laag 2
   (invoerwerk laten verdwijnen) als de plekken met de meeste winst — vóór
   laag 3 (automatisch schakelen). Zie ook: geen toezicht 's nachts is precies
   het gat dat de CO2-melder (1b) en continue gistingssensor (2c) dichten.
5. **Budget beperkt** → goedkoopste optie, kant-en-klaar én zelfbouw allebei
   overwegen op kosten én tijd, met de aanname dat we veel samen uitwerken en
   bouwen. Zie de vergelijking hieronder.

### Zelfbouw vs. kant-en-klaar

| | Zelfbouw (ESP32 e.d.) | Kant-en-klaar (RuuviTag/Shelly/Tilt) |
|---|---|---|
| **Kosten per tank** | Laagst: ESP32 + DS18B20 ~€10–12 | Hoger: RuuviTag ~€25–35, Tilt/iSpindel-kant-en-klaar ~€40–60 |
| **Tijdsinvestering** | Hoog eerste keer (bedrading, flashen, 1 script voor alle sondes schrijven), daarna kopiëren = bijna gratis | Laag: uitpakken, koppelen, klaar |
| **Onderhoud** | Zelf te repareren/aan te passen, geen abonnement | Meestal ook geen abonnement (lokaal), maar bij defect vervangen i.p.v. repareren |
| **Past bij 10 tanks?** | Ja — kostenvoordeel schaalt juist mee: 10× €12 = €120 vs. 10× €30 = €300 | Werkt ook, maar bij 10 stuks tikt het prijsverschil harder aan |
| **Risico** | Eén script/basisontwerp maken kost tijd, maar is daarna herbruikbaar over alle 10 tanks — precies het "samen uitwerken" waar je op doelt | Kant-en-klaar kan sneller resultaat geven om mee te proefdraaien voordat er tijd in zelfbouw gaat |

**Advies gegeven het budget en de schaal (10 tanks)**: begin met **1 zelfgebouwde
ESP32+DS18B20-sonde als proef** (een middagje samen, ~€12) om het basisontwerp
en het bestaande endpoint te valideren. Werkt dat naar tevredenheid, dan is
opschalen naar 10 vrijwel alleen een kwestie van hardware kopiëren — het
duurste deel (het ontwerp) is dan al betaald in tijd, niet in geld. Dat scheelt
bij 10 stuks al snel €150–200 t.o.v. kant-en-klaar, tegen een overzichtelijke
tijdsinvestering.
