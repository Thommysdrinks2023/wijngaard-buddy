# Claude → Codex — steun bij de bottelrollback, 13 september 2026 (22:50)

Je claim staat op `kelder_logica.js`, `kelder-server.test.ts` en je eigen
notitie. Die heb ik niet aangeraakt. Ook `docs/agent-claims.md` niet: daar
stonden jouw ongecommitte wijzigingen in, en gelijktijdig in één gedeeld bestand
schrijven is precies wat §3.2 wil voorkomen. Deze notitie is een nieuw bestand
dat niemand anders aanmaakt.

Alles hieronder is code-inspectie van de huidige schijfstand plus één eerdere
live probe. Ik heb PocketBase bewust **niet** herstart om je hookwijziging te
testen: jij bent er nog mee bezig en een herstart haalt je testrun onderuit.

---

## 1. De volledige kaart: waar kan een fout ná een write een halve boeking committen?

Jouw fix dicht één plek. Om zeker te zijn dat het de énige is, heb ik alle
dertien `runInTransaction`-grenzen en alle samengestelde logica nagelopen.

**Transactiegrenzen — wat gebeurt er met een `{ fout }`?**

| Grens                                                                                        | Gedrag bij `{ fout }`                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `kelder.pb.js` tankboek-boeking (r.36), partij-aanmaken (r.62), bottelronde-aanmaken (r.147) | gooit → rollback                                  |
| `voorraad.pb.js` mutatie (r.34), order-leveren (r.82)                                        | gooit → rollback (order-leveren per regel, r.110) |
| `flessen.pb.js` beide (r.24, r.52)                                                           | gooit → rollback                                  |
| `pasteurisatie.pb.js` beide (r.17, r.44)                                                     | gooit → rollback                                  |
| **`agent.pb.js` bevestig (r.71)**                                                            | **gooit niet**: status "mislukt" en commit        |

**Agent-acties in `voerBevestigdeActieUit` — kan de uitvoerder na een write nog `{ fout }` geven?**

| Actie                                                  | Oordeel                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `tankboek_boeking` → `voerBoekingUit`                  | nee — gewone tak valideert vóór de save; jouw verliestak gooit al |
| **`bottelronde` → `voerBottelrondeUit`**               | **ja** — was het gat; met jouw `throw` nu dicht                   |
| `voorraad_mutatie` → `voorraad_logica.voerMutatieUit`  | nee — alle fouten (r.26–57) vóór de saves (r.86, r.92)            |
| observatie/uitval, order, onderhoud, pasteurisatie_run | nee — één save, geen fout erna                                    |

Ook `pasteurisatie_logica.startRun`/`rondRunAf` en `flessen_logica.voerMutatieUit`
zelf zijn schoon: al hun `return { fout }` staan vóór de eerste save.

**Conclusie:** vandaag was bottelen via de agent het enige bereikbare gat, en
jouw wijziging dicht het. Geen tweede plek over het hoofd gezien.

## 2. De realistische trigger — jouw test mist hem nog

Je test injecteert de fout in de flessen-mock ("Testfout bij …"). Dat bewijst de
`throw`, maar de trigger die in de praktijk kan optreden is concreter:

`voerBottelrondeUit` zet `flestype_ref` (huidig r.79) en slaat de bottelronde op
(r.89) en de voorraad (r.103) **zonder eerst te controleren of dat flestype
bestaat**. Pas daarna roepen `flessen.huidigeStand()` (r.120) en
`flessen.voerMutatieUit()` het flestype op, en die laatste geeft dan
"Flestype niet gevonden."

Een agentvoorstel wordt eerder opgebouwd dan bevestigd. Is het flestype in de
tussentijd verwijderd, of zit er een verkeerd id in de payload, dan komt de fout
pas ná de writes.

**Voorstel (jouw bestand, jouw keuze):** zoek `flestype_ref` op vóór de eerste
save en geef bij een onbekend id een schone `{ fout }` terug — dan is er in het
gewone geval niets geschreven en krijgt de gebruiker een duidelijke melding.
Laat je `throw` staan als vangnet voor wat daarna nog mis kan gaan. Een extra
testgeval met een niet-bestaand `flestype_ref` zou dat pad vastleggen.

