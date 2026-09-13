# Samenwerkafspraken tussen AI-agents op dit project

**Lees dit vóór je één bestand aanraakt.** Dit document geldt voor elke
AI-agent die aan De Tappenmars Buddy werkt — Claude Code, Codex/ChatGPT, of
wat er later bij komt. Opgesteld door Claude Code op 12 september 2026 op
verzoek van Thomas, nadat we op 11 september aantoonbaar in elkaars werk zaten.

Dit document staat naast `CLAUDE.md` en `AGENTS.md` en vervangt die niet: de
projectinhoud staat daar, de samenwerking staat hier.

---

## 1. Waarom dit bestaat — wat er op 11 september misging

Geen hypothetisch risico. Dit is echt gebeurd, in één avond:

1. **We bewerkten hetzelfde bestand.** `src/routes/pasteurisatie.plannen.tsx`
   bevatte tegelijk een foutmelding van Claude en de `onbekend`-afhandeling van
   Codex. Niemand wist dat van de ander.
2. **De boom was tijdelijk niet te compileren.** Om 23:11 gaf `tsc` twee fouten
   omdat `onbekend` nog niet in alle `Record<PasteurisatieOordeel, …>` stond.
   De andere agent kon op dat moment niets betrouwbaar testen.
3. **Een testrun werd vervuild.** Rooktest 16 faalde, en slaagde daarna los wél
   (25s). Oorzaak: de E2E-suite bouwt de app, en die build liep terwijl de
   andere agent bestanden herschreef. Een uur zoeken naar een bug die er niet was.
4. **Werk bleef 21 uur alleen op schijf staan.** Elf bestanden ongecommit,
   inclusief een veiligheidsfix. Onherstelbaar bij één ongeluk met die map.

Alle vier zijn te voorkomen met afspraken, niet met betere code.

---

## 2. Het ene doel waar we allebei aan werken

**Thomas moet zijn wijnbedrijf vanaf zijn telefoon kunnen runnen — in de
wijngaard en in de kelder — en kunnen vertrouwen wat de app zegt.**

Dat is de maatstaf. Niet "meer functies". Als een wijziging dat vertrouwen niet
vergroot, hoort ze achteraan. Concreet, in volgorde van hardheid:

1. **Het tankboek en de accijnsopgave moeten kloppen en verdedigbaar zijn**
   tegenover NVWA en Belastingdienst. Het tankboek is append-only en
   onwijzigbaar; schrijven kan alleen via de serverendpoints. Alles wat daar
   een onjuiste of onvolledige regel in kan krijgen is een ernstige bug, ook
   als het "maar een randgeval" is. (Zie de capaciteit-0-bypass, pentest
   10 september: een miljard liter kwam er gewoon in.)
2. **Een veiligheidsoordeel mag nooit ten onrechte "veilig" zeggen.**
   Pasteurisatiedruk en PU gaan over barstend glas. Bij twijfel, ontbrekende of
   niet-eindige invoer hoort de uitkomst "onbekend/onvoldoende gegevens" te
   zijn, nooit stilzwijgend "veilig". Elk rekenmodel draagt `gevalideerd: false`
   tot een echte nagemeten run het bevestigt — die vlag weghalen is geen
   opruiming maar een veiligheidswijziging.
3. **De app mag niet omvallen door één kleine storing.** Geen wit scherm, geen
   eeuwig laden, en vooral: een mislukte query mag er nooit uitzien als "er is
   geen data". Dat laatste is het terugkerende faalpatroon van dit project
   (Fase 8, 10, 19) en kost Thomas vertrouwen in zijn eigen cijfers.
4. **Eén handeling = één invoer.** Thomas' eigen antwoord op "wat stoort je het
   meest": hij noteert nu eerst op papier en tikt het daarna digitaal in, en
   dezelfde gegevens moeten op meerdere plekken. Dat is het echte knelpunt van
   de keldermanager, belangrijker dan welke nieuwe functie ook. Zie
   `docs/onderzoek-keldermanager.md`.
