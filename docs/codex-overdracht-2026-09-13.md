# Codex — kelderoverdracht 13 september 2026

## Vastgelegd en werkverdeling

De vijf kelderbestanden zijn compleet opgenomen in `1414cf7`. Ik heb de
commit en actuele bestanden gecontroleerd: geen inhoud verloren en geen
reden om de gedeelde historie te herschrijven. De tijdelijke `deelsGelukt`-
afhandeling is verwijderd. Overheveling met verlies gebruikt één endpoint
en één servertransactie. Het aparte endpoint voorkomt dat een oude server
het verliesveld stil negeert. Ook datum-, volume- en bottelvalidatie en 29
tests op de echte hooklogica zijn vastgelegd.

De creditsblokkade verhinderde mijn eigen commit nadat ik de vijf paden had
gestaged; dat verklaart waarom ze nog in de gedeelde index stonden.
Voortaan commit ik met expliciete bestandspaden. Geen wijzigingen aan
`.claude/settings.local.json`; die verwijdering is niet van mij.

Kelder blijft mijn prioriteit. Pasteurisatie wacht op hardware. Claims gelden
voor exacte bestanden, niet permanent voor hele domeinen. De browserdoorloop
en optionele Chrome-configuratie horen bij dezelfde controle, maar zijn een
afzonderlijk testonderdeel, vastgelegd in `ce8cd5b`. Met `PLAYWRIGHT_CHANNEL=chrome`
en `PLAYWRIGHT_PORT=4183` bouwt de test een verse productiepreview op een eigen
poort. Er wordt dan geen bestaande preview hergebruikt.

## Controles en beperkingen

- 13 september: volledige unit-suite groen, 22 bestanden / 318 tests.
- TypeScript: geen fouten. Volledige lint: nul fouten, zeven bestaande
  Fast Refresh-waarschuwingen buiten mijn bestanden. Gerichte lint: schoon.
- Verse productiebuild geslaagd; waarschuwingen over grote chunks en
  ongebruikte imports in TanStack-dependencies blijven bestaan.
- De 29 keldertests gebruiken de echte JS-logica met geheugenrecords. Ze
  bewijzen geen SQLite-rollback, concurrency of integratie met live PocketBase.
- De browserdoorloop leest alleen; geen testboekingen in het echte tankboek.
  Eerdere run: 9 geslaagd, 2 mislukt door offline/timeout op dashboard en tanks.
  Hercontrole 13 september: eerst gestopt na drie fouten; PocketBase stond uit.
  De trace bevatte `ERR_CONNECTION_REFUSED` op `/api/health`; directe controle
  bevestigde dit. Na starten: alle elf browsercontroles geslaagd op verse build.
  Dit verklaart de fouten van 13 september, niet automatisch die van 12 september.
- Alle elf testgevallen rapporteerden `ok`, maar de runner bleef daarna bij
  afsluiten hangen zonder eindrapport. Eigen run met Ctrl+C beëindigd (exit 1).
  Dus: elf controles groen, geen volledig succesvol afgesloten E2E-proces.
  Afsluitprobleem van de testomgeving blijft een vervolgpunt.
- PocketBase gestart via de bestaande taak `PocketBase Tappenmars`, zonder
  taakinstellingen te wijzigen; er draaide geen PocketBase-proces. Health 200.
  Nieuw overhevel-endpoint met lege body gecontroleerd: 400, partij verplicht,
  geen boeking. Echte schrijftest/rollbacktest op PocketBase blijft niet gedaan.
- CSV/B14: unit-tests wel, openen in echte Excel niet geverifieerd. Deze
  beperking blijft expliciet staan; geen Excel-compatibiliteit claimen.

## Antwoorden en review volgens §4

1. **Kelderwerk af?** De kern in `1414cf7` en browseruitbreiding in `ce8cd5b`
   zijn afgerond. Live schrijf- en rollbackintegratie blijven apart testwerk.
2. **Paginering tankboek:** akkoord dat onbeperkt ophalen niet schaalt. Niet
   simpelweg `getFullList` vervangen door één pagina: accijns/jaaroverzicht
   zouden dan onvolledig rekenen. Vervolg in kelderdomein: periodefiltering en
   volledige serveraggregatie, los van gepagineerde weergave. Nog niet gebouwd.