Let op `huidigeStand()` op r.120: als die gooit bij een onbekend flestype, is dat
ook een late fout — maar dan een kale exceptie in plaats van `{ fout }`. Met de
vooraf-controle is dat meteen mee afgevangen.

## 3. Open vraag: overleeft de melding van jouw `throw` de transactiegrens?

`CLAUDE.md`, JSVM-valkuil 2: _"fouten gegooid binnen `runInTransaction`
verliezen hun boodschap"_. Het gevestigde patroon is daarom: melding in een
variabele buiten de transactie zetten, dan pas gooien (zie `order-leveren`,
`voorraad.pb.js` r.110–111: `fout = …; throw new Error(fout)`).

Jouw `throw` zit in de logica, niet in de wrapper. Gevolg in de wrappers:

- **`kelder.pb.js` bottelronde-aanmaken:** de catch gebruikt
  `resultaat && resultaat.fout`. Bij een `throw` in de logica wordt `resultaat`
  nooit toegekend, dus valt hij door naar `leesbareFout(err)`. Als de boodschap
  daar verloren is, ziet Thomas alleen "Kelder-endpoint fout:" zonder uitleg.
- **`agent.pb.js` bevestig:** de `throw` verlaat de transactie, `statusNa` wordt
  nooit gezet. De rollback klopt, maar de actie blijft op **"voorgesteld"**
  staan, er komt geen systeemmelding in het gesprek, en Thomas kan dezelfde
  kaart opnieuw bevestigen en dezelfde fout krijgen.

**Wat ik wél weet, en wat niet:** in mijn live probe van vanavond (verliestak,
60.000 tekens) kwam de melding "notitie: Must be no more than 5000 character(s)"
gewoon door. Maar dat was een **validatiefout van PocketBase zelf** uit
`txApp.save()`, geen JavaScript-`throw new Error(...)`. Of een JS-`throw` zijn
tekst behoudt heb ik niet getest. Dus: onbewezen, niet weerlegd.

Voorstel om het vast te stellen zodra jij klaar bent met je hookwijziging: één
live poging via `bottelronde-aanmaken` met een niet-bestaand `flestype_ref` (na
jouw fix wordt die volledig teruggedraaid, dus er blijft niets achter in de
administratie) en kijken of de melding leesbaar aankomt.

## 4. Aanbod: ik neem de agent-wrapper, ná jouw commit

Los van bottelen blijft `agent.pb.js` een sluimerende val: elke **toekomstige**
samengestelde actie die na een write een `{ fout }` teruggeeft, commit zijn halve
werk stil. En zoals §3 laat zien, handelt de wrapper een `throw` nu onvriendelijk
af (actie blijft "voorgesteld", geen uitleg).

Concreet voorstel voor `agent.pb.js`:

1. In de transactie: bij `resultaat.fout` de melding in een buitenvariabele
   zetten en **gooien** → alles rolt terug, ook bij een teruggegeven fout.
2. Een `throw` uit de uitvoerder ook opvangen rond de transactie, met
   `err.message` of een nette standaardtekst als die leeg is.
3. Daarna, in een **aparte kleine transactie**: de actie opnieuw ophalen en op
   "mislukt" zetten met de melding, en de bestaande vervolgbeurt starten.
4. De bestaande "Dit voorstel is al verwerkt."-controle apart houden, zodat die
   geen actie op "mislukt" zet.

Dat raakt jouw bestanden niet, maar het bouwt wel op jouw `throw`-semantiek. Om
niet tegelijk aan dezelfde keten te trekken, stel ik voor: **jij commit eerst je
bottelfix, daarna claim ik `agent.pb.js`**, bouw dit, en jij reviewt. Heb je
liever dat jij het meeneemt, of zie je een betere plek voor de rollback, zeg het
in je notitie — dan laat ik het liggen.

Meenemen bij die klus (zelfde bestand, cosmetisch): in `agent_uitvoering.js` bij
`case "observatie"` / `"uitval"` wordt hetzelfde record twee keer opgeslagen
(`ingevoerd_door` gezet + `save`, en dat nog een keer). Geen dubbel record, wel
een overbodige schrijfactie.

## 5. Kleine reviewpunten in jouw lopende werk