5. **Offline waar het kan, eerlijk waar het niet kan.** De wijngaardmodule is
   offline-first met een sync-wachtrij. Kelder/voorraad/verkoop zijn **bewust**
   online-only zonder wachtrij, omdat die boekingen server-side atomair moeten
   zijn. Die keuze omdraaien is een ontwerpbesluit, geen opruimklus.

**De harde deadline die boven alles hangt:** er is op dit moment geen
authenticatie en geen rolonderscheid. Dat is te overzien zolang PocketBase
alleen op `127.0.0.1` luistert, en **niet** te overzien zodra de server naar de
Raspberry Pi of `pb.tappenmars.nl` gaat. Dat besluit ligt bij Thomas en staat
sinds 9 september bewust open. Geen agent zet dit zelf om.

---

## 3. Werkverdeling — zo zitten we elkaar niet in de weg

### 3.1 De claimregel

**Vóórdat je een bestand wijzigt, claim je het in `docs/agent-claims.md`.**
Dat bestand is het enige gedeelde "wie doet wat op dit moment". Voorbeeld:

```
## Codex — bezig sinds 2026-09-12 19:56
- pocketbase/pb_hooks/kelder_logica.js
- src/lib/kelder-data.ts
- src/lib/kelder-server.test.ts
Doel: servervalidatie kelderboekingen + regressietests
```

Regels:

- **Claim vóór je begint, niet achteraf.** Een claim zonder bewerking is
  goedkoop; een bewerking zonder claim kost de ander een half uur.
- **Claim zo smal mogelijk.** Losse bestanden, geen hele mappen, tenzij je
  echt de hele map omgooit.
- **Haal je claim weg zodra je gecommit hebt.** Een claim die blijft staan
  terwijl je klaar bent, blokkeert de ander onnodig.
- **Zie je een claim van de ander op een bestand dat jij nodig hebt: begin er
  niet aan.** Kies ander werk, of schrijf een notitie (§6) met wat je wilde.
- **Claims verlopen na 24 uur.** Staat er een claim van gisteren zonder
  bijbehorende ongecommitte wijziging, dan is hij dood en mag je hem opruimen.

### 3.2 Natuurlijke scheidslijnen

Waar mogelijk werken we in gescheiden delen van de app. Grove indeling die goed
werkt omdat de afhankelijkheden er nauwelijks overheen lopen:

| Domein                         | Bestanden                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Pasteurisatie & drukveiligheid | `src/lib/drukveiligheid*`, `src/lib/pasteurisatie*`, `src/routes/pasteurisatie.*`, `pocketbase/pb_hooks/pasteurisatie*` |
| Kelder & tankboek              | `src/lib/kelder*`, `src/lib/partijen-data.ts`, `src/routes/kelder.*`, `pocketbase/pb_hooks/kelder*`                     |
| Wijngaard                      | `src/lib/data.ts`, `src/lib/extra-data.ts`, `src/routes/rij.*`, `perceelkaart`, `snel`, `scan`                          |
| Voorraad & verkoop             | `src/lib/*voorraad*`, `flessen*`, `verkoop*`, `pb_hooks/voorraad*`, `flessen*`                                          |
| Agent/assistent                | `pb_hooks/agent*`, `src/routes/assistent.tsx`                                                                           |

**Let op de gedeelde brokken.** Deze raken iedereen en verdienen een expliciete
claim plus een notitie achteraf:

- `src/lib/types.ts` — één toegevoegde waarde aan een union (bijv. `onbekend`
  aan `PasteurisatieOordeel`) breekt elke `Record<…>` elders. Wie dit doet,
  loopt **alle** gebruikers na vóór hij stopt.
- `scripts/setup-pocketbase.mjs` — het schema. Draai
  `node scripts/check-schema-drift.mjs` vóór én ná.
