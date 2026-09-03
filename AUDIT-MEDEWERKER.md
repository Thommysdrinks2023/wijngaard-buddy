# Audit als nieuwe medewerker — De Tappenmars Buddy

Fase 19, uitgevoerd 2026-09-02/03. Rol: nieuwe medewerker, eerste werkweek, geen voorkennis van de code — alleen een telefoon en een link.

**Status van dit document: alle zeven dagscenario's zijn behandeld** (Dag 2, 3, 5, 6 en 7 fysiek in de browser doorlopen met testdata die daarna weer is opgeruimd en geverifieerd; Dag 1 en 4 via gerichte codecontrole). Deze sessie heeft Blok 0 (voorbereiding) volledig gedaan, gevolgd door reparatie waar nodig. Elke bevinding hieronder is in de code aangewezen, waar praktisch mogelijk in de browser gereproduceerd, gerepareerd, getest (unit + Playwright) en gecommit. Wat nog niet is gedaan (de bewust-fouten-maken-lijst, de volledige toegankelijkheidsvalidatie) staat in sectie 6.

## 1. Oordeel in vijf regels

Grotendeels ja, met één belangrijke uitzondering. Twee bevindingen waren in staat een nieuwe medewerker daadwerkelijk vast te laten lopen zonder dat hij begreep waarom: een compleet onbereikbare jaarafsluiting (foutmelding verwijst naar een login die niet bestaat) en kelderschermen die bij een wegvallende verbinding een geloofwaardige lege staat tonen in plaats van een storing — op het accijnsscherm zag dat eruit als een kloppende nul-aangifte. Beide zijn gerepareerd, samen met vijf kleinere gaten (bevestiging bij onomkeerbare acties, te kleine raakvlakken, misleidende zoekscope). Alle zeven dagscenario's zijn nu behandeld, de meeste live getest en bevestigd — het kernproces (meten, plukken, koppelen, bottelen, terugvinden tot aan de partij, en de assistent) werkt goed doordacht, met heldere waarschuwingen op de juiste momenten en zelfs een assistent die een foutieve aanname van de gebruiker zelf corrigeerde in plaats van hem klakkeloos over te nemen. De uitzondering: een klant bellen over een specifieke fles kan niet volledig vanuit de app worden opgelost — de keten stopt bij "welke partij", niet bij "welke rijen". Dat, en de vraag wie de tarievenbeheerknoppen op het accijnsscherm mag zien, zijn de twee openstaande, bewust niet zelf genomen beslissingen (sectie 4).

## 2. Per scenario: wat goed ging, wat mis ging, wat gerepareerd is

### Blok 0 — voorbereiding
- `pb_data`-backup vóór start (`wijngaard_backup_20260902_224555.zip`), schema-drift-check schoon (0 verschillen), volledig seizoen geseed (`seed-seizoen.mjs`: 1142 records) + pasteurisatiedata (`seed-pasteurisatie.mjs`: 11 runs), productiebuild (`vite preview`) op 375px getest — niet de ontwikkelbuild.
- Login/rollen uitgezocht (zie CLAUDE.md "Inloggen verwijderd"): de app kent sinds 22 augustus 2026 bewust geen accounts. Dat is zelf geen bevinding — het wordt er een zodra code zich gedraagt alsof rollen nog bestaan. Zie Bevinding 2 en de BESLISSING NODIG-sectie.

### Kelder — connectiviteit (geen apart "dag", maar het eerste dat opviel)
Met de server volledig uitgeschakeld toonden `/kelder/tanks`, `/kelder/partijen`, `/kelder/accijns` en 18 andere online-only schermen hun normale lege staat — "Nog geen tanks.", een volledig nul-accijnsoverzicht — zonder enige foutmelding, 30+ seconden lang reproduceerbaar. Zie Bevinding 1. Gerepareerd op alle 27 betrokken schermen, inclusief twee die in Fase 17/18 zelf gebouwd zijn (`/pasteurisatie/plannen`, `/pasteurisatie/run/nieuw`).

