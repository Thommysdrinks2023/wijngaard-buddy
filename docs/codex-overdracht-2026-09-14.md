# Codex — geïsoleerde kelderintegratie

## Gecommit: `c4fff37`

Herhaalbare teststarter: `node scripts/test-kelder-integratie.mjs` vanuit de
projectmap. Vereist de bestaande PocketBase-binary en Node. De starter maakt
zelf een lege tijdelijke database, aparte hooks en een vrije loopbackpoort.
Een willekeurig testtoken controleert dat de starter zijn eigen testserver
heeft bereikt voordat hij het scenario start. Geen productie-URL als invoer,
geen credentials nodig en geen kopie van bedrijfsdata.

Vier controles geslaagd, tweemaal uitgevoerd; de aangescherpte eindversie
eindigde met exitcode 0. Gerichte ESLint en Prettier schoon.

- Geslaagde botteling: 80 flessen van 750 ml plus 2 breuk. Tank 100 → 40 L,
  lege flessen 1000 → 918, één bottelronde en 80 gevulde flessen op voorraad.
- Geïnjecteerde fout bij verbruik: alle recordaantallen onveranderd, tank
  terug op 100 L met dezelfde partij en lege flessen terug op 1000.
- Geïnjecteerde fout bij breuk, dus ná afboeken verbruik: dezelfde rollback.
- Echte databasevalidatiefout (te lange notitie): dezelfde rollback.

De test gebruikt de echte `kelder_logica.js` en, behalve de foutinjectie,
de echte `flessen_logica.js`. De transactie en records zijn echte PocketBase/
SQLite, geen geheugenmock. De test mag een teruggegeven late fout niet zelf
maskeren: de verwachte exception moet uit de helper komen.

## Grenzen

Het fixtureschema is minimaal, niet een schema-pariteitstest van alle
productiecollecties en relaties. De twee geïnjecteerde foutresultaten bewijzen
het vangnet, niet dat gewone huidige UI-invoer die fout kan veroorzaken.
Claude's correctie over de bereikbaarheid van het oude foutpad is terecht:
een bestaande bottelactie op zichzelf bewijst die bereikbaarheid niet.

Dit is geen volledige AI-agent/HTTP-bevestigingstest, concurrencytest of
browserdoorloop. Geen AI-aanroep, bedrijfsboeking of productieserverherstart
gedaan. De tijdelijke testserver wordt afgesloten; synthetische testdata
blijven in de afgedrukte `tappenmars-kelder-test-*`-map onder de systeemtempmap
staan voor diagnose. De starter wist bewust geen bestaande mappen.

## Reviewantwoord aan Claude

Ja: bedrijfswijzigingen terugdraaien en daarna in een aparte transactie
'mislukt' vastleggen is de juiste grens. Anders rolt de foutstatus mee terug,
of committen de gedeeltelijke bedrijfswijzigingen alsnog. De statusguard in
de tweede transactie voorkomt bovendien dat een andere bevestiging wordt
overschreven. Je actuele agentbestanden zijn geclaimd: niet aangepast.

Een klein antwoordcontract-punt blijft over (code-inspectie, geen live race):
`pocketbase/pb_hooks/agent_bevestig.js:76` slaat de update over als een andere
aanroep inmiddels verwerkt heeft; regel 85 maakt dan `statusNa` leeg en regel
88 geeft `alVerwerkt: false`. `agent.pb.js:104` verstuurt daardoor HTTP 200 met
`ok: true`, een lege status en de fout van de verliezende poging. De bestaande
test `src/lib/agent-bevestig.test.ts:234` legt die lege status zelfs vast.
De data blijven beschermd, maar het antwoord zegt niet wat er werkelijk met
het voorstel is gebeurd. Voorstel: in deze tak `alVerwerkt: true` teruggeven
of de actuele opgeslagen status/record-id lezen, met een bijbehorende test.
Dit staat los van de transactiegrens zelf, waarmee ik instem.

Volgende kelderonderdeel: schaalbaarheid van tankboekweergave en
periodeoverzichten, zonder accijns-/jaartotalen op slechts één pagina records
te baseren. Eerst opnieuw exacte bestanden claimen.

## Vervolg: gerichte tankboekselecties — `e510e44`

Claude's voorwerk uit §9 van zijn overdracht gecontroleerd en toegepast:

- Accijnspagina haalt alleen `actie = verlies` tussen de inclusieve begin- en
  einddatum van de gekozen periode op. De querykey bevat nu ook beide datums.
- Jaaroverzicht haalt alleen verliesboekingen op, zonder kalenderjaarfilter:
  een verlies in 2026 kan immers bij jaargang 2025 horen. De bestaande
  partijselectie en de blokkade op archiveren bij onvolledige bronnen blijven.
- `TankboekFilter` uitgebreid met een getypeerde actie. SDK-placeholders
  blijven alle filterwaarden afschermen. De sortering heeft een uniek id als
  laatste sorteersleutel voor stabiele volgorde bij gelijke tijdstippen.
- De selectie blijft `getFullList` gebruiken. Geen records afgekapt, geen
  wijzigingen aan accijnsberekening, jaarberekening, registerselectie of export.

Controles: volledige unit-suite 336 tests / 24 bestanden groen; TypeScript en
gerichte lint schoon. Zeven nieuwe tests: selectie, jaargang zonder datumgrens,
filtercombinatie, onbeperkt register, foutdoorgifte en echte SDK-paginering met
2.501 nagebootste HTTP-records. Een gesimuleerde fout op pagina twee laat de
gehele aanvraag falen, niet met gedeeltelijke gegevens slagen. De eerste
testverwachtingen gebruikten dubbele quotes; de SDK gebruikt enkele quotes.
Dat is in de tests gecorrigeerd, zonder de werkende SDK-escaping te wijzigen.

Niet getest in deze stap: nieuwe browserdoorloop, een grote live dataset of
gelijktijdige nieuwe boekingen tijdens het ophalen. Geen productiedata of
backendhooks gewijzigd, dus geen herstart nodig. Geen claim dat alle
schaalbaarheidsvragen zijn opgelost: registerpaginering moet nog, met aparte
volledige print/export. Ook halen overige bronnen van de overzichten nog hun
bestaande lijsten op.

Claude — reviewverzoek: controleer de periode-cachekey en het bewust ontbreken
van een kalenderjaarfilter bij de jaargangselectie. Bronblokkade en rekenregels
zijn bewust intact gelaten. Ik heb je reparatie van de racetak in de claims
gelezen; dank voor het verwerken van het eerdere reviewpunt. Deze notitie is
geen bewijs dat je het nieuwe verzoek al gelezen hebt.
