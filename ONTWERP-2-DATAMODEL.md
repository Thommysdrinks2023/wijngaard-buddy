# Fase 10 — Proactieve assistent: Fase 2, Datamodel

> **Correctie (Fase 16, 28 augustus 2026):** waar dit document "producent"
> schrijft, heet dat vanaf Fase 16 **eigenaar** (collectie `eigenaars`, veld
> `eigenaar`). De term is gewijzigd omdat De Tappenmars ook voor andere
> wijngaarden en fruittelers verwerkt en bottelt; die klanten zijn geen
> producent maar eigenaar van hun eigen product. De tekst hieronder blijft
> staan zoals hij destijds is geschreven.


**Status: BESLOTEN door Thomas (24 juli 2026). Dit document reflecteert de definitieve besluiten en is de basis voor Fase 5 (bouwen).**

---

## Leidend principe: bijna geen nieuw schema

De belangrijkste uitkomst van Fase 1 voor het datamodel is contra-intuïtief maar eerlijk: **de proactieve laag heeft in zijn aanbevolen vorm nauwelijks nieuwe database-structuur nodig.** Reden: de regel-signalen worden *berekend* uit bestaande collecties op het moment van tonen, niet *opgeslagen*. Een signaal is een afgeleide, geen entiteit. Opslaan zou betekenen dat we een tweede bron van waarheid introduceren die kan verouderen t.o.v. de brondata — precies de fout die nu al zichtbaar is in de dubbele backup-check (nulmeting 1a).