### Kelder — jaarafsluiting
"Sluit [jaar] definitief af" op `/kelder/jaaroverzicht` faalde bij elke poging met "Log in om een jaar af te sluiten" — in een app zonder loginscherm. Zie Bevinding 2. Gerepareerd en in de browser geverifieerd: de knop schrijft nu een echt archiefrecord weg.

### Wijngaard — Brix-meting, Souvignier Gris
Live in de browser getest: rij 6 (Souvignier Gris) → Brix 19,5 ingevoerd → opgeslagen → bevestigd via een rechtstreekse controle in de database (record met de juiste waarde, datum en naam stond er, daarna weer opgeruimd). Het ras dat eerder een blokkerende tikfout had (Fase 11/12) werkt nu correct, ook in deze sessie geverifieerd tot in de database. Geen verkeerd gespelde rasnamen meer gevonden in broncode, scripts of `pb_hooks/` (wel — terecht — in `pb_migrations/`, dat is bewuste geschiedenis en niet aangeraakt).

### Plukdag (Dag 3)
Live getest, geen wijziging nodig. Twee kernvragen expliciet nagelopen:
- **Spuitwachttijd**: een testbespuiting aangemaakt (Kumulus S, 2 dagen geleden, 7 dagen veiligheidstermijn) op rij 6. Bij het selecteren van die rij op /oogst verscheen meteen een duidelijke waarschuwing met middel, datum en exacte vrijgavedatum. Bij het opslaan volgde een expliciete tweede bevestigingsstap ("Druiven die binnen de termijn geplukt zijn, kunnen de wijn onverkoopbaar maken... Ga je door, dan wordt deze bevestiging bij de oogstregistratie vastgelegd") — een zacht blok met een geregistreerd akkoord, geen harde blokkade en geen stille doorgang. Getest tot en met de bevestigingsdialoog, daarna geannuleerd (geen testoogst aangemaakt); testbespuiting nadien verwijderd.
- **Overname samenstelling/startdichtheid**: drie niet-gekoppelde oogstregels geselecteerd -> "Nieuwe partij van 3 regels" -> het formulier op /kelder/partijen/nieuw kwam volledig voorgevuld binnen: samenstelling als percentages per ras, verwachte opbrengst (met vuistregel-kanttekening), startdichtheid in alle drie eenheden (Oechsle/Brix/SG) met de meetperiode waarop die gebaseerd is, en een voorgesteld lotnummer. Niets hoeft overgetypt te worden; alles is nog wel aanpasbaar. Getest tot en met het ingevulde formulier, niet daadwerkelijk aangemaakt (geen testpartij achtergebleven -- geverifieerd).
- **Koppeling overslaan**: bevestigd dat niet-gekoppelde oogstregels niet stil verdwijnen -- het oogstscherm toont ze prominent onder "Nog niet in de kelder" met de expliciete waarschuwing "Zolang dat zo is, kun je van deze kilo's niet terugvinden in welke fles ze terechtkwamen."

### Terugzoeken (Dag 6-kernvraag)
Het globale zoekscherm (`/zoeken`) claimde in zijn ondertitel "Door alle registraties" te zoeken, maar doorzoekt uitsluitend wijngaarddata (rijen, metingen, observaties, fenologie, oogst, gezondheid, werkuren) — geen partijen, tanks, flessen of klanten. Een medewerker die hier een lotnummer of klantnaam intypt na een telefoontje krijgt niets terug, zonder enig signaal dat hij in de verkeerde module zoekt. Gerepareerd: ondertitel gecorrigeerd, scope-hint toegevoegd bij de zoektips en in de lege-resultaten-melding (verwijst naar Kelder/Voorraad).

Grotere, NIET zelf aangepakte vondst hierbij: de partijdetailpagina (`/kelder/partijen/$partijId`) toont nergens uit welke rijen een partij afkomstig is, ook al bestaat die koppeling wel in de data (`oogst.partij` verwijst naar de partij, `oogst.rij` naar de bronrij — vastgelegd via de bestaande "koppel oogst aan partij"-functie uit Fase 13). Er is dus geen scherm dat "lot X → welke rijen" in één oogopslag beantwoordt; dat moet nu via directe databasetoegang. Dit is geen bugfix maar het toevoegen van een nieuwe weergave (een "Herkomst"-sectie die `oogst` filtert op `partij`) — daarom niet zelf gebouwd, zie sectie 4/7.