- `src/routeTree.gen.ts` — gegenereerd. Niet met de hand bewerken; conflicten
  hierin los je op door `bun run dev` te draaien, niet door te mergen.
- `e2e/rooktest.spec.ts` — we voegen allebei tests toe. Zet je test **onderaan**
  met het volgende vrije nummer, dan blijft het conflictvrij.
- `CLAUDE.md`, `AGENTS.md`, `WERKLOG.md` — append, nooit herschrijven van
  andermans alinea's.

### 3.3 Commit-discipline

- **Commit zodra het compileert, lint schoon is en de tests groen zijn.** Niet
  aan het eind van de sessie. Ongecommit werk is onzichtbaar voor de ander,
  onbeschermd tegen ongelukken, en maakt elke testrun van de ander onbetrouwbaar.
- **Laat de boom nooit kapot achter.** Breekt je wijziging `tsc`, maak het af of
  draai het terug vóór je iets anders doet. De ander kan in de tussentijd niets.
- **DE INDEX IS GEDEELD — dit is de belangrijkste regel van deze paragraaf.**
  `git add <pad>` is NIET genoeg. `git commit` legt de héle index vast, niet
  alleen wat jij zojuist hebt toegevoegd. Heeft de ander zijn werk gestaged maar
  nog niet gecommit, dan sleep jij het mee.

  Dit is op 12 september echt gebeurd: commit `1414cf7` was bedoeld als drie
  route-bestanden van Claude en bevatte ook vijf kelderbestanden van Codex die
  klaarstonden in de index.

  Doe daarom altijd één van deze twee:

  ```bash
  git diff --cached --name-only    # kijk wat er ECHT gecommit gaat worden
  git commit -m "..."
  ```

  of, veiliger, commit met expliciete paden zodat de rest van de index
  genegeerd wordt:

  ```bash
  git commit <pad1> <pad2> -m "..."
  ```

- **Commit alleen je eigen bestanden.** Gebruik `git add <pad> …`, niet
  `git add -A`. Dat legt namelijk het halve werk van de ander vast.
- Kom je toch in de verleiding andermans werk te committen (bijvoorbeeld omdat
  het al een dag ongecommit staat): **doe het alleen na overleg met Thomas**,
  en schrijf in de commitboodschap wiens werk het is.

### 3.4 Wat je nóóit globaal draait

Deze commando's raken bestanden van de ander en maken zijn diff onleesbaar:

- `npm run format` / `bun run format` over de hele repo → draai prettier op
  **alleen je eigen bestanden**: `npx prettier --write <pad> <pad>`.
- `eslint --fix` over de hele repo → idem.
- Massale hernoem- of opruimacties.

### 3.5 Testen zonder elkaar te storen

- **Unit-tests (`npm test`) zijn altijd veilig** — die lezen alleen.
- **De E2E-rooktests bouwen de hele app.** Draai je die terwijl de ander
  schrijft, dan test je een half bestand en krijg je een fantoomfout. Vóór een
  volledige `npx playwright test`: kijk in `docs/agent-claims.md` of de ander
  bezig is, en of `git status` stabiel is.
- **Faalt een test onverwacht: draai hem eerst los opnieuw** (`--grep`). Slaagt
  hij dan wél, dan weet je precies één ding: hij is niet opnieuw
  gereproduceerd. Dat is géén bewijs van bouwvervuiling — een wisselvallige
  netwerkfout of een timingbug geeft exact hetzelfde patroon. Schrijf dus
  "niet opnieuw gereproduceerd, oorzaak nog vast te stellen" totdat je direct
  bewijs hebt (bijvoorbeeld een trace met een afgebroken request, of een
  aantoonbaar half geschreven bestand tijdens de build). Verzwijg de mislukking
  nooit.

  > Deze regel is op 13 september aangescherpt nadat Codex terecht opmerkte dat
  > de oude formulering ("vrijwel zeker bouwvervuiling — geen regressie") een
  > conclusie trok die niet uit één geslaagde herhaling volgt, en bovendien in
  > strijd was met de regel hieronder. Precies waar §4 voor bedoeld is.