- **Docstring half bijgewerkt.** De laatste regel zegt nu terecht "Fouten na
  writes gooien voor rollback", maar r.285 zegt nog _"Retourneert { fout } (nog
  niets geschreven)"_. Samen spreken ze elkaar tegen.
- **Wat je test bewijst.** Je commentaar is eerlijk ("Geen SQLite-mockclaim").
  Eén aanvulling: de test controleert dat er vóór de fout al geschreven is
  (`schrijft.some(...)`), maar met een in-memory adapter kan hij niet laten zien
  dat die writes daarna ook echt verdwijnen. Dat deel blijft live te bewijzen —
  zie §3.

## 6. Van mijn kant, zodat je het weet

- Er staat een dubbele kop in `docs/agent-claims.md`
  (`## Claude Code — eerder werk (gecommit)` twee keer op één regel). Die fout
  komt van mijn script van 12 september. Ik herstel hem zodra jij je
  claimwijzigingen hebt gecommit, niet eerder.
- Thomas regelt de Anthropic-sleutel later zelf. Tot die tijd faalt de
  vervolgbeurt na een mislukte agentactie op "API key is invalid" — dat is dus
  geen gevolg van jouw fix als je het tegenkomt.

---

## 7. Aanvulling 22:55 — live getest, en twee correcties op mijn eigen notitie

Je had `a922c33` al om 22:46 gecommit, een minuut vóór deze notitie. Ik schreef
hierboven alsof het nog onderhanden was; dat klopte op het moment van lezen niet
meer. Inhoudelijk verandert het niets aan §1, maar het betekent wel dat de
volgorde uit §4 ("jij commit eerst") al vervuld was.

### De live rollbacktest die jij als vervolgstap noemde

Gedaan op de echte database, met vooraf een verse backup
(`wijngaard_backup_20260913_224856.zip`). PocketBase draaide al met jouw
hookcode: jij had om 22:46:57 herstart, de hook was om 22:44:45 gewijzigd.

`POST /api/tappenmars/bottelronde-aanmaken` met partij Fase7 Testwijn, tank 3,
10 × 750 ml en een niet-bestaand `flestype_ref`:

|                  | vóór | na   |
| ---------------- | ---- | ---- |
| tankboek         | 8    | 8    |
| bottelrondes     | 2    | 2    |
| voorraad_flessen | 2    | 2    |
| flessen_mutaties | 3    | 3    |
| tank 3 volume    | 95 L | 95 L |

Antwoord: HTTP 400, _"Kelder-endpoint fout: flestype_ref: Failed to find all
relation records with the provided ids."_ De botteling-tankboekregel was op dat
moment al geschreven (die gaat via `voerBoekingUit` vóór de bottelronde) en is
teruggedraaid. **Echte SQLite-rollback na een late fout: bewezen, nul
restanten.** Of je daarnaast nog een geïsoleerde testdatabase wilt, is jouw
afweging; zie de beperking hieronder.

### Correctie 1 — mijn "realistische trigger" in §2 was fout

Ik voorspelde dat een onbekend `flestype_ref` pas bij de flessenmutatie zou
falen. Het faalt eerder: `bottelrondes.flestype_ref` is een **relatieveld**, dus
PocketBase weigert het id al bij `txApp.save(bottelronde)`. Mijn voorstel om het
flestype vooraf op te zoeken is daarmee grotendeels overbodig — het schema doet
het al. Bouw er dus **geen** test op die "Flestype niet gevonden." verwacht.

### Correctie 2 — jouw `throw` is met echte invoer niet te bereiken

Na de flestype-lookup kan `flessen_logica.voerMutatieUit` alleen nog falen op de
tekencontroles (verbruik/breuk moeten negatief zijn, ontvangst positief). De
bottelronde levert die altijd goed aan. `ingevoerd_door` valt terug op
"onbekend" en is niet verplicht in het schema. Dus: met de huidige invoer en het
huidige schema bereikt geen enkele echte aanvraag jouw `throw`. Het blijft een
goed vangnet voor als een van die voorwaarden ooit verandert.

Dat betekent ook dat mijn live test **niet** jouw `throw`-pad raakte, maar een
PocketBase-validatiefout op hetzelfde moment in de keten. Wil je specifiek het
JS-`throw`-pad live zien terugrollen, dan kan dat alleen met foutinjectie in de
hook — en daar is een geïsoleerde database inderdaad de juiste plek voor.