### Bottelen (Dag 5)
Live getest: partij "Fase7 Testwijn" (tank 3, 95 L) → 100 flessen "wit schroef 0.75 L" (0 op voorraad) + 2 breuk. Bevestigd:
- de tekortwaarschuwing verschijnt correct ("0 stuks, je hebt er 102 nodig") en blokkeert niet;
- het controlescherm toont vooraf expliciet dat de stand naar **-102** gaat — niet stil, gewoon zichtbaar getoond, met de instructie een telcorrectie te boeken;
- het bottelverlies klopt (77 L uit tank − 75 L in flessen = 2 L/2,6%, waarbij de 2 kapotte flessen terecht niet meetellen als "in de fles" maar wel als volume dat de tank verliet);
- de voorraaddetailpagina toont een "HERKOMST"-blok (bottelronde, lotnummer, brontank, partij) — dit bevestigt dat fles→bottelronde→tank→partij WEL traceerbaar is; het stopt bij "partij" (zie de Terugzoeken-bevinding hierboven voor het ontbrekende partij→rijen-stuk).

Alle testrecords (bottelronde, voorraadregel, tankboekregel, twee voorraadmutaties) na afloop verwijderd en de tankcache herberekend; tank 3 staat weer op 95 L. Geen bevinding — dit scherm werkt zoals bedoeld.

### Kelder — overhevelen
Code gelezen, niet los in de browser getest deze sessie (wel indirect: het scherm toont nu de offline-waarschuwing correct). Bevindingen: de weigering bij "meer overhevelen dan er in de tank zit" is een goed leesbare Nederlandse melding met een concreet vervolgstap ("systeem toont X L... boek eerst een correctie"). Geen aanpassing nodig.

### Assistent (Dag 7)
Live getest met een echt gesprek, spreektaal, in stappen zoals in het veld: "rij 12 muscaris ziet er slecht uit gele blaadjes" -> antwoord met concrete vakvragen (bladpatroon, positie, aantal stokken) in plaats van meteen te gokken -> "geel tussen de nerven, onderste bladeren, hele rij, sinds vorige week" -> een agronomisch onderbouwd vervolgvoorstel (Mg-tekort, met een kanttekening over kali/kalkantagonisme) -> "ja leg maar vast, matig, hele rij" -> twee bevestigingskaarten (observatie + bodemobservatie) klaargezet.

Belangrijkste vondst: de assistent CORRIGEERDE mijn eigen foutieve aanname. Ik typte "muscaris" voor rij 12; rij 12 is in werkelijkheid Souvignier Gris. In plaats van dat klakkeloos over te nemen, meldde de assistent expliciet "Let op: het systeem geeft rij 12 aan als Souvignier Gris, niet Muscaris. Klopt dat, of staat er een fout in de perceelkaart?" en nam de discrepantie zichtbaar op in de samenvattingstekst van de bevestigingskaart zelf, zodat je het verschil ziet vóór je bevestigt. Dat is precies het gedrag dat de kernvraag van Dag 7 stelt ("kan de medewerker bevestigen zonder eerst te moeten uitzoeken wat de assistent bedoelt") — hier zelfs sterker: hij beschermt tegen een foute aanname van de gebruiker zelf.

Beide voorstellen afgewezen (niet bevestigd, om geen testdata achter te laten); bevestigd dat afwijzen niets in `observaties`/`bodem_observaties` wegschrijft. Testgesprek en de bijbehorende berichten/acties nadien verwijderd. Geen bevinding — dit is het best doordachte onderdeel van de app dat deze sessie is tegengekomen.

