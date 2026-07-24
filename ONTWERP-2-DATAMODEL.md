# Fase 10 — Proactieve assistent: Fase 2, Datamodel

**Status: concept, bouwt voort op `ONTWERP-1-ARCHITECTUUR.md`. Wacht op akkoord van Thomas — op Fase 1 én op dit document. Geen schema of data aangepast tijdens het opstellen.**

> **Afhankelijkheid van open vragen uit Fase 1.** Dit datamodel volgt de *aanbevolen* architectuur uit Fase 1 (regel-signalen berekend in de client, AI-synthese geschrapt, correlatietool uitgesteld). Waar een keuze afhangt van een nog-open vraag voor Thomas, staat dat expliciet gemarkeerd met **[hangt af van vraag N]**. Als Thomas een andere kant kiest, verandert alleen het gemarkeerde deel — de kern blijft staan.

---

## Leidend principe: bijna geen nieuw schema

De belangrijkste uitkomst van Fase 1 voor het datamodel is contra-intuïtief maar eerlijk: **de proactieve laag heeft in zijn aanbevolen vorm nauwelijks nieuwe database-structuur nodig.** Reden: de regel-signalen worden *berekend* uit bestaande collecties op het moment van tonen, niet *opgeslagen*. Een signaal is een afgeleide, geen entiteit. Opslaan zou betekenen dat we een tweede bron van waarheid introduceren die kan verouderen t.o.v. de brondata — precies de fout die nu al zichtbaar is in de dubbele backup-check (nulmeting 1a).

Wat wél nieuw schema vraagt, is klein en valt in drie categorieën:

1. Eén ontbrekend **inputveld** dat een nieuw regel-signaal mogelijk maakt (voorraaddrempel).
2. Een paar **instellingssleutels** (drempels), volgens het bestaande `regelgeving_instellingen`-patroon.
3. Twee **optionele** collecties, elk gekoppeld aan een nog-open vraag, die alleen bestaan als Thomas de bijbehorende functie wil.

Verworpen alternatief: een centrale `signalen`-collectie die elk gedetecteerd signaal als rij opslaat, plus een achtergrondproces dat 'm vult. Verworpen omdat (a) het een tweede waarheid introduceert die kan verouderen, (b) het een gescheduled schrijfproces vereist — precies de "kost geld/draait onbewaakt"-valkuil die Fase 1 wil vermijden, en (c) bij 5-8 signalen die in milliseconden herberekend zijn, opslag geen enkel prestatievoordeel biedt. Signalen opslaan zou pas zin hebben als de berekening duur was (zoals `inzichten`, die wél wordt opgeslagen — dáár is de multi-seizoen-aggregatie het dure deel).

---

## 1. Wijziging op bestaande collectie: `voorraad_flessen`

**Nieuw veld** (via `ensureVelden`, niet-destructief):

| Veld | Type | Verplicht | Default | Motivatie |
|---|---|---|---|---|
| `drempel_aantal` | number | nee | leeg (= gebruik globale standaard) | Onder dit aantal flessen genereert het voorraad-bijna-op-signaal een waarschuwing. Per-wijn instelbaar omdat een dagelijkse huiswijn een hogere drempel verdient dan een kleine speciale cuvée. |

**Waarom een veld en geen aparte collectie?** Een drempel is een eigenschap *van* een voorraadrecord, één-op-één, nooit apart bevraagd. Een aparte `voorraad_drempels`-collectie zou een join vereisen voor elke voorraadweergave zonder enig voordeel. Dit is precies het geval waarin "veld op bestaande collectie" wint van "nieuwe collectie."

De Tappenmars-voorbeeld: voorraadrecord "Souvignier Gris 2025" met `aantal_huidig: 18`, `drempel_aantal: 24` → signaal "Souvignier Gris 2025 nadert einde voorraad (18 flessen, drempel 24)". Een record zonder ingevulde `drempel_aantal` valt terug op de globale standaard (zie §3).

---

## 2. Wijzigingen op bestaande collectie: `inzichten` (geen schemawijziging, wél opschoning)