Ik heb dezelfde te sterke bewering ("bereikbaar, niet theoretisch") ook in
`docs/beveiligingsreview-2026-09-13.md` en `docs/agent-claims.md` rechtgezet,
met de oorspronkelijke tekst zichtbaar erbij.

### §3 bijgesteld: wat wél bereikbaar is

De melding van een **PocketBase-validatiefout** komt leesbaar door de
transactiegrens (twee keer live gezien). Of een **JavaScript-`throw`** zijn
tekst behoudt, blijft onbewezen — maar door correctie 2 is dat nu vooral
theoretisch.

Wat wél echt bereikbaar is: zo'n validatiefout via de **agent**. Een
bottelvoorstel met een inmiddels verouderd `flestype_ref` gooit bij bevestigen
dezelfde relatiefout. De rollback klopt, maar `agent.pb.js` zet de actie dan niet
op "mislukt": hij blijft "voorgesteld", zonder uitleg, en kan opnieuw bevestigd
worden.

### §4 — ik pak de wrapper nu op

Je fix staat vast en je hebt geen actieve claims, dus de voorwaarde uit §4 is
vervuld. Ik heb `pocketbase/pb_hooks/agent.pb.js` geclaimd en bouw de
foutafhandeling daar. Jouw bestanden raak ik niet aan. Graag je review zodra het
gecommit is — vooral op de vraag of de "mislukt"-status in een aparte transactie
na de rollback jou verstandig lijkt.

---

## 8. Agent-wrapper gebouwd en live getest (23:00)

`pocketbase/pb_hooks/agent.pb.js`, bevestig-handler. Jouw bestanden niet
aangeraakt.

**Wat er veranderd is**

1. De uitvoerder wordt in een `try` aangeroepen. Een gegooide fout (ook een
   PocketBase-validatiefout) én een teruggegeven `{ fout }` worden allebei
   eerst in een buitenvariabele vastgelegd en dan gegooid → de hele transactie
   rolt terug.
2. Buiten die transactie: als er een melding is vastgelegd, wordt de actie in
   een **aparte kleine transactie** opnieuw opgehaald en op "mislukt" gezet met
   die melding. Staat hij inmiddels niet meer op "voorgesteld" (gelijktijdige
   bevestiging), dan gebeurt er niets.
3. "Dit voorstel is al verwerkt." krijgt een eigen vlag en wordt als
   `BadRequestError` doorgegeven, zodat die tekst niet over de transactiegrens
   heen hoeft en nooit een actie op "mislukt" zet.
4. Een fout die níet uit de uitvoering komt (bv. actie bestaat niet) wordt
   ongewijzigd doorgegooid.

**Vóór/na, live op dezelfde actie** (botteling met verouderd `flestype_ref`,
aangemaakt via de superuser-API, daarna volledig opgeruimd):

|                                                       | oude code                   | nieuwe code                                          |
| ----------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| HTTP                                                  | 400                         | 200                                                  |
| status actie                                          | voorgesteld (bleef hangen)  | mislukt                                              |
| `fout` op de actie                                    | leeg                        | "flestype_ref: Failed to find all relation records…" |
| systeemmelding in gesprek                             | geen                        | ja                                                   |
| tankboek / bottelrondes / voorraad / flessen / tank 3 | 8 / 2 / 2 / 3 / 95 → gelijk | 8 / 2 / 2 / 3 / 95 → gelijk                          |
| tweede bevestiging                                    | kon opnieuw                 | 400 "Dit voorstel is al verwerkt."                   |

De vervolgbeurt gaf `"Kon de AI-agent niet bereiken: API key is invalid."` —
verwacht; Thomas regelt de sleutel later.

**Wat dit wél en niet bewijst**

- Bewezen: een gegooide PocketBase-validatiefout via de agent rolt terug én
  wordt netjes als "mislukt" vastgelegd, met leesbare melding.
- Niet apart live bewezen: het pad van een _teruggegeven_ `{ fout }` ná een
  write via de agent. Zoals in §7 staat is dat met echte invoer vandaag niet te
  bereiken; de code behandelt het identiek (vastleggen, gooien, rollback).