Wat wél nieuw schema vraagt (definitief, na Thomas' besluiten):

1. Eén ontbrekend **inputveld** dat een nieuw regel-signaal mogelijk maakt (voorraaddrempel) — **nu al toevoegen**.
2. Een nieuwe collectie **`app_instellingen`** voor operationele voorkeuren (drempels, plafonds) — **gescheiden van** `regelgeving_instellingen`, dat gereserveerd blijft voor wettelijk geverifieerde waarden.
3. Eén nieuwe collectie **`signaal_status`** voor server-side snooze/dismiss — **wordt gebouwd**, niet meer voorwaardelijk (Thomas werkt op telefoon én desktop, localStorage volstaat niet).
4. **`inzichten` blijft ongewijzigd, geen opschoning** — Thomas wil jaar-op-jaar-vergelijking, dus alles bewaard.
5. `signaal_analyses` blijft **optioneel/uitgesteld** (correlatietool na het seizoen) — vorm staat vast, niet gebouwd in Fase 5.

Verworpen alternatief: een centrale `signalen`-collectie die elk gedetecteerd signaal als rij opslaat, plus een achtergrondproces dat 'm vult. Verworpen omdat (a) het een tweede waarheid introduceert die kan verouderen, (b) het een gescheduled schrijfproces vereist — precies de "kost geld/draait onbewaakt"-valkuil die Fase 1 wil vermijden, en (c) bij 5-8 signalen die in milliseconden herberekend zijn, opslag geen enkel prestatievoordeel biedt.

---

## 1. Wijziging op bestaande collectie: `voorraad_flessen`

**Nieuw veld** (via `ensureVelden`, niet-destructief) — **besloten: nu al toevoegen**, ook al start Thomas met de globale standaard, zodat er later geen aparte migratie nodig is:

| Veld | Type | Verplicht | Default | Motivatie |
|---|---|---|---|---|
| `drempel_aantal` | number | nee | leeg (= gebruik globale standaard uit `app_instellingen`) | Onder dit aantal flessen genereert het voorraad-bijna-op-signaal een waarschuwing. Leeg = val terug op de globale standaard (12). |

**Waarom een veld en geen aparte collectie?** Een drempel is een eigenschap *van* een voorraadrecord, één-op-één, nooit apart bevraagd. Een aparte `voorraad_drempels`-collectie zou een join vereisen voor elke voorraadweergave zonder enig voordeel.

De Tappenmars-voorbeeld: voorraadrecord "Souvignier Gris 2025" met `aantal_huidig: 18`, `drempel_aantal: 24` → signaal "Souvignier Gris 2025 nadert einde voorraad (18 flessen, drempel 24)". Een record zonder ingevulde `drempel_aantal` valt terug op de globale standaard.

---

## 2. `inzichten`: GEEN opschoning — besloten door Thomas

**Gewijzigd besluit ten opzichte van het eerste concept.** Het schema blijft exact zoals het is, en er komt **geen opschoonregel**: Thomas wil year-over-year-vergelijking kunnen doen (bv. "hoe verliep de gisting dit jaar t.o.v. vorig jaar op dezelfde datum"), en dat is precies de use case die een 12-snapshot-limiet zou breken. Bij ~40 (type × onderwerp)-combinaties × 52 weken/jaar ≈ 2.080 records/jaar — bij meerdere jaren nog steeds een kleine tabel (tienduizenden records na een decennium), geen enkel praktisch probleem voor PocketBase/SQLite.

**Consequentie voor `scripts/bereken-inzichten.mjs`**: geen wijziging nodig — het script blijft precies zoals het nu is, gewoon wekelijks nieuwe records toevoegen zonder ooit iets te verwijderen.

**Consequentie voor Fase 3-vraag over de "waarom"-query**: de correlatietool (indien ooit gebouwd) kan hierdoor ook meerdere seizoenen teruglezen zonder gat in de historie — een prettige bijkomstigheid van dit besluit.

---

## 3. Nieuwe collectie: `app_instellingen` (operationele voorkeuren, gescheiden van `regelgeving_instellingen`)

**Besloten door Thomas, expliciet gescheiden van `regelgeving_instellingen`.** Die laatste collectie is gereserveerd voor wettelijk/officieel geverifieerde waarden (accijnstarief, AGP-drempel, zone-A-limieten) — elk record heeft een `laatst_gecontroleerd`-datum en `bron`-veld die een echte controle bij een officiële instantie impliceren. Een operationele voorkeur als "vanaf welk backup-leeftijd waarschuwen" heeft geen bron om te verifiëren en geen controlemoment — dat zou het contract van `regelgeving_instellingen` verwateren (een toekomstige lezer zou niet meer kunnen aannemen dat elk record daar geverifieerd is).

```
app_instellingen
  sleutel          text, required
  waarde           number
  eenheid          text
  notitie          text
  ...autodateFields()
```

Zelfde sleutel/waarde-vorm als `regelgeving_instellingen`, bewust géén `laatst_gecontroleerd`/`bron` (die zouden hier betekenisloos zijn — niets te verifiëren). Rechten: `AUTH_RULE` op alle vier (consistent met de rest van de kelder-/instellingen-collecties).

**Seed-waarden bij aanmaak**:

| `sleutel` | `waarde` | `eenheid` | Betekenis |
|---|---|---|---|
| `voorraad_drempel_standaard` | `12` | flessen | Globale voorraad-bijna-op-drempel voor wijnen zonder eigen `drempel_aantal` |
| `signaal_max_zichtbaar` | `6` | stuks | Plafond op de Vandaag-widget |
| `backup_waarschuwing_dagen` | `2` | dagen | Vanaf welke leeftijd van de laatste backup een signaal verschijnt — **verhuisd hierheen vanuit de hardcoded `2` in `index.tsx`/`meldingen.tsx`** |
| `agp_waarschuwing_percentage` | `80` | % | Vanaf welk percentage van de AGP-drempel gewaarschuwd wordt — **verhuisd hierheen vanuit de hardcoded `80` in `meldingen.tsx`**. De AGP-drempel zelf (de wettelijke hoeveelheid liters) blijft in `regelgeving_instellingen` — alleen het *waarschuwingspercentage* is een operationele keuze van Thomas. |

**Waarom de bestaande hardcoded drempels wél meeverhuizen (in tegenstelling tot het eerste concept)**: Thomas koos expliciet voor deze scheiding, en het verhuizen van de twee bestaande hardcoded waarden hoort logisch bij "nu eindelijk één plek voor operationele instellingen" — het zou raar zijn om de nieuwe instellingen wél in een generieke store te zetten en de oude twee daarbuiten te laten staan. Dit is een kleine, geïsoleerde refactor van bestaande, werkende code (twee getallen die van een letterlijke `2`/`80` naar een `fetch`-aanroep verhuizen) — laag risico, meegenomen in bouwstap 1/2.

---

## 4. Nieuwe collectie: `signaal_status` (server-side snooze/dismiss — besloten, niet meer voorwaardelijk)

**Besloten door Thomas**: server-side, niet localStorage. Reden: hij werkt op telefoon (in de wijngaard) én desktop, en localStorage is per apparaat/browser — iets wegklikken op de telefoon zou op de desktop weer terugkomen, en localStorage verdwijnt bovendien bij het legen van de cache.

```
signaal_status
  signaal_id     text, required     -- het stabiele signaal-id, bv. "onderhoud-<record-id>"
  actie          select, required  -- "gesnoozed" | "genegeerd"
  snooze_tot     text              -- yyyy-MM-dd, alleen bij "gesnoozed"
  gebruiker      relation -> users -- optioneel; app is bewust ook zonder login bruikbaar
  ...autodateFields()
```

Rechten: **`OPEN_RULE`** op alle vier — consistent met de rest van de app die bewust zonder login werkt (Fase 3/8-besluit), en snooze/dismiss is geen gevoelige actie die authenticatie rechtvaardigt.

**Query-index**: index op `signaal_id` (puntlookup bij het renderen van elk signaal, en om te bepalen of een status al bestaat vóór een upsert) en op `snooze_tot` (opschoning van verlopen snoozes).

**Migratie vanuit de bestaande localStorage-sleutel** (`wg.meldingen.afgevinkt.v1`): eenmalig bij het eerste laden van de Vandaag-widget, de bestaande lokale id's als `signaal_status`-records met `actie: "genegeerd"` wegschrijven (zie §6). Na een geslaagde migratie blijft de oude localStorage-sleutel *ongebruikt* staan (niet gewist) als terugvaloptie.

---

## 5. Optionele collectie: `signaal_analyses` — **uitgesteld tot na oogst 2026, ongewijzigd**

Alleen bouwen als en wanneer de AI-correlatietool daadwerkelijk gebouwd wordt. Vorm ongewijzigd t.o.v. het eerste concept:

```
signaal_analyses
  betrokken_signalen   json, required   -- snapshot van signaal-id's + samenvattingen
  redenering           text, required  -- opgeslagen AI-verklaring, nooit heropgevraagd
  model                text, required  -- bv. "claude-sonnet-5"
  gegenereerd_op        text, required  -- yyyy-MM-dd HH:mm
  vervalt_op            text, required  -- gegenereerd_op + 90 dagen
  ...autodateFields()
```

Rechten: `listRule`/`viewRule` = `OPEN_RULE`, `createRule`/`updateRule`/`deleteRule` = `null` (alleen de hook mag schrijven, zoals `agent_acties`). Bewaartermijn 90 dagen, daarna hard verwijderen — **enige onderdeel van dit datamodel dat hard verwijdert**, akkoord bevestigd door Thomas.

---

## 6. Migratiepad vanaf de huidige staat

**Niet-destructief en idempotent via `scripts/setup-pocketbase.mjs`.**

### Bestaande `inzichten`-records
Volledig ongewijzigd, geen opschoning (zie §2 — herzien besluit).

### Bestaande meldingen-state (localStorage `wg.meldingen.afgevinkt.v1` → `signaal_status`-collectie)
De Vandaag-widget vervangt `meldingen.tsx`. Bij eerste laden van de widget:
- Lees de oude localStorage-sleutel (array van id's).
- Voor elk id: `pb.collection("signaal_status").create({ signaal_id: id, actie: "genegeerd" })` — **eenmalig**, met een aparte migratie-vlag in localStorage (`wg.signalen.migratie_v2_gedaan`) zodat dit niet bij elke paginalaad opnieuw gebeurt en geen dubbele records ontstaat.
- Signaal-id's blijven bewust **identiek** aan de bestaande melding-id's (`onderhoud-<...>`, `backup-<...>`, etc.) — geen vertaling nodig.
- Oude localStorage-sleutel blijft staan (niet wissen) als terugvaloptie.

### Bestaande `agent_acties`-flow
Ongewijzigd — **bevestigd, geen schemawijziging nodig**: `bericht_id` is in het huidige schema al `required: false` (curl-geverifieerd op de live database, 24 juli 2026), dus een signaal kan direct een `agent_acties`-record aanmaken zonder tussenkomst van een AI-beurt. De eerder gevreesde "misschien moet dit veld optioneel gemaakt worden" (Fase 4-vraag 11) is dus al opgelost — geen actie nodig in bouwstap 5.

De eerder gemelde frontend/backend-drift (`onderhoud`/`order` ontbraken in `AGENT_ACTIE_CONFIG`) is **al gefixt** (losstaande bugfix, 24 juli 2026, commit `9a4ac67`), dus dat blokkeert bouwstap 5 niet meer.

---

## 7. Bewaartermijnen en opschoning (samengevat, herzien)

| Data | Bewaartermijn | Methode | Wie draait het |
|---|---|---|---|
| `inzichten` | **Onbeperkt** (herzien besluit) | Geen opschoning | — |
| `signaal_status` | Verlopen snoozes (`snooze_tot < vandaag`) | Hard verwijderen | Client-side sweep bij laden van de widget (klein aantal records, geen apart proces nodig) |
| `signaal_analyses` (indien gebouwd) | 90 dagen | Hard verwijderen zodra `vervalt_op < vandaag` | Sweep in het correlatie-endpoint zelf, bij elke aanroep (geen los proces) |
| Regel-signalen zelf | N.v.t. | Worden niet opgeslagen | — |

**Geen enkel opschoonproces in dit ontwerp draait als los gepland script** — allemaal gekoppeld aan een bestaande aanroep (client-laden, of het correlatie-endpoint zelf) — leert direct van de Fase 9-bevinding dat losse crons op deze machine niet vuren.

---

## 8. Verwachte datagroei per jaar (normaal gebruik, herzien)

| Collectie | Groei/jaar | Toelichting |
|---|---|---|
| `inzichten` | ~2.080 records/jaar, onbeperkt cumulatief | Klein genoeg voor SQLite over meerdere decennia; dit is expliciet gewenst (jaar-op-jaar) |
| `voorraad_flessen.drempel_aantal` | 0 nieuwe records | Alleen een veld op bestaande records |
| `app_instellingen` | +4 records eenmalig | Instellingssleutels, groeien niet |
| `signaal_status` | Enkele tientallen tegelijk, verlopen snoozes opgeruimd | Netto begrensd |
| `signaal_analyses` (indien gebouwd) | ~15-20 records/oogstmaand, begrensd op 90 dagen ≈ max. ~60 tegelijk | Alleen tijdens actief seizoen, hard opgeschoond |

Conclusie: **nog steeds verwaarloosbare groei**, ook na het loslaten van de inzichten-limiet — SQLite/PocketBase heeft geen moeite met een tabel van enkele tienduizenden simpele records.

---

## 9. Query-patronen van het dashboard

| Vraag | Query | Index nodig? |
|---|---|---|
| "Welke tanks stagneren?" | `inzichten` waar `inzicht_type = "gisting_snelheid"` en `deleted != true`, sorteer `-berekend_op`, `limit` op recente records | Bestaande sortering volstaat; met onbeperkte groei wordt een `limit` op de query belangrijker dan bij de eerdere 12-snapshot-aanname — **client-side query moet expliciet een periode/limiet meegeven**, niet de hele tabel ophalen |
| "Welk onderhoud komt eraan?" | `onderhoudslog` (bestaande `fetchOnderhoud` + client-filter) | Geen — bestaande query |
| "Welke voorraad is bijna op?" | `voorraad_flessen` waar `aantal_huidig < (drempel_aantal ?? standaard uit app_instellingen)` — client-side filter | Geen nieuwe index nodig |
| "Welke taken vervallen?" | `kelderlog` waar `notitie` begint met `"TAAK:"` (bestaand) | Geen |
| "Wat is de backup-status?" | `regelgeving_instellingen` waar `sleutel = "laatste_backup"` | Geen — puntlookup |
| "Wat is de backup-waarschuwingsdrempel?" | `app_instellingen` waar `sleutel = "backup_waarschuwing_dagen"` | Geen — puntlookup |
| "Snooze-status van signaal X" | `signaal_status` waar `signaal_id = {:id}` | **Nieuwe index op `signaal_id`** |

**Belangrijke aanscherping door het loslaten van de inzichten-limiet**: de `zoek_inzichten`-achtige queries (en de nieuwe stagnatie-signaalproducent) moeten voortaan expliciet een `sort + limit` of een datumfilter meegeven (bv. "laatste 8 weken") in plaats van blind alles op te halen — dat was met een 12-snapshot-limiet vanzelf begrensd, nu niet meer. Dit is een concreet aandachtspunt voor bouwstap 1/2, geen architectuurwijziging.

---

## Drie belangrijkste datamodel-keuzes (herzien)

1. **Bijna geen nieuw schema, maar wél twee nieuwe collecties die eerst voorwaardelijk waren**: `app_instellingen` (scheidt operationele voorkeuren van wettelijk geverifieerde waarden) en `signaal_status` (server-side, want Thomas werkt op meerdere apparaten).
2. **`inzichten` blijft historie zonder limiet** — bewuste keuze vóór jaar-op-jaar-inzicht boven opslagzuinigheid, met als consequentie dat queries voortaan zelf hun venster moeten begrenzen.
3. **Twee "voorbereidende" onzekerheden zijn al opgelost vóór de bouw begint**: `bericht_id` is al optioneel (geen schemawijziging nodig voor taak-promotie) en de config-drift-bug is al gefixt — bouwstap 5 kan zonder vooronderzoek beginnen.