### Doorlopend — dubbeltik/bevestiging bij onomkeerbare acties
Mechanische controle over alle bestanden met een verwijder-/mutate-knop. Twee gaten gevonden en gerepareerd:
- "Concept verwijderen" op `/verkoop` had geen bevestigingsdialoog en geen dubbeltik-bescherming, terwijl een identieke actie (verweesde klant verwijderen) in hetzelfde bestand beide al had.
- "Definitief verwijderen" in de prullenbak (`/prullenbak`) — de plek die juist bedoeld is als vangnet tegen per-ongeluk-verwijderen — had zelf geen bevestiging voor zijn eigen onomkeerbare actie.

### Toegankelijkheid — raakvlakken
Structurele scan (niet alleen tekstpatroon-grep) over alle knoppen/links in `src/routes` en `src/components`. Acht interactieve elementen zaten onder 44×44px: een verwijderknop, drie actieknoppen op orders, een "Meten"-link op het dashboard, drie hulpknoppen (Excel/Print/Controle-pakket op accijns, Beheer op steekproeven, feedbackknoppen op de assistent, toggles in drie gedeelde componenten). Allemaal naar 44px gebracht — puur een maatwijziging, geen gedragswijziging.

### Rekenwerk en validatie (steekproefsgewijs)
- Lege analysevelden (pH/SO₂ leeglaten): al correct opgelost vóór deze sessie via een expliciet `gemeten_velden`-mechanisme dat "niet gemeten" onderscheidt van "gemeten als 0" — geverifieerd in zowel de invoer- als de weergavecode, geen bevinding.
- Datum-in-de-toekomst: een gedeelde validatiehelper (`checkDatum`) wordt door bijna alle invoerformulieren aangeroepen (meting, observatie, fenologie, gezondheid, oogst, werkuur, boeking, analyse, kelderlog, bottelronde, voorraadmutatie) — brede, consistente dekking, geen bevinding.
- Negatieve/ongeldige getallen: NaN- en `<0`-checks aanwezig in de gedeelde validatielaag voor de gecontroleerde velden (kg, uren, volume, aantal). Geen bevinding op de steekproef die is gedaan.
- Terminologie: uitputtende grep op "producent", "Thomas Drinks" en spellingsvarianten van "Souvignier Gris" over `src/`, `scripts/`, `pocketbase/pb_hooks/`, `docs/` — niets gevonden buiten bewuste geschiedenis in `pb_migrations/` en documentatie die de oude fout juist uitlegt.

## 3. Alle reparaties (chronologisch, met commit)

| # | Wat was er mis | Wat is er veranderd | Commit |
|---|---|---|---|
| 1 | Offline gaf zich uit voor een lege staat op 7 kernschermen (tanks, partijen, accijns, kelderindex, tankboek, voorraad, verkoop) — geen foutmelding, wel 0-waarden | Nieuwe `OfflineWaarschuwing`-component (`role="alert"`), tooltip van de verbindingsbadge gecorrigeerd | `34112c2` |
| 2 | Acht interactieve elementen onder 44×44px | Naar `h-11`/`w-11` gebracht, geen gedragswijziging | `f423376` |
| 3 | Zelfde offline-probleem op 20 aanvullende schermen, waaronder `/pasteurisatie/plannen` en `/pasteurisatie/run/nieuw` (zelf gebouwd in Fase 17/18) en `/kelder/jaaroverzicht` | `OfflineWaarschuwing` ook daar ingebouwd | `ee0fe7d` |
| 4 | "Concept verwijderen" op `/verkoop`: geen bevestiging, geen dubbeltik-bescherming | `confirm()` + `disabled` toegevoegd, gelijkgetrokken met de andere verwijderknop in hetzelfde bestand | `fd9491a` |
| 5 | "Definitief verwijderen" in de prullenbak: geen bevestiging voor een onomkeerbare actie | `confirm()` toegevoegd | `1cc14a6` |
| 6 | Jaarafsluiting (`/kelder/jaaroverzicht`) faalde altijd met een verwijzing naar een niet-bestaand loginscherm; wijngaardconfig synchroniseerde stil niet meer naar de server | Beide `authStore.isValid`-checks (dood sinds het verwijderen van inloggen) vervangen door een verbindingscheck | `b477b56` |
| 7 | `/zoeken` claimde "door alle registraties" te zoeken, maar dekt alleen wijngaarddata — geen signaal dat kelder/verkoop niet doorzocht wordt | Ondertitel gecorrigeerd, scope-hint bij zoektips en lege-resultaten-melding | `b80851c` |