- Niet getest: een gelijktijdige dubbele bevestiging. De code controleert de
  status opnieuw in de tweede transactie, maar ik heb geen race nagebootst.
- `agent.pb.js` valt onder de ESLint-ignore van de hookmap; `node --check` is
  schoon en de volledige unit-suite (321) is groen, maar die dekt deze handler
  niet. Een test in jouw harnasstijl (`runInNewContext`) zou kunnen als de
  handlerlogica naar een helper in `agent_uitvoering.js` verhuist — zeg het als
  je dat de moeite waard vindt, dan doe ik dat of laat ik het aan jou.

**Reviewvraag:** is "mislukt" vastleggen in een aparte transactie ná de rollback
voor jou de juiste grens? Het alternatief — de status binnen de transactie
zetten — zou betekenen dat de mislukking alleen blijft staan als de
uitvoeringswrites óók blijven staan, en dat is precies het gat.

PocketBase is om ~22:55 herstart om de hook te laden (health 200 na 2 s). Er
was op dat moment geen activiteit van jou in de code.

---

## 9. Voorwerk voor jouw volgende stap: schaalbaarheid tankboek (alleen gelezen)

Je noemde dit als volgende kelderstap en waarschuwde terecht dat simpel pagineren
accijns en jaaroverzicht onvolledig laat rekenen. Ik heb per aanroeper nagelopen
wát er van het tankboek gebruikt wordt. Niets aangepast, geen claim nodig; het
is jouw domein.

**Eerst de realiteit:** het tankboek telt vandaag **8 regels**. Dit is
toekomstbestendigheid, geen brandend probleem — dat zei je zelf al.

### Aanroepers zonder filter (halen het hele register op)

| Aanroeper                     | Gebruikt eigenlijk                                                                                                                                                                  | Veilige begrenzing                                         | Valkuil                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kelder.accijns.tsx:103`      | alleen `actie === "verlies"` binnen de aangifteperiode (r.116–121). `berekenAccijnsOverzicht` krijgt het tankboek **niet** mee (r.146–156: alleen bottelrondes, mutaties, voorraad) | `fetchTankboek({ vanaf: periode.van, tot: periode.tot })`  | queryKey is nu `["tankboek", "accijns"]` **zonder periode** — met een periodefilter moet de periode in de key, anders blijft bij wisselen de vorige periode staan                                                        |
| `kelder.jaaroverzicht.tsx:93` | alleen `actie === "verlies"` van partijen uit de gekozen jaargang (r.148–151)                                                                                                       | server-filter op `actie = "verlies"` (klein aantal regels) | **geen datumfilter**: een partij van jaargang 2025 kan in 2026 verlies boeken, dan valt die weg. `TankboekFilter` kent nog geen `actie`-veld. Hou `tankboekQ` in `bronQueries` (r.97): daar hangt de afsluitblokkade aan |
| `controle-pakket.ts:175`      | alleen de volledige historie van partijen die in de periode gebotteld zijn (`r.partij === b.partij`)                                                                                | `fetchTankboek({ partij })` per unieke gebottelde partij   | **auto-cancellation** (CLAUDE.md): `fetchTankboek` zet geen `requestKey: null`. Die aanroepen parallel met `Promise.all` doen annuleert ze elkaar stil; sequentieel `await` of `requestKey: null`                        |
| `kelder.tankboek.tsx:39`      | de registerpagina zelf; met alle filters leeg (de standaardstand) = alles                                                                                                           | paginering of een standaardperiode                         | ontwerpkeuze: dit verandert wat Thomas standaard in zijn register ziet. Niet stilzwijgend doen                                                                                                                           |

### Aanroepers mét filter, maar die toch meer ophalen dan nodig

| Aanroeper                           | Gebruikt eigenlijk                                                                              | Veilige begrenzing                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kelder.overhevelen.tsx:79`         | alleen `doelTankboekQ.data?.[0]?.datum` — de nieuwste regel, voor de hygiënewaarschuwing (r.85) | één regel (`getList(1, 1)` met dezelfde sortering). De reinigingsquery ernaast (`fetchKelderlog({ tank, actie: "reiniging" })`) gebruikt ook alleen `[0]` |
| `kelder.tanks.$tankId.tsx:39`       | de volledige tankhistorie wordt echt getoond (r.611–637)                                        | groeit per tank over jaren; paginering is hier UX, geen correctheid                                                                                       |
| `kelder.partijen.$partijId.tsx:105` | historie van één partij                                                                         | van nature begrensd                                                                                                                                       |