Het schema blijft **exact zoals het is** — geen veld toegevoegd. Wat nieuw is, is een **opschoonregel**, geen structuur:

- Per unieke combinatie (`inzicht_type`, `onderwerp`) worden alleen de **laatste 12 berekeningen** bewaard (≈ 3 maanden wekelijkse historie). Oudere records krijgen `deleted: true` (soft-delete, consistent met het bestaande `deleted != true`-filterpatroon dat `meldingen.tsx` en de agent-tool al gebruiken).
- Uitvoering: uitbreiding van `scripts/bereken-inzichten.mjs` zelf — direct ná het schrijven van de nieuwe berekeningen ruimt het script de oude op. Dit koppelt opschoning aan de berekening (die toch al draait), zodat er **geen apart onbewaakt opschoonproces** ontstaat — leert van de Fase 9-bevinding dat losse achtergrondtaken op deze machine niet vanzelf draaien.

**Waarom soft-delete en niet hard verwijderen?** Consistentie met de bestaande conventie (alle agent-collecties gebruiken `deleted`-vlag i.p.v. echte verwijdering), en het houdt de deur open voor een latere echte-verwijder-sweep zonder de opschoonlogica te herschrijven. In tegenstelling tot het tankboek (wettelijk permanent) heeft een oude inzicht-snapshot geen bewaarplicht — de soft-delete is puur operationeel gemak, geen juridische keuze.

---

## 3. Nieuwe instellingssleutels in `regelgeving_instellingen`

Volgen het bestaande patroon (`sleutel`/`waarde`/`eenheid`/`bron`), geseed via `setup-pocketbase.mjs` met veilige defaults die Thomas kan aanpassen:

| `sleutel` | `waarde` (default) | `eenheid` | Betekenis |
|---|---|---|---|
| `voorraad_drempel_standaard` | `12` | flessen | Globale voorraad-bijna-op-drempel voor wijnen zonder eigen `drempel_aantal` |
| `signaal_max_zichtbaar` | `6` | stuks | Plafond op de Vandaag-widget (Fase 1: 6) — instelbaar zodat Thomas het kan bijstellen zonder code |
| `inzicht_bewaar_aantal` | `12` | berekeningen | Hoeveel snapshots per (type, onderwerp) bewaard blijven |

**Waarom in `regelgeving_instellingen` en niet gehardcodeerd?** De nulmeting toont dat drempels nu deels hardcoded staan (backup 2 dagen, AGP 80%) en deels als instelling (AGP-drempel zelf). Dat is inconsistent. Nieuwe drempels horen instelbaar te zijn, zodat Thomas ze na een seizoen kan bijstellen op basis van ervaring — precies het soort waarde dat pas met echt gebruik blijkt. Verworpen alternatief: een aparte `signaal_instellingen`-collectie — onnodig, `regelgeving_instellingen` is al de generieke sleutel-waarde-store en wordt al door de accijns- en backup-logica gebruikt.

> **Aanbeveling los van dit ontwerp**: de bestaande hardcoded drempels (backup 2 dagen in `index.tsx` én `meldingen.tsx`, AGP 80% in `meldingen.tsx`) zouden bij de bouw naar dezelfde store kunnen verhuizen zodat álle drempels op één plek staan. Dit hoort logisch bij "de signaallaag opschonen" maar is strikt genomen refactoring van bestaande functionaliteit — meenemen in Fase 4-stappen als lage-risico opruiming, of bewust laten liggen. **Vraag voor Thomas.**

---

## 4. Optionele collectie: `signaal_status` — **[hangt af van vraag 3]**

**Alleen bouwen als Thomas snooze/dismiss wil synchroniseren tussen telefoon en laptop.** Anders blijft dit localStorage (zie §6, migratiepad) en wordt deze collectie **niet** aangemaakt.

Als wél gewenst:

| Veld | Type | Verplicht | Motivatie |
|---|---|---|---|
| `signaal_id` | text | ja | Het stabiele signaal-id (`<bron>-<onderwerp-id>`), zoals nu al in localStorage |
| `actie` | select (`gesnoozed`, `genegeerd`) | ja | Onderscheid tijdelijk uitstellen vs. permanent verbergen |
| `snooze_tot` | text (`yyyy-MM-dd`) | nee | Alleen bij `gesnoozed`; leeg bij `genegeerd` |
| `gebruiker` | relation → `users` | nee | Zodat een tweede gebruiker (later) eigen snooze-status heeft |
| + `vineyard_id`, autodate | | | Standaardconventie |

Rechten: `OPEN_RULE` (consistent met de rest van de app, die bewust zonder login werkt), of `AUTH_RULE` als Thomas snooze-status per account wil — **onderdeel van vraag 3**.

**Waarom een aparte collectie en geen veld op iets bestaands?** Een signaal-status hoort bij geen enkele bestaande entiteit — het signaal zelf is een afgeleide zonder eigen rij. Dit is de enige plek waar het onvermijdelijk een eigen tabel is als het al persistent-in-de-database moet. **Maar**: Fase 1 adviseert localStorage voorlopig te houden (single-user, single-device is de realiteit), dus dit is bewust een *voorwaardelijke* collectie.

**Query-index**: index op `signaal_id` (puntlookup bij het renderen van elk signaal) en op `snooze_tot` (om verlopen snoozes op te ruimen).

---

## 5. Optionele collectie: `signaal_analyses` — **[hangt af van vraag 1 en 2, uitgesteld tot na oogst 2026]**

**Alleen bouwen als en wanneer de AI-correlatietool daadwerkelijk gebouwd wordt** (Fase 1: pas na een echt seizoen). Nu in dit document opgenomen zodat de vorm vaststaat, maar niet in Fase 5 aangemaakt.

| Veld | Type | Verplicht | Motivatie |
|---|---|---|---|
| `betrokken_signalen` | json | ja | Array van signaal-id's + hun samenvatting op het moment van analyse (snapshot, want de signalen zelf zijn afgeleiden die veranderen) |
| `redenering` | text | ja | De opgeslagen AI-verklaring — conform Fase 1: opslaan bij generatie, nooit opnieuw opvragen |
| `model` | text | ja | Welk model de redenering produceerde (`claude-sonnet-5`), voor traceerbaarheid bij latere prijs-/modelwijzigingen |
| `gegenereerd_op` | text (`yyyy-MM-dd HH:mm`) | ja | Voor de bewaartermijn-sweep |
| `vervalt_op` | text (`yyyy-MM-dd`) | ja | `gegenereerd_op` + 90 dagen; maakt opschoning een triviale datumvergelijking |
| + `vineyard_id`, autodate | | | Standaardconventie |

Rechten: `listRule`/`viewRule` = `OPEN_RULE` (Thomas mag zijn eigen opgeslagen analyses altijd teruglezen — gratis, want opgeslagen), `createRule`/`updateRule`/`deleteRule` = `null` (alleen de hook mag schrijven, exact zoals `agent_acties`).

**Waarom `vervalt_op` als apart veld en niet berekend uit `gegenereerd_op`?** Zodat de opschoon-sweep een simpele indexeerbare filter kan draaien (`vervalt_op < vandaag`) zonder per record te rekenen. Kleine denormalisatie, grote query-eenvoud.

**Bewaartermijn**: 90 dagen, daarna **hard verwijderen** (niet soft-delete) — een AI-verklaring over een allang-niet-meer-actueel signaal heeft geen operationele én geen juridische waarde. Dit is het enige onderdeel dat hard verwijdert i.p.v. soft-delete, bewust, omdat er anders onbeperkt AI-tekst opstapelt.

---

## 6. Migratiepad vanaf de huidige staat

**Niet-destructief en idempotent via `scripts/setup-pocketbase.mjs`, conform de harde regel.**