- `retries: 0` in de Playwright-config is bewust. Een wisselvallige test is een
  bevinding, geen ruis om weg te retryen.
- PocketBase-hooks herladen **niet** op Windows. Wijzig je iets in `pb_hooks/`,
  herstart de server — en weet dat je daarmee ook de ander even onderuithaalt.
  Zeg het in je notitie.

---

## 4. Elkaar controleren — dit is gewenst, niet onbeleefd

**Thomas wil expliciet dat we elkaars werk nakijken op fouten en verbeteringen.**
Dat is geen wantrouwen; twee modellen met verschillende blinde vlekken vinden
samen meer dan één. Het werkt alleen als het eerlijk gebeurt.

### 4.1 Hoe je een bevinding brengt

- **Met bewijs, niet met een gevoel.** Noem bestand en regel, en wat er concreet
  misgaat bij welke invoer. "Dit voelt fragiel" is geen bevinding.
- **Verifieer vóór je het meldt.** Lees de huidige code echt; documentatie in
  dit project is meermaals stale gebleken. De werkelijke code wint altijd.
- **Zeg erbij hoe zeker je bent.** "Live gereproduceerd met curl" is iets
  anders dan "dit lijkt me mis bij NaN". Beide mogen, maar niet door elkaar.
- **Ga niet zelf de fix doen in andermans geclaimde bestand.** Meld het, en laat
  het aan hem — tenzij hij klaar is en de claim weg is.

### 4.2 Hoe je een bevinding ontvangt

- **Loop hem na vóór je reageert.** Niet meteen instemmen en niet meteen
  verdedigen.
- **Heeft hij gelijk: zeg dat gewoon.** Kort, zonder omhaal, en corrigeer het.
  Een voorbeeld hoe het hoort: Codex vond dat `veiligheidsoordeel()` bij een
  niet-eindige druk doorviel naar `veilig` (elke vergelijking met `NaN` is
  `false`, dus beide drempels werden overgeslagen). Dat klopte, en het viel
  búiten de dekking van Claude's pentest van 10 september — die testte
  endpoints, niet het gedrag van de rekenfuncties bij onzin-invoer. Dat is zo
  opgeschreven in `docs/claude-overdracht-2026-09-11.md`, inclusief de erkenning
  dat het een gat in de eigen dekking was.
- **Heeft hij ongelijk: zeg dat óók, met bewijs.** Meegaan uit beleefdheid is
  hier schadelijker dan botsen. Er is één uitzondering waarbij je juist niet
  mag toegeven: als het over een veiligheids- of accijnsgarantie gaat, ligt de
  bewijslast bij degene die iets minder streng wil maken.

### 4.3 Waar je elkaar vooral op moet controleren

Dit project heeft aantoonbaar terugkerende faalpatronen. Kijk daar als eerste:

1. **"Stil lege staat"** — een fout die als "geen data" wordt getoond. Gevonden
   in Fase 8 (29 plekken), Fase 10, Fase 19 (27 schermen), en opnieuw in de
   robuustheidsaudit van 11 september. Dit blijft terugkomen.
2. **Create-only helpers die bestaande records overslaan.** `ensureCollection()`
   corrigeert nooit een bestaande collectie. Dit gat is al vier keer in een
   andere vorm gevonden (API-regels, keuzelijstwaarden, `required`-vlaggen,
   keuzelijsten via `ensureVelden`). Verwacht een vijfde.
3. **Stale documentatie.** `CLAUDE.md` en `ARCHITECTURE.md` hebben meermaals
   iets beweerd wat niet meer klopte ("geen rate-limiting", "bodem heeft geen
   invoer-UI", `partij_toevoegingen` dat niet meer bestaat, bestanden die niet
   bestaan). Controleer een claim uit een document vóór je erop bouwt, en
   corrigeer het document als het fout blijkt.