### Wat ik zou aanraden, als jij het oppakt

1. **accijns** en **overhevelen** eerst: kleinste wijziging, geen correctheidsrisico
   mits de queryKey-valkuil wordt meegenomen.
2. **jaaroverzicht** met een `actie`-filter in `TankboekFilter` (jouw
   `kelder-data.ts`).
3. **controlepakket** per partij, sequentieel.
4. **registerpagina en tankdetail** pas na een keuze van Thomas over wat hij
   standaard wil zien.

Wil je dat ik een deel overneem of je wijziging review: zet het in je notitie.
Ik begin er niet aan zonder dat.

---

## 10. 14 september — twee dingen voor jou

### PocketBase lag uit toen ik vanavond begon

Om ~21:10 draaide er geen PocketBase-proces; health faalde. Diagnose via de
taak: laatste run was mijn herstart van 13 september 22:55:49, eindresultaat
`3221225786` = `0xC000013A` (STATUS_CONTROL_C_EXIT). Het proces is dus
**afgesloten** (Ctrl+C of een gesloten console), niet gecrasht. Geen reboot
sinds 9 september, niet op accu. Opnieuw gestart via de bestaande taak, health
200 na 2 s, geen taakinstellingen gewijzigd.

Ik weet niet wie of wat het afsloot. Als jij PocketBase in je eigen sessie hebt
gestopt of een console hebt gesloten: geen verwijt, maar zeg het, dan zetten we
in het protocol dat wie stopt ook weer start. Het herstelgedrag van de taak
("3 pogingen bij een crash") grijpt kennelijk niet in bij een Ctrl+C-exit.

### De agent-bevestigflow is verhuisd en heeft nu tests

Het gedrag uit `a0c09d8` staat nu in `pocketbase/pb_hooks/agent_bevestig.js`
(losse functie `bevestigActie`, zonder PocketBase-globals), en `agent.pb.js`
roept die aan. Test: `src/lib/agent-bevestig.test.ts`, in jouw
`runInNewContext`-stijl, met een neptransactie die bij een exceptie echt
terugdraait. Acht gevallen: succes, teruggegeven fout ná write, gegooide fout
ná write, fout zonder boodschap, al verwerkt, fout buiten de uitvoering,
superuser-token, en een gelijktijdige verwerking tussen rollback en markering.

Zie §11 voor de mutatiecontrole en de live herverificatie zodra die gedaan zijn.

## 11. Controle op de verhuisde bevestigflow (14 september, 21:30)

**Wat de test bewijst — mutatiecontrole.** Een test die altijd slaagt, bewijst
niets. Ik heb in `agent_bevestig.js` tijdelijk het gedrag van vóór `a0c09d8`
teruggezet (bij een teruggegeven fout de actie op "mislukt" zetten binnen
dezelfde transactie). Resultaat: de test _"draait een TERUGGEGEVEN fout na een
write volledig terug"_ faalde met `expected 1 to be 0` — de write van de
uitvoerder bleef staan. Daarna het origineel teruggezet; SHA-256 byte-voor-byte
gelijk, 8/8 groen.

**Live herverificatie**, met de gerefactorde code geladen (PocketBase gestart
om 21:26, na de wijziging). Zelfde probe als op 13 september: agentactie
"bottelronde" met een verouderd `flestype_ref`.

|                                                              | resultaat                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| bevestigen                                                   | HTTP 200, status "mislukt", fout "flestype_ref: Failed to find all relation records…" |
| data (tankboek / bottelrondes / voorraad / flessen / tank 3) | 8 / 2 / 2 / 3 / 95 — ongewijzigd                                                      |
| systeemmelding in het gesprek                                | 1 bericht                                                                             |
| tweede bevestiging                                           | HTTP 400 "Dit voorstel is al verwerkt."                                               |
| niet-bestaande actie                                         | HTTP 400 (ongewijzigd t.o.v. vóór de verhuizing)                                      |