### Bestaande `inzichten`-records
Blijven volledig intact. De nieuwe opschoonregel (§2) werkt alleen vooruit: bij de eerstvolgende `bereken-inzichten.mjs`-run worden per (type, onderwerp) de oudste boven de 12 gemarkeerd als `deleted`. Geen enkel bestaand record wordt aangeraakt bij de schema-migratie zelf. Er zijn er nu sowieso weinig (de berekening draait handmatig), dus het effect is klein en veilig.

### Bestaande meldingen-state (localStorage `wg.meldingen.afgevinkt.v1`)
De Vandaag-widget vervangt `meldingen.tsx` maar de afgevinkt-state moet blijven plakken, anders ziet Thomas alles wat hij al had weggeklikt opnieuw. **Migratie in de client** (eenmalig, bij eerste laden van de nieuwe widget):
- Lees de oude sleutel `wg.meldingen.afgevinkt.v1` (array van id's).
- Schrijf ze als `{ actie: "genegeerd" }` naar de nieuwe structuur `wg.signalen.staat.v2`.
- De signaal-id's zijn bewust ontworpen om **identiek** te blijven aan de bestaande melding-id's (`onderhoud-<...>`, `backup-<...>`, etc.) zodat de migratie een 1-op-1 sleutelkopie is, geen vertaling.
- Laat de oude sleutel staan (niet wissen) voor het geval Thomas terugrolt — localStorage-ruimte is triviaal.

**Verworpen alternatief**: de oude sleutel hergebruiken. Verworpen omdat de nieuwe structuur snooze-met-datum toevoegt (de oude was een platte array); een versienummer in de sleutel maakt de vorm-wijziging expliciet en terugrolbaar.

### Bestaande `agent_acties`-flow
Ongewijzigd. De signaal→taak-promotie hergebruikt deze flow zonder schema-aanpassing (Fase 1: geen nieuwe status-machine). Wel relevant: de bestaande frontend/backend-drift (`onderhoud`/`order` ontbreken in `AGENT_ACTIE_CONFIG`) moet gefixt zijn vóórdat een signaal een onderhouds-taak kan voorstellen — anders heeft de bevestigingskaart geen weergave. **Dit is de reden dat die losse bugfix nu al relevant is** (zie Fase 1, vraag 4).

---

## 7. Bewaartermijnen en opschoning (samengevat)

| Data | Bewaartermijn | Methode | Wie draait het |
|---|---|---|---|
| `inzichten` | Laatste 12 per (type, onderwerp) | Soft-delete (`deleted: true`) | Uitbreiding van `bereken-inzichten.mjs`, gekoppeld aan de berekening |
| `signaal_status` (indien gebouwd) | Verlopen snoozes | Hard verwijderen zodra `snooze_tot < vandaag` | Client bij laden, of kleine sweep in bereken-inzichten |
| `signaal_analyses` (indien gebouwd) | 90 dagen | Hard verwijderen zodra `vervalt_op < vandaag` | Sweep in het opschoonproces |
| Regel-signalen zelf | N.v.t. | Worden niet opgeslagen | — |

Elk opschoonproces schrijft een `regelgeving_instellingen`-record (`sleutel: "laatste_signaal_opschoning"`, `laatst_gecontroleerd: <datum>`) naar het patroon van de bestaande backup-monitoring, zodat óók deze opschoning zichtbaar is als hij een keer niet draait.

---

## 8. Verwachte datagroei per jaar (normaal gebruik)

| Collectie | Groei/jaar | Toelichting |
|---|---|---|
| `inzichten` | Netto ~begrensd op 12 × ~40 (type×onderwerp) ≈ 480 actieve records | Zonder opschoning ~1.800/jaar; mét de 12-snapshot-regel stabiliseert het |
| `voorraad_flessen.drempel_aantal` | 0 nieuwe records | Alleen een veld op bestaande records |
| `regelgeving_instellingen` | +3 records eenmalig | Instellingssleutels, groeien niet |
| `signaal_status` (indien gebouwd) | Zo groot als het aantal ooit gesnoozede/genegeerde signalen, minus opschoning; realistisch enkele tientallen | Verlopen snoozes worden opgeruimd |
| `signaal_analyses` (indien gebouwd) | ~15-20 records/oogstmaand, begrensd op 90 dagen ≈ max. ~60 tegelijk | Alleen tijdens actief seizoen, hard opgeschoond |

Conclusie: **verwaarloosbare groei.** Geen enkele collectie loopt bij normaal gebruik uit de hand; de enige onbegrensde bron (`inzichten` zonder opschoning) wordt door §2 begrensd.

---

## 9. Query-patronen van het dashboard

Welke vragen stelt de Vandaag-widget, en dekken de bestaande/nieuwe indexen die af?

| Vraag | Query | Index nodig? |
|---|---|---|
| "Welke tanks stagneren?" | `inzichten` waar `inzicht_type = "gisting_snelheid"` en `deleted != true`, sorteer `-berekend_op` | Bestaande sortering op `berekend_op` volstaat; dataset klein |
| "Welk onderhoud komt eraan?" | `onderhoudslog` (bestaande `fetchOnderhoud` + `onderhoudBinnenkort`-filter client-side) | Geen — kleine dataset, bestaande query |
| "Welke voorraad is bijna op?" | `voorraad_flessen` waar `aantal_huidig < (drempel_aantal ?? standaard)` — **client-side filter** na fetch | Geen nieuwe index; vergelijking gebeurt in de client omdat de fallback-drempel niet in een simpele PB-filter past |
| "Welke taken vervallen?" | `kelderlog` waar `notitie` begint met `"TAAK:"` (bestaande client-side filter in `meldingen.tsx`) | Geen — bestaande query |
| "Wat is de backup-status?" | `regelgeving_instellingen` waar `sleutel = "laatste_backup"` | Geen — puntlookup, kleine tabel |
| "Snooze-status van signaal X" (indien collectie) | `signaal_status` waar `signaal_id = {:id}` | **Nieuwe index op `signaal_id`** |

**Belangrijke ontwerpkeuze in query-patronen**: het voorraad-bijna-op-signaal filtert **client-side** omdat de drempel per record kan verschillen (eigen `drempel_aantal` óf de globale standaard) — dat is geen enkele PocketBase-filterexpressie. Alternatief (een gematerialiseerd "onder drempel"-veld dat bij elke mutatie herberekend wordt) is verworpen: het introduceert weer een tweede waarheid die kan verouderen, voor een dataset (enkele tientallen wijnen) die triviaal in de client te filteren is. Consistent met het leidend principe: bereken, sla niet op.

---

## Drie belangrijkste datamodel-keuzes

1. **Bijna geen nieuw schema.** De regel-signalen worden berekend uit bestaande data, niet opgeslagen — één inputveld (`voorraad_flessen.drempel_aantal`), drie instellingssleutels, en twee *voorwaardelijke* collecties die alleen bestaan als Thomas de bijbehorende functie wil.
2. **Opschoning is gekoppeld aan bestaande processen**, nooit een los onbewaakt achtergrondproces — leert direct van de Fase 9-bevinding dat losse crons op deze machine niet vuren.
3. **De migratie behoudt Thomas' afgevinkte meldingen** via bewust identiek gehouden signaal-id's, zodat de overgang van `meldingen.tsx` naar de Vandaag-widget geen enkele weggeklikte melding terugbrengt.

---

## Vragen voor Thomas (aanvullend op Fase 1)

1. **Voorraaddrempels**: is één globale standaard (12 flessen) genoeg om mee te beginnen, of wil je per wijn direct kunnen instellen? (Het datamodel ondersteunt beide; dit bepaalt alleen of de per-wijn-invoer-UI in de eerste bouwstap zit of later.)
2. **De bestaande hardcoded drempels** (backup 2 dagen, AGP 80%) meeverhuizen naar `regelgeving_instellingen` bij de bouw, of bewust laten staan? (Opruiming, laag risico, maar raakt bestaande werkende code.)
3. Herhaling van Fase 1-vraag 3 omdat het `signaal_status`-model eraan hangt: **snooze delen tussen apparaten nu al, of localStorage voorlopig prima?**