Elke reparatie: typecheck schoon, lint schoon, 219 unit tests groen, 6 Playwright-rooktests groen, waar praktisch ook handmatig geverifieerd in de browser (met de server bewust uitgeschakeld voor de offline-bevindingen, met een echte databaseschrijving gecontroleerd voor de jaarafsluiting).

## 4. BESLISSING NODIG

**Tarievenbeheer en het controle-pakket (ZIP) op `/kelder/accijns` zijn voor niemand meer bereikbaar.**

`kelder.accijns.tsx` verbergt beide functies achter `isBeheerder = (getPb()?.authStore.record?.["rol"]) === "beheerder"`. Sinds het verwijderen van inloggen is `authStore.record` nooit gevuld, dus `isBeheerder` is voor iedereen altijd `false` — inclusief Thomas zelf. Gevolg: de accijnstarieven kunnen via de interface niet meer bijgewerkt worden (het scherm blijft daardoor permanent op "tarief nog niet geverifieerd" staan, ook als de tarieven feitelijk kloppen), en het controle-pakket voor een Douane-/NVWA-controle kan niet meer gegenereerd worden.

Belangrijk voor de afweging: dit is **geen** actief beveiligd gat. Server-side staat dit al voor iedereen open (`archief`-achtige collecties gebruiken hetzelfde `AUTH_RULE = OPEN_RULE`-patroon; `kelder_logica.js`'s `rolVan()` geeft bij ontbrekende auth al `"beheerder"` terug voor de kelderendpoints). De check op `/kelder/accijns` is dus een geïsoleerd, client-side-only restant dat een functie verbergt die de server al toestaat.

**Mijn advies**: verwijder de `isBeheerder`-check op dit scherm net zoals elders na het verwijderen van rollen is gebeurd — dat verandert geen serverrechten, alleen zichtbaarheid van twee knoppen die anders nooit meer werken. Ik heb dit niet zelf gedaan omdat het randgeval "wie mag tarieven wijzigen" wél een echte bedrijfsregel-vraag is, ook al is het technische risico van het antwoord klein.

**Geen "herkomst"-weergave op de partijdetailpagina — lot terugvoeren naar rijen kan niet vanuit de interface.**

Zoals beschreven onder "Terugzoeken" in sectie 2: de koppeling oogst→partij→rij bestaat in de data (elke `oogst`-regel heeft zowel een `rij`- als een `partij`-veld, en de bestaande "koppel oogst aan partij"-functie legt dat verband al vast bij het aanmaken van een partij uit een pluk). Er is alleen nergens een scherm dat deze koppeling in omgekeerde richting toont: "dit lot komt uit welke rijen". Bij een klantvraag over een specifieke fles is dat nu niet vanuit de app te beantwoorden.

**Mijn advies**: een kleine "Herkomst"-sectie op `/kelder/partijen/$partijId` die `oogst` filtert op `partij = deze partij` en de gevonden rijen/rassen/data toont (vergelijkbaar met hoe de partijdetailpagina al andere gerelateerde gegevens toont). Dit is bewust niet zelf gebouwd: het is een nieuwe weergave, geen reparatie van iets dat eerder wél werkte — en de opdracht voor deze fase sluit nieuwe functionaliteit expliciet uit.

## 5. Wat een medewerker niet zelf zou snappen (insiderkennis die nodig was)

- Dat `authStore.isValid`/`authStore.record` überhaupt nog ergens in de code voorkomt terwijl er nergens een inlogscherm is — dat vergt kennis van de geschiedenis (CLAUDE.md "Inloggen verwijderd") om te beseffen dat dit dode restanten zijn, niet een verborgen inlogpad. Een medewerker zou bij de jaarafsluiting-fout hoogstwaarschijnlijk denken dat hij iets fout doet, niet dat de app kapot is.
- Dat een geloofwaardige "0" op het accijnsscherm iets heel anders kan betekenen dan een echte nul-aangifte — zonder de `OfflineWaarschuwing` was dit onderscheid nergens te zien.
- Dat `pb_migrations/*.js` bewust de oude spelfout "Souveginier Gris" bevat en dat dat geen bug is — dat staat alleen in CLAUDE.md, niet in de UI.

## 6. Wat nog niet is opgelost, en waarom

Dit is de eerlijke lijst van wat de opdracht vroeg en wat deze sessie niet heeft gehaald:

- **Dag 3 (plukdag), Dag 5 (bottelen) en Dag 7 (assistent) zijn live getest** (zie sectie 2) — geen bevindingen, alle drie werken goed doordacht. **Dag 6 (traceerbaarheidsketen fles→lot→partij→tank→rij) is voor het fles→...→partij-deel live bevestigd** (via de "HERKOMST"-sectie op de voorraaddetailpagina, zie de bottelen-test); het partij→rijen-deel bestaat niet in de UI (zie BESLISSING NODIG).
- **De bewust-fouten-maken-lijst** (verbinding wegnemen midden in een handeling op een formulier, browser-terugknop halverwege, F5 op een detailscherm, half invullen en wegnavigeren) is niet stuk voor stuk uitgevoerd — alleen de dubbeltik- en offline-detectiepatronen zijn systematisch gecontroleerd.
- **De 81 kandidaten uit de geautomatiseerde toegankelijkheidsscan** (icoon-only-knoppen zonder zichtbare tekst) zijn niet één voor één met de hand nagelopen; een steekproef liet een hoog percentage valse positieven zien (tekst die door de scanner niet herkend werd, niet echt ontbrekende labels), dus verder handmatig doorlopen is nodig vóór dit een betrouwbare lijst is.
- **De 22 resterende plekken met hardcoded Tailwind-kleuren buiten de pasteurisatiesectie** (bijv. `text-green-600` i.p.v. het `text-success`-token) zijn geïnventariseerd maar niet gerepareerd — dit is een consistentie-kwestie, geen gevonden bug (kleur werd overal gecombineerd met tekst/icoon, dus geen "kleur als enige drager"-overtreding).
- **AI-gestuurde bevindingen uit een geautomatiseerde subagent-vloot** (opgestart, twee keer onderbroken door sessielimieten) hebben geen bruikbare, geverifieerde resultaten opgeleverd deze sessie — al het bovenstaande komt uit handmatig lezen, grep-sweeps en browsertests.

## 7. Aanbevelingen

**Vóór het seizoen (kritiek, klein)**
- Beslissing nemen over de `isBeheerder`-check op `/kelder/accijns` (sectie 4) — 15 minuten werk zodra de beslissing er is.
- De "Herkomst"-sectie bouwen (sectie 4) zodra Thomas akkoord is — dit is de kernbelofte van het tankboek/lotnummersysteem en staat nu op "geen"; een klant die belt over een fles kan vandaag niet vanuit de app beantwoord worden. Geschat: 2-3 uur (query + weergave; de onderliggende koppeling bestaat al).

**Tijdens het seizoen (belangrijk, niet dringend)**
- De 81 toegankelijkheidskandidaten met de hand doorlopen en de echte gevallen repareren. Geschat: 2 uur (grotendeels validatie, weinig reparatie verwacht).
- De bewust-fouten-maken-lijst (F5, terugknop, dubbele verbindingswisseling) doorlopen op de belangrijkste formulieren (meting, oogst, overhevelen, bottelen). Geschat: 2-3 uur.

**Later (opschonen, geen risico)**
- De 22 resterende hardcoded-kleur-plekken naar design-tokens, voor consistentie met de rest van de app. Geschat: 1 uur.
- Onderzoeken of er nog meer "authStore"-achtige dode restanten uit de inlog-periode in minder voor de hand liggende plekken zitten (deze sessie doorzocht `src/` en `pocketbase/pb_hooks/` uitputtend op de exacte patronen `.isValid` en `authStore.record`/`authStore.model`, maar een functioneel equivalent restant met een andere naam zou gemist kunnen zijn). Geschat: 1 uur, lage verwachte opbrengst na de grondige sweep van deze sessie.