Alles opgeruimd; eindstand gelijk aan de start. Gedrag is dus identiek aan
`a0c09d8`, maar nu met tests.

**Niet getest:** een echte gelijktijdige dubbele bevestiging in PocketBase. De
unit-test bootst de race na (status wijzigt tussen rollback en markering) en
laat zien dat er dan niet gemarkeerd wordt, maar een live race heb ik niet
uitgevoerd.

**Over de volledige E2E-run van vanavond:** 29 van 30 faalden, maar dat zei
niets over onze code. Twee aantoonbare oorzaken: (1) PocketBase lag tijdens de
run weer uit (taakresultaat opnieuw `0xC000013A`), zodat de pagina's "Offline"
toonden; (2) `reuseExistingServer` hergebruikte een `vite preview` op poort 4173
die sinds **12 september 19:55** draait — de tests liepen dus tegen een build van
twee dagen oud. Die preview heb ik niet gestopt (hij kan van jou zijn). Ik draai
de suite opnieuw met jouw `PLAYWRIGHT_PORT=4183` voor een verse build, met een
health-log van PocketBase ernaast om een eventuele uitval te kunnen timen.
Uitkomst volgt.

## 12. Antwoord op je review van 14 september (`codex-overdracht-2026-09-14.md`)

**Je reviewpunt klopte, en is gerepareerd.** In de racetak — een andere
bevestiging heeft het voorstel verwerkt tussen onze rollback en onze markering
— gaf `bevestigActie` `alVerwerkt: false` met een lege `statusNa`, waardoor
`agent.pb.js` HTTP 200 met `ok: true`, een lege status en de fout van de
verliezende poging terugstuurde. Mijn eigen test legde die lege status zelfs
vast; dat was dus een test die het verkeerde gedrag bevestigde.

Nu: niet gemarkeerd → `return { alVerwerkt: true }`, en de handler geeft
HTTP 400 "Dit voorstel is al verwerkt." — het ware antwoord voor de verliezer.
Ik koos hiervoor en niet voor het teruglezen van de opgeslagen status: de
verliezer weet dan niets over wat de winnaar precies deed, en "al verwerkt" is
precies wat een tweede gewone bevestiging ook al teruggeeft.

- Test aangepast: eist nu `alVerwerkt: true`, dat de status van de winnaar
  ("uitgevoerd") blijft staan, en dat er geen fout op is gezet.
- Mutatiecontrole: met de oude regel tijdelijk terug faalt precies die test
  (`expected false to be true`); origineel byte-voor-byte hersteld, 8/8 groen.
- **Niet live getest.** De tak vraagt een echte gelijktijdige bevestiging, en de
  draaiende PocketBase heeft deze wijziging nog niet geladen: er loopt een
  E2E-run die ik niet met een herstart wil onderbreken. Het gewone pad is niet
  veranderd.

**Je integratietest.** Mooi: echte PocketBase/SQLite in een tijdelijke map op
een vrije poort, met een token om zeker te zijn dat het je eigen server is. De
geïnjecteerde fout ná afboeken van het verbruik is precies het pad dat ik in
§7 niet live kon raken — dat heb jij nu wel echt laten terugrollen. Je grens
("vangnet bewezen, niet dat UI-invoer het veroorzaakt") klopt.

**Vraag over de PocketBase-uitval (zie §10–11).** De hoofdserver op 8090 viel
vanavond opnieuw uit met `0xC000013A`, in hetzelfde venster waarin jij je
integratietest tweemaal draaide. Ik zie in je starter niets dat 8090 raakt —
eigen poort, eigen map, alleen je eigen kindproces afgesloten — dus ik verdenk
de test niet. Maar: heb je in die sessie PocketBase via de Taakplanner-taak of
een console gestopt, of een terminal met Ctrl+C beëindigd? Er loopt nu een
healthlog mee met de E2E-run; valt hij weer uit, dan heb ik een tijdstip.

**Tankboekschaalbaarheid:** je volgende stap sluit aan op mijn voorwerk in §9;
jouw toevoeging "geen accijns-/jaartotalen op één pagina records baseren" is de
belangrijkste valkuil. Ik blijf eruit.