4. **Twee implementaties van dezelfde som.** De agent-JSVM kan geen TS
   importeren, dus sommige formules bestaan bewust dubbel. Wijzig je er één,
   werk de andere bij — en zeg het.
5. **Getallen die stilletjes 0 worden.** PocketBase geeft een leeg getalveld
   terug als `0` en een leeg tekstveld als `""`. Daar komen zowel "SO₂ = 0"
   als `format(parseISO(""))`-crashes vandaan. Zie `gemeten_velden` en
   `src/lib/datumtekst.ts` voor hoe dit al is opgelost.

---

## 5. Wat geen enkele agent zelfstandig doet

Deze punten zijn van Thomas, niet van ons. Ook niet "even snel", ook niet als
het technisch logisch lijkt:

- **Authenticatie voor de hele app aan- of uitzetten.** Dit is drie keer gedaan
  en twee keer teruggedraaid, de laatste keer omdat Thomas zichzelf niet meer
  bij zijn eigen app kon krijgen op de dag dat hij hem nodig had. De vierde keer
  faalt opnieuw als het buitensluit-probleem niet éérst is opgelost. Het besluit
  (optie A/B/C) staat sinds 9 september bewust open.
- Daarmee samenhangend en om dezelfde reden niet zelf oppakken: `requireAuth()`
  op `/api/agent/actie/{id}/bevestig`, de open PII in `klanten` dichtzetten, en
  de wildcard-CORS beperken. Alle drie zijn onschadelijk zolang de server op
  `127.0.0.1` staat en moeten opgelost zijn vóór de Pi-migratie.
- **De Pi-migratie of een deploy starten.** Wie daaraan begint, legt eerst het
  auth-punt voor. Aannemen dat "zo laten" de keuze is, mag niet.
- **DNS of serverconfiguratie wijzigen.**
- **Destructieve schemawijzigingen** of bulk-deleties in de database.
- **De `gevalideerd`-vlag van een rekenmodel op `true` zetten.** Dat mag alleen
  na een echte nagemeten run.
- **`pocketbase/pb_migrations/*.js` "corrigeren".** Dat is append-only
  geschiedenis; de oude tikfout hoort daar te staan.

Twijfel je of iets hieronder valt: vraag het Thomas. Een gemiste dag is
goedkoper dan een opengezette database.

---

## 6. Overdrachtsnotities

Naast de claims (§3.1) schrijven we een notitie als we iets afronden of
overdragen: `docs/<agent>-overdracht-<datum>.md`. Wat erin hoort:

- Wat je hebt gewijzigd en **of het gecommit is** (met hash).
- Wat je bewust **niet** hebt gedaan, en waarom.
- Wat je hebt getest, en wat je uitdrukkelijk **niet** hebt getest. Dit is het
  belangrijkste deel: "10 tests groen" zonder "niet in echte Excel gecontroleerd"
  is misleidend.
- Bevindingen over het werk van de ander (§4).
- Wat de volgende stap zou zijn.

Een notitie is geen bewijs dat de ander hem gelezen heeft. Ga daar niet vanuit.

---

## 7. Als het tóch misgaat

- **Merge-conflict of dubbel bewerkt bestand:** niets weggooien. Beide
  bijdragen staan meestal naast elkaar en zijn allebei gewild. Controleer of de
  wijziging van de ander er nog in zit vóór je commit.
- **De boom compileert niet en het is niet van jou:** repareer het niet stilletjes
  in zijn bestanden. Schrijf een notitie met de exacte fout en de plek. Is hij
  al een dag weg, dan mag je het oplossen — vermeld dat dan in je commit.
- **Je hebt per ongeluk andermans werk overschreven:** zeg het meteen tegen
  Thomas en kijk of het in git of in de backups staat. Niet verdoezelen.
- **Twijfel over de staat van de database:** `pb_data` wordt dagelijks om 20:00
  geback-upt. Vóór een risicovolle actie kun je er zelf één afdwingen.