3. **B14/Excel:** beperking behouden, zie hierboven.
4. **Werkverdeling:** kelder prioriteit; alleen actuele bestandsclaims blokkeren.
5. **ensureOnline:** de 5s-herkansing is logisch en ik zie geen bewezen
   regressie door die constante. Wel is de formulering 'gedeelde ping' beperkt:
   `src/lib/data.ts:110` deelt alleen aanroepen via `ensureOnline`; directe
   `pingPb()`-aanroepen delen niet mee. Bovendien stopt `Promise.race` op
   `src/lib/data.ts:75` de fetch niet bij timeout. Dit is code-inspectie, geen
   bewijs dat dit de waargenomen browserfout veroorzaakt.

### Review: rollback bij late bottelfout

Codepad, niet live gereproduceerd: `pocketbase/pb_hooks/kelder_logica.js:376`
schrijft de bottelronde, gevolgd door voorraad. Bij een later `{ fout }` van
flessenverbruik/breuk retourneert de helper normaal (regels 430 en 443).
`pocketbase/pb_hooks/agent.pb.js:91` registreert een fout als 'mislukt' en
laat de transactie normaal eindigen. Als deze late fout optreedt, is de
rollbackgarantie dus niet afgedwongen voor de agentaanroep, anders dan bij
het gewone kelderendpoint. De nieuwe overhevel-verliesbranch gooit daarom
wel bij een fout na de eerste write. Voor bottelen: gericht foutinjectietest
toevoegen en dezelfde grens bewaken. Geen claim dat een normale huidige
UI-invoer dit al reproduceert; schema-validatie kan sommige paden eerder stoppen.

### Oneens met zekerheid na herhaalde test

`docs/SAMENWERKING-AGENTS.md:184` concludeert uit een losse geslaagde herhaling
'vrijwel zeker bouwvervuiling — geen regressie'. Dat volgt niet uit die test:
een wisselvallige netwerkfout of timingbug kan hetzelfde patroon geven. De
eerdere trace bevatte onafgeronde healthrequests en offline UI; latere directe
healthrequests waren 200. Voorstel: schrijf 'niet opnieuw gereproduceerd;
oorzaak nog vaststellen' totdat er direct bewijs voor buildvervuiling is.

Deze notitie is een overdracht, geen bewijs dat Claude haar heeft gelezen.

## Vervolg: bottelrollback gerepareerd — `a922c33`

Na Thomas' vervolgopdracht beide late foutpaden met foutinjectie getest.
Vóór de fix: 30 tests groen, twee nieuwe tests rood (geen exception).
Na de fix: alle 32 keldertests groen; volledige suite 321 tests / 22 bestanden.
TypeScript, gerichte ESLint, Prettier en `node --check` zijn schoon.

`voerBottelrondeUit` gooit nu bij een foutresultaat van flessenverbruik of
breuk na eerdere writes. Daarmee bereikt een fout ook via
`agent_uitvoering.js` de transactiegrens: die functie vangt de exception niet.
Vroege validatiefouten blijven gewone foutresultaten zonder writes. Een derde
nieuwe test bewaakt de geslaagde route: 80 gevulde flessen en 2 breuk worden
als afzonderlijke mutaties doorgegeven. De commentaarregel 'gooit nooit' is
gecorrigeerd.

De foutinjectie gebruikt de echte kelderlogica en een nagebootste
flessenhelper; dit is geen echte SQLite-rollbacktest of complete AI-sessie.
Er is niets in het bedrijfstankboek of de voorraad geschreven. Voor een
volgende integratietest een geïsoleerde database gebruiken.

PocketBase via de bestaande taak herstart. De eerste start leverde nog geen
luisterend proces op; opnieuw starten van dezelfde taak herstelde dit.
Daarna `/api/health` 200 ('API is healthy'). Geen taakinstellingen gewijzigd.
De wijziging is geladen; er is geen live schrijfactie gebruikt als test.

Claude's reactie op mijn vorige review gelezen: protocol nu genuanceerd,
health-fetch wordt afgebroken via AbortController. Zijn live overhevelprobes
zijn door hem gerapporteerd in `docs/beveiligingsreview-2026-09-13.md`, niet
door mij opnieuw uitgevoerd. Agent/auth- en pasteurisatiecode ongemoeid gelaten.
