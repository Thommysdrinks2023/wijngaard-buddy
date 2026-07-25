# Tappenmars Buddy — Systeemontwerp

**Versie 1.1 — 4 juli 2026** (v1.0: 2 juli 2026)
Technische specificatie voor de uitbouw van Wijngaard Buddy naar een modulair bedrijfsdashboard voor De Tappenmars (Den Ham). Bedoeld als werkdocument voor ontwikkelsessies met Claude Code / Claude Cowork.

> **Let op — dit document beschrijft het oorspronkelijke ontwerp, niet altijd de uiteindelijk gebouwde versie.** Sinds v1.0 zijn Fase 0–2, de kelder-uitbreiding, AI-agent Fase 3 en Fase 4 (botteling & voorraad) gebouwd, soms met bewuste afwijkingen van dit document (bijv. het drie-collecties-model voor botteling i.p.v. de `bottelingen`+`voorraad_mutaties`-schets in §1.7, en overhevelen als één tankboekregel i.p.v. twee in §1.4). Bij tegenspraak wint de werkelijke, geteste codebase — zie `WERKLOG.md` (Blok 0, nulmeting) en de `DECISIONS-*.md`-bestanden voor de precieze, geverifieerde staat. Het changelog onderaan dit document volgt vanaf v1.1 de daadwerkelijke ontwerpbeslissingen.

---

## 0. Kernbeslissing vooraf: de partij als spil

Voordat de modules worden uitgewerkt, één ontwerpbeslissing die alles bepaalt: tussen de wijngaard en de kelder hoort een **partij** (wijnbatch) te zitten. Dit concept ontbreekt in de modulewensen, maar zonder partij loopt het datamodel vast:

- Een oogst kan **niet rechtstreeks aan een tank** gekoppeld worden, want wijn verhuist tussen tanks (overhevelen), wordt geblend, en de tank is hergebruikbaar. Als analyses aan een tank hangen, raak je de meetgeschiedenis kwijt zodra de wijn wordt overgeheveld.
- Een **partij** is de constante: "Johanniter 2026" of "Rosé-blend 2026". Tanks zijn tijdelijke huisvesting; het tankboek registreert de verhuizingen; analyses en bottelingen horen bij de partij.

**Regel voor het hele ontwerp:** analyses, logboekregels en bottelingen relateren primair aan `partij`; de tank is een momentopname (snapshot) die je erbij vastlegt voor de historie.

---

## 1. Datamodel

### 1.1 Bestaand (wijngaardmodule — ongewijzigd)

Voor context: `rijen`, `metingen`, `observaties`, `fenologie`, `gezondheid`, `oogst`, `werkuren` (incl. spuitregistratie), `steekproef_planten`, `steekproef_metingen`, `werkkalender`, `notities`, `lab` (bodem-/sapanalyses), `rij_locaties`, `ai_gesprekken`, `vineyard_settings`. Alle datacollecties hebben al een `vineyard_id`-tekstveld (multi-tenant-voorbereiding) en `created`/`updated` autodate-velden.

**Conventies die de nieuwe collecties overnemen** (consistentie met `scripts/setup-pocketbase.mjs`):

- `datum` als text-veld `yyyy-MM-dd` (zoals bestaand — zie risico 7.5), `seizoen` als integer
- `ingevoerd_door` als text
- `notitie` als text, `foto`/`bestand` als file-veld waar zinvol
- API-rules: `AUTH_RULE` op alle operaties
- `vineyard_id` (text) op elke nieuwe collectie
- autodate-velden `created`/`updated`

### 1.2 Nieuwe collectie: `partijen`

| Veld             | Type                   | Opmerking                                                                        |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `naam`           | text, required         | bijv. "Johanniter 2026"                                                          |
| `jaargang`       | number (int), required | oogstjaar                                                                        |
| `type`           | select (1)             | `wit`, `rood`, `rosé`, `mousserend`, `overig`                                    |
| `status`         | select (1), required   | `most`, `gisting`, `opvoeding`, `klaar_voor_botteling`, `gebotteld`, `afgevoerd` |
| `samenstelling`  | text                   | vrije beschrijving van rassen/blend-verhoudingen                                 |
| `start_volume_l` | number                 | volume bij aanvang (na persen)                                                   |
| `notitie`        | text                   |                                                                                  |

**Koppeling met de wijngaard:** voeg aan de bestaande collectie `oogst` één optioneel veld toe: `partij` (relation → `partijen`, maxSelect 1, cascadeDelete false). Zo stroomt de oogst door zonder de bestaande module te wijzigen — oude records blijven geldig (veld leeg), nieuwe oogsten wijs je toe. Een blend van meerdere rassen ontstaat vanzelf doordat meerdere oogstrecords naar dezelfde partij wijzen.

> **Open vraag voor Thomas:** wil je één oogstrecord ooit over twee partijen kunnen splitsen (bijv. deel naar rosé, deel naar rood)? Zo ja, dan is een koppeltabel `partij_oogst` (oogst, partij, kg) nodig i.p.v. het relatieveld. Advies: begin met het relatieveld; splitsen kun je ook oplossen door twee oogstrecords in te voeren.

### 1.3 Nieuwe collectie: `tanks` (module Wijnkelder / Tankbeheer)

| Veld              | Type                      | Opmerking                                                                   |
| ----------------- | ------------------------- | --------------------------------------------------------------------------- |
| `code`            | text, required            | uniek label, bijv. "T01", "B03" (barrique)                                  |
| `naam`            | text                      | vriendelijke naam                                                           |
| `materiaal`       | select (1), required      | `rvs`, `kunststof`, `glas`, `hout_barrique`, `hout_foeder`, `ibc`, `overig` |
| `capaciteit_l`    | number, required          |                                                                             |
| `status`          | select (1), required      | `leeg`, `in_gebruik`, `reiniging`, `defect`, `afgestoten`                   |
| `huidige_partij`  | relation → `partijen` (1) | **afgeleide waarde** — zie kader hieronder                                  |
| `huidig_volume_l` | number                    | **afgeleide waarde**                                                        |
| `locatie`         | text                      | bijv. "kelder links", "schuur"                                              |
| `notitie`         | text                      |                                                                             |

> **Ontwerpbeslissing (belangrijk):** de actuele inhoud van een tank is in theorie afleidbaar uit het tankboek (som van alle mutaties). Toch worden `huidige_partij` en `huidig_volume_l` **denormaliseerd op de tank opgeslagen**, omdat elk scherm anders bij elke weergave het hele tankboek moet doorrekenen. De regel: **het tankboek is de bron van waarheid; de tank-velden zijn cache.** Een PocketBase JS-hook (`onRecordCreate` op `tankboek`) werkt de tankvelden bij. Bouw daarnaast één "herbereken"-functie die de cache vanuit het tankboek reconstrueert — die draai je bij twijfel of na handmatige correcties.

### 1.4 Nieuwe collectie: `tankboek` (module Tankboek)

Elke regel is één mutatie. **Regels worden nooit gewijzigd of verwijderd** — fouten herstel je met een correctieboeking (audit-principe, ook relevant voor de wettelijke functie, zie §5).

| Veld                | Type                                | Opmerking                                                                                                                                                      |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datum`             | text `yyyy-MM-dd`, required         |                                                                                                                                                                |
| `tijd`              | text `HH:mm`                        | optioneel, voor volgorde op één dag                                                                                                                            |
| `tank`              | relation → `tanks` (1), required    | de tank waarop dit boekstuk slaat                                                                                                                              |
| `partij`            | relation → `partijen` (1), required |                                                                                                                                                                |
| `actie`             | select (1), required                | `vullen`, `overhevelen_in`, `overhevelen_uit`, `toevoeging`, `aftappen_monster`, `bottelen`, `verlies_verdamping`, `verlies_droesem`, `reiniging`, `correctie` |
| `volume_l`          | number, required                    | **getekend**: positief = erin, negatief = eruit; `reiniging` = 0                                                                                               |
| `van_tank`          | relation → `tanks` (1)              | alleen bij `overhevelen_in`                                                                                                                                    |
| `naar_tank`         | relation → `tanks` (1)              | alleen bij `overhevelen_uit`                                                                                                                                   |
| `omschrijving`      | text                                | aard van de verrichting / gebruikt middel                                                                                                                      |
| `verantwoordelijke` | text, required                      | wie de handeling uitvoerde                                                                                                                                     |
| `kelderlog_ref`     | relation → `kelderlog` (1)          | koppeling als de regel uit een logboekactie voortkomt                                                                                                          |
| `bijlage`           | file                                | weegbon, foto, etc.                                                                                                                                            |

**Overhevelen = twee regels** (uit tank A: `overhevelen_uit`, negatief volume, `naar_tank` = B; in tank B: `overhevelen_in`, positief volume, `van_tank` = A). Laat de UI dit als één formulier aanbieden dat beide records atomisch aanmaakt via één PocketBase-hook-endpoint, zodat er nooit een halve overheveling in de boeken staat.

### 1.5 Nieuwe collectie: `analyses` (module Analyses)

Bewust gescheiden van de bestaande `lab`-collectie: `lab` = wijngaard (bodem/sap, YAN/NPK), `analyses` = kelder (wijn in bewerking). Samenvoegen zou beide formulieren en de bestaande data compliceren.

| Veld                | Type                                | Opmerking                                                         |
| ------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `datum`             | text, required                      |                                                                   |
| `partij`            | relation → `partijen` (1), required | primaire as voor grafieken over tijd                              |
| `tank`              | relation → `tanks` (1)              | snapshot: waar de partij op dat moment lag                        |
| `so2_vrij`          | number                              | mg/L                                                              |
| `so2_totaal`        | number                              | mg/L                                                              |
| `restsuiker_g_l`    | number                              | g/L                                                               |
| `alcohol_pct`       | number                              | % vol                                                             |
| `tz_g_l`            | number                              | titreerbare zuurgraad, g/L (wijnsteenzuur-equivalent)             |
| `vluchtig_zuur_g_l` | number                              | g/L (azijnzuur-equivalent)                                        |
| `ph`                | number                              |                                                                   |
| `dichtheid`         | number                              | SG of °Oechsle — kies één eenheid en documenteer die in CLAUDE.md |
| `methode`           | select (1)                          | `eigen_meting`, `extern_lab`                                      |
| `bestand`           | file                                | labrapport-PDF                                                    |
| `notitie`           | text                                |                                                                   |
| `ingevoerd_door`    | text                                |                                                                   |

### 1.6 Nieuwe collectie: `kelderlog` (module Logboeken)

Generiek werklogboek voor de kelder, analoog aan `werkuren` in de wijngaard maar zonder de uren-verplichting.

| Veld             | Type                      | Opmerking                                                                                                                                                                   |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datum`          | text, required            |                                                                                                                                                                             |
| `partij`         | relation → `partijen` (1) | minstens één van partij/tank verplicht (UI-validatie)                                                                                                                       |
| `tank`           | relation → `tanks` (1)    |                                                                                                                                                                             |
| `actie`          | select (1), required      | `gisting_start`, `gisting_einde`, `roeren_batonnage`, `overhevelen`, `filtreren`, `klaring`, `toevoeging`, `koude_stabilisatie`, `persen`, `proeven`, `reiniging`, `overig` |
| `middel`         | text                      | bijv. "kaliumdisulfiet", "bentoniet", gistnaam                                                                                                                              |
| `hoeveelheid`    | number                    |                                                                                                                                                                             |
| `eenheid`        | select (1)                | `g`, `kg`, `ml`, `l`, `g_hl`, `mg_l`                                                                                                                                        |
| `notitie`        | text                      |                                                                                                                                                                             |
| `foto`           | file                      |                                                                                                                                                                             |
| `ingevoerd_door` | text                      |                                                                                                                                                                             |

**Koppeling met tankboek:** acties die het volume of de samenstelling wettelijk relevant wijzigen (`overhevelen`, `toevoeging`, `filtreren` met verlies) horen óók in het tankboek. Laat het kelderlog-formulier bij die acties aanbieden om direct een tankboekregel mee te genereren (met `kelderlog_ref` terugverwijzend), zodat je niet twee keer hoeft in te voeren.

### 1.7 Nieuwe collecties: `bottelingen` en `voorraad_mutaties` (module Flessen-/botteladmin)

**`bottelingen`** — één record per bottelronde:

| Veld             | Type                                | Opmerking                                   |
| ---------------- | ----------------------------------- | ------------------------------------------- |
| `datum`          | text, required                      |                                             |
| `partij`         | relation → `partijen` (1), required |                                             |
| `tank`           | relation → `tanks` (1), required    | brontank                                    |
| `lotnummer`      | text, required                      | zie §5 voor conventie-advies                |
| `aantal_flessen` | number (int), required              |                                             |
| `fles_inhoud_l`  | number, required                    | default 0.75                                |
| `restvolume_l`   | number                              | wat er niet in flessen paste (verlies/rest) |
| `notitie`        | text                                |                                             |
| `ingevoerd_door` | text                                |                                             |

Een botteling genereert automatisch (via hook of atomisch endpoint): één `tankboek`-regel (`bottelen`, negatief volume = aantal × inhoud + restvolume) en één positieve `voorraad_mutaties`-regel.

**`voorraad_mutaties`** — voorraad is nooit een los getal dat je overschrijft, maar de som van mutaties:

| Veld             | Type                                   | Opmerking                                                                          |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `datum`          | text, required                         |                                                                                    |
| `botteling`      | relation → `bottelingen` (1), required | voorraad wordt per lot bijgehouden                                                 |
| `type`           | select (1), required                   | `botteling`, `verkoop`, `eigen_gebruik`, `proeverij`, `gift`, `breuk`, `correctie` |
| `aantal`         | number (int), required                 | getekend: `botteling` positief, rest negatief (of positief bij correctie)          |
| `notitie`        | text                                   |                                                                                    |
| `ingevoerd_door` | text                                   |                                                                                    |

Voorraad per wijn/jaargang = groeperen op `botteling.partij` + `botteling.lotnummer` en `aantal` sommeren. Dit geeft gratis traceerbaarheid per lot (relevant bij een terugroepactie, zie §5).

### 1.8 Relatieschema (overzicht)

```
rijen ──< oogst >── partijen ──< analyses
                        │
                        ├──< tankboek >── tanks (van_tank/naar_tank zelfreferentie)
                        ├──< kelderlog >── tanks
                        └──< bottelingen ──< voorraad_mutaties
                                  │
                                  └── tanks (bron)
```

De pijl van wijngaard naar kelder is dus precies één veld (`oogst.partij`); al het overige is nieuw en raakt de bestaande module niet.

---

## 2. Navigatiestructuur

### 2.1 Uitgangspunt: niets breken

De bestaande routes (`/dashboard`, `/rij/$rijId`, `/assistent`, `/lab`, enz.) blijven staan waar ze staan. Wijngaard Buddy is met TanStack Router file-based routing gebouwd; routes verplaatsen betekent elke `Link`, elk bookmark en de PWA-shortcuts aanpassen. Dat is fase-0-risico zonder waarde.

**In plaats daarvan:** het startscherm (`/`) wordt de **modulekiezer** met tegels, en alle nieuwe kelderfunctionaliteit komt onder een eigen prefix.

### 2.2 Routestructuur

```
/                          → modulekiezer (tegels: Wijngaard, Kelder, Voorraad, Assistent)
/wijngaard                 → bestaand hoofdmenu van Wijngaard Buddy (huidige startpagina-inhoud)
  (alle bestaande routes blijven op hun huidige pad)
/kelder                    → kelderdashboard: tankoverzicht als tegels/kaarten
/kelder/tanks               → tankbeheer (CRUD)
/kelder/tanks/$tankId       → tankdetail: huidige inhoud + tankboek van die tank
/kelder/tankboek            → volledig tankboek (filterbaar op tank/partij/periode)
/kelder/partijen            → partijenoverzicht
/kelder/partijen/$partijId  → partijdetail: analyses-grafiek, logboek, herkomst (oogstrecords)
/kelder/analyses            → analyse-invoer + overzicht
/kelder/logboek             → kelderlog-invoer + overzicht
/kelder/bottelen            → bottelrondes
/voorraad                   → voorraadoverzicht per wijn/jaargang/lot + mutatie-invoer
/assistent                  → bestaand, krijgt kelderkennis (zie §6)
```

In TanStack Router betekent dit simpelweg nieuwe bestanden onder `src/routes/kelder/` en `src/routes/voorraad.tsx`; de bestaande `index.tsx` verhuist inhoudelijk naar `wijngaard.tsx` en wordt vervangen door de modulekiezer.

### 2.3 Modulekiezer-scherm

Vier grote tegels (zelfde stijl als de bestaande menugroepen in `instellingen.tsx`): **🌿 Wijngaard**, **🍷 Kelder**, **🍾 Voorraad**, **✨ Assistent**. Elke tegel toont één live-statistiekje (bijv. Kelder: "4 tanks in gebruik · 2.140 L"). Onthoud de laatst gekozen module in `localStorage` en bied een instelling "start direct in module X" — in het seizoen wil je in twee tikken bij de meetinvoer zijn.

---

## 3. Afhankelijkheden tussen modules

| Module                     | Vereist eerst                         | Waarom                                                                 |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Partijen (nieuw fundament) | —                                     | Spil van alles; zonder partij geen zinvolle tank, analyse of botteling |
| Tankbeheer                 | Partijen                              | Een tank "in gebruik" verwijst naar een partij                         |
| Tankboek                   | Tanks + Partijen                      | Elke regel verwijst naar beide                                         |
| Analyses                   | Partijen (Tanks handig, niet vereist) | Analyse hangt aan de partij; tank is snapshot                          |
| Logboeken                  | Tanks + Partijen                      | Verwijst naar beide; koppelt optioneel aan tankboek                    |
| Bottelen                   | Tankboek                              | Botteling genereert een tankboekregel                                  |
| Voorraad                   | Bottelen                              | Voorraad ontstaat uit bottelingen                                      |
| AI-agent-uitbreiding       | Alles waarop hij moet antwoorden      | Tools zijn read-only views op bestaande data                           |

Twee praktische consequenties: **Analyses kan parallel aan Tankboek gebouwd worden** (alleen afhankelijk van partijen), en **Voorraad is bewust laatst** — vóór de eerste botteling (najaar/winter na de oogst) is er niets te administreren.

---

## 4. Gefaseerd bouwplan

Elke fase levert iets op dat je meteen echt gebruikt; geen fase bouwt op onaf werk uit een vorige.

**Fase 0 — Fundament (1 sessie).** Modulekiezer op `/`, bestaande startpagina naar `/wijngaard`. Collectie `partijen` + veld `oogst.partij` (uitbreiden van `setup-pocketbase.mjs` met `ensureCollection`/`ensureVelden`, exact volgens het bestaande idempotente patroon). Simpel partijenoverzicht onder `/kelder/partijen`. _Opgeleverd: app voelt als dashboard; oogst 2026 kan aan partijen worden toegewezen._

**Fase 1 — Tankbeheer (1 sessie).** Collectie `tanks`, CRUD-schermen, kelderdashboard met tankkaarten (code, materiaal, capaciteit, status, inhoud). `huidige_partij`/`huidig_volume_l` in deze fase nog handmatig invulbaar — de hook komt in fase 2. _Opgeleverd: digitale kelderinventaris._

**Fase 2 — Tankboek (1–2 sessies).** Collectie `tankboek` + PocketBase-hook die tankcache bijwerkt + atomisch overhevel-endpoint (`pb_hooks/tankboek.pb.js`, zelfde stijl als de assistent-hook). UI: mutatie-invoer per tank, chronologisch overzicht met filters, "herbereken"-knop in instellingen. Handmatige invoer van `huidige_partij` op de tank wordt hier uitgezet: vanaf nu muteert alleen de hook die velden. _Opgeleverd: sluitende volumeadministratie._

**Fase 3 — Analyses (1 sessie).** Collectie `analyses`, invoerformulier (patroon van `lab.tsx` hergebruiken), grafieken per partij over tijd (SO₂, restsuiker, TZ, vluchtig zuur — recharts staat er al in). _Opgeleverd: wijnontwikkeling volgen per partij._

**Fase 4 — Logboeken (1 sessie).** Collectie `kelderlog`, invoer + overzicht, en de doorkoppeling "maak ook tankboekregel" bij volumerelevante acties. _Opgeleverd: compleet kelderdagboek._

**Fase 5 — Bottelen & voorraad (1–2 sessies).** Collecties `bottelingen` + `voorraad_mutaties`, bottelformulier met automatische tankboek- en voorraadregel, voorraadoverzicht per wijn/jaargang/lot. _Opgeleverd: van tank tot fles geadministreerd._

**Fase 6 — AI-agent (1 sessie).** Nieuwe read-only tools (zie §6). _Opgeleverd: assistent die over kelder én wijngaard antwoordt._

Voor elke fase geldt het bestaande projectprincipe: eerst schema-migratie in het setup-script, dan hook curl-testen, dan pas frontend. Neem ook de **offline sync-wachtrij** mee: `src/lib/sync.ts` kent per collectie een `SyncSoort` — nieuwe kelderinvoer die offline gebeurt moet daar bij (al is offline in de kelder minder kritiek dan in het veld; besluit per collectie of offline-invoer nodig is — advies: wel voor `kelderlog` en `analyses`, niet voor `tankboek`/`bottelingen` omdat die hooks server-side atomiciteit vereisen).

---

## 5. Aandachtspunten tankboek: Nederlandse registratieplicht

> ⚠️ **Disclaimer vooraf:** dit is een inschatting op basis van algemene kennis van EU- en NL-regelgeving, geen juridisch advies. De regels verschillen wezenlijk tussen hobbyproductie voor eigen gebruik en (ook kleinschalige) verkoop. **Verifieer alles hieronder zelf** bij de Douane (accijns), RVO en NVWA, en bij de vereniging Wijnbouwers der Lage Landen — die heeft praktijkervaring met precies deze schaal.

**Aanname 1 — accijns/AGP (checken bij Douane).** Zodra je wijn verkoopt of bedrijfsmatig produceert, krijg je te maken met de Wet op de accijns; producenten hebben doorgaans een vergunning accijnsgoederenplaats (AGP) nodig met bijbehorende voorraadadministratie: per soort en per tank het volume, alle in- en uitslagen, en verliezen (verdamping, droesem) verantwoord. Het ontworpen tankboek dekt dit patroon: getekende volumemutaties, verliesregels als expliciete acties, en onwijzigbare regels met correctieboekingen.

**Aanname 2 — EU-wijnbouwregisters (checken bij RVO).** EU-verordening 2018/273 verplicht wijnproducenten tot in- en uitslagregisters en registratie van oenologische procedés (o.a. verrijking, aanzuring/ontzuring, zwaveling, klaring), doorgaans binnen enkele werkdagen na de verrichting. Kleine producenten kennen vrijstellingen onder een productiedrempel — of De Tappenmars daaronder valt moet je nagaan. De combinatie tankboek + kelderlog (met `middel`, `hoeveelheid`, `eenheid`) dekt de registratie-inhoud; de wettelijke _termijn_ is een werkwijze-afspraak, geen datamodelkwestie.

**Aanname 3 — traceerbaarheid/lotnummers (checken bij NVWA).** Bij verkoop geldt de Algemene Levensmiddelenverordening: één stap terug, één stap vooruit traceerbaar. Het lotnummer op de fles moet herleidbaar zijn naar partij en tank — dat is precies wat `bottelingen.lotnummer` → `partij` → `tankboek` → `oogst` → `rijen` oplevert, tot op rijniveau in de wijngaard. Conventie-advies voor lotnummers: `L<jaargang>-<partijcode>-<volgnummer>`, bijv. `L26-JOH-01`.

**Velden die het ontwerp hiervoor al bevat:** datum, aard van de verrichting (actie + omschrijving), volume met richting, herkomst/bestemming (van_tank/naar_tank, partij), verantwoordelijke, bijlage. **Wat bewust níét is opgenomen** (pas toevoegen als de check daarom vraagt): douane-goederencodes, verzegelingsnummers, aangiftenummers accijns.

---

## 6. Uitbreiding van de AI-agent

### 6.1 Huidige situatie eerlijk benoemd

Er zijn nu **twee generaties** assistent-code: `src/lib/assistent.ts` roept de Anthropic API nog rechtstreeks vanuit de browser aan (met `VITE_ANTHROPIC_API_KEY` in de bundel — in het bestand zelf al als beveiligingsrisico gemarkeerd), terwijl de server-side proxy-hook (`pb_hooks/assistent.pb.js` met `get_rijen_info`, `get_metingen`, `get_fenologie`, `get_oogst`) de beoogde architectuur is. **Maak de afronding van die hook-migratie onderdeel van fase 6** — zeker vóór de Pi publiek via `pb.tappenmars.nl` bereikbaar is, want dan staat die sleutel anders op internet.

### 6.2 Nieuwe tools (allemaal read-only)

Zelfde patroon als de bestaande vier: JS-hook, `$app.findRecordsByFilter`, compacte samenvatting terug (nooit ruwe recorddumps — tokenbudget).

| Tool            | Input                                               | Output (samengevat)                                               |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `get_partijen`  | `status?`, `jaargang?`                              | per partij: naam, status, samenstelling, actueel volume + tank(s) |
| `get_tanks`     | `status?`                                           | per tank: code, materiaal, capaciteit, inhoud, partij             |
| `get_tankboek`  | `tank_code?`, `partij?`, `van_datum?`, `tot_datum?` | laatste N mutaties + volumesaldo over de periode                  |
| `get_analyses`  | `partij`, `parameter?`                              | meetreeks over tijd, of laatste volledige analyse                 |
| `get_kelderlog` | `partij?`, `tank_code?`, `actie?`                   | laatste N logregels                                               |
| `get_voorraad`  | `jaargang?`                                         | flessen per wijn/lot, gesommeerd uit mutaties                     |

Breid het systeemprompt-deel van de hook uit met kelderdomein: de tanklijst met codes (stabiel → prompt-cachebaar, zoals de huidige `bouwSysteemPrompt`), en gedragsregels ("bij vragen over SO₂-doseringen: reken voor, maar adviseer altijd na-meting"). De agent blijft **strikt read-only**; schrijvende tools (bijv. "boek deze overheveling") zijn een aparte, latere beslissing met eigen validatielaag — conform het projectprincipe.

### 6.3 Toolregistratie schaalbaar maken

Met 10+ tools wordt één groot hook-bestand onhandelbaar. Structureer `assistent.pb.js` als een tool-registry: één object `{ naam: { schema, handler } }` per module (wijngaard-tools, kelder-tools), waaruit zowel de `tools`-array voor de API-call als de dispatch bij `tool_use` wordt opgebouwd. Dan is een module toevoegen één bestand met tooldefinities, geen chirurgie in de proxy-logica.

---

## 7. Risico's en aandachtspunten

**7.1 Tankinhoud-cache loopt uit de pas (grootste risico).** Elke schrijfroute die het tankboek omzeilt (handmatige edit in de PocketBase-admin, mislukte hook) maakt `huidig_volume_l` onbetrouwbaar. Mitigatie: alle tankboek-schrijfacties via het atomische endpoint, tankvelden read-only in de UI, herbereken-functie, en een nachtelijke consistentiecheck in de hook die afwijkingen logt.

**7.2 Partij overslaan "omdat het simpeler lijkt".** De verleiding bestaat om analyses direct aan tanks te hangen. Dat werkt tot de eerste overheveling — daarna is de meetgeschiedenis van een wijn verspreid over tanks en niet meer te reconstrueren. Niet doen; de partij is niet-onderhandelbaar.

**7.3 Boeksaldo ≠ fysieke werkelijkheid.** Verdamping, droesemverlies en meetslordigheid maken dat de som van mutaties afwijkt van wat er echt in de tank zit. Daarom bestaan de acties `verlies_*` en `correctie`: het verschil wordt geboekt, nooit stilletjes overschreven. Bouw in de UI een "peiling"-flow: voer gemeten volume in → app stelt de correctieboeking voor.

**7.4 Selects te vroeg dichttimmeren.** Actie- en materiaallijsten zijn nu selects (goedkoop, consistent), maar na een seizoen praktijk komen er waarden bij. Het bestaande migratiepatroon in `setup-pocketbase.mjs` (het ras-select-update-blok) is hiervoor het voorbeeld: selects bijwerken is een gecontroleerde schema-migratie, geen vrij tekstveld.

**7.5 Datum als tekst.** Het bestaande `yyyy-MM-dd`-textpatroon sorteert correct en blijft daarom gehandhaafd voor consistentie. Let op bij het tankboek: binnen één dag bepaalt `tijd` + `created` de volgorde — relevant zodra twee mutaties op dezelfde tank op dezelfde dag vallen.

**7.6 Atomiciteit van samengestelde boekingen.** Overhevelen (2 regels), bottelen (3 records in 3 collecties): als de client die los aanmaakt en halverwege offline valt, is de administratie corrupt. Daarom lopen deze via server-side hook-endpoints die alles-of-niets uitvoeren, en staan deze collecties bewust níét in de offline sync-wachtrij.

**7.7 `vineyard_id` vergeten op nieuwe collecties.** De multi-tenant-voorbereiding is alleen wat waard als élke nieuwe collectie het veld meekrijgt en elke insert het vult — neem dit op als harde regel in CLAUDE.md.

**7.8 Wettelijke eisen achteraf inpassen.** Als uit de checks van §5 extra velden volgen (bijv. accijnscodes), is dat met `ensureVelden` triviaal — mits de tankboekregels tegen die tijd volledig en onwijzigbaar zijn bijgehouden. Begin dus vanaf dag één met de correctieboeking-discipline, ook al voelt regel-editen makkelijker.

**7.9 Backup (toegevoegd in v1.1, Eindsprint Blok C).** `pb_data` wordt dagelijks gezipt met 7-daagse/4-wekelijkse/12-maandelijkse rotatie (`scripts/backup-pocketbase.ps1`, Taakplanner-taak "Wijngaard PocketBase Backup"). De herstelprocedure is gedocumenteerd én daadwerkelijk getest (wegwerpinstantie, collecties geverifieerd) — zie `docs/backup.md`. Openstaand risico: de backups staan nog op dezelfde schijf als de server; de offsite-scenario's (externe schijf, Pi→VPS, VPS→Storage Box) staan klaar in datzelfde document maar vereisen hardware/toegang die Thomas moet regelen.

**7.10 Rate limiting op de AI-agent (toegevoegd in v1.1, Eindsprint Blok C).** Alle drie de `/api/agent/*`-endpoints (bericht, bevestig, afwijzen — elk kost een betaalde Claude-aanroep) tellen per IP in het gedeelde Go-side app-store: standaard 30 per uur, instelbaar via een `regelgeving_instellingen`-record met sleutel `agent_berichten_per_uur_per_ip`. Overschrijding geeft HTTP 429 met een Nederlandse melding inclusief wachttijd; ook ongeldige requests tellen mee (probing is niet gratis). De teller reset bij een PocketBase-herstart — acceptabel voor een kostenrem. Curl-getest met een tijdelijk verlaagde limiet: 3 pogingen passeren, de vierde krijgt 429, en bevestig/afwijzen delen aantoonbaar dezelfde teller. Hiermee is het "AI-agent-endpoint zonder rate-limit"-risico uit CLAUDE.md/STATUS-RAPPORT gedekt vóór publieke bereikbaarheid.

**Herverificatie 25 juli 2026 (Fase 12 Blok 3).** Aanleiding: `AUDIT-VELDGEREEDHEID.md` §5.4 noemde de rate limit niet, wat de vraag opriep of hij nog bestond. Hij bestaat en werkt. Ditmaal getest op de **werkelijke** instelling van 30/uur in plaats van een verlaagde testlimiet: 28 pogingen passeerden, de 29e kreeg HTTP 429 — kloppend, want er waren die sessie al twee echte agent-aanroepen gedaan — en `/bevestig` en `/afwijzen` gaven direct daarna óók 429, wat bevestigt dat de drie endpoints één teller delen. Melding: _"Je hebt de limiet van 30 assistent-berichten per uur bereikt. Probeer het over ongeveer 52 minuten opnieuw."_ De limiet is uitgeput met ongeldige requests, die vóór de Claude-aanroep worden geweigerd maar wél meetellen — dat werkt dus zoals bedoeld.

**Nuance die hier eerder ontbrak en die zwaarder weegt dan de limiet zelf**: de teller loopt **per IP-adres** en de endpoints hebben nog steeds **geen `requireAuth()`**. Bij publieke bereikbaarheid omzeilt iemand met wisselende IP-adressen de rem, en elke serverherstart zet de teller op nul. De rate limit beperkt de schade van een uitschieter, maar is géén vervanging voor authenticatie. **Inlogplicht op deze drie endpoints blijft een harde voorwaarde vóór publieke bereikbaarheid** — de aanwezigheid van een rate limit mag niet als "afgedekt" worden gelezen.

**7.11 SSR-sessiecookie voor de route-guards (toegevoegd in v1.2, Fase 9 Blok D).** De Fase 8-routeguard (`vereistIngelogd` in `src/lib/auth-guard.ts`) leest `isIngelogd()`, wat op de server altijd `false` was omdat PocketBase's `authStore` standaard in `localStorage` leeft — niet zichtbaar tijdens SSR. Gevolg: een écht ingelogde gebruiker die een gegidste route (`/kelder/*`, `/verkoop`, `/materieel`, `/voorraad`, `/bodem`) **hard ververste** (F5, of een mobiele browser die een achtergrondtab herlaadt) werd alsnog naar `/login` gestuurd, ook al klopte de sessie.

_Oplossing_: `src/lib/data.ts` spiegelt de PocketBase-`authStore` naar een `pb_auth`-cookie via `pb.authStore.exportToCookie()`, aangeroepen bij elke `authStore.onChange` (login/logout/token-refresh) én meteen bij het aanmaken van de PocketBase-instantie (dekt het geval dat `localStorage` al gevuld is maar de cookie nog niet). `auth-guard.ts` leest die cookie tijdens SSR terug via `getCookie("pb_auth")` uit `@tanstack/react-start/server` (ingepakt in `createIsomorphicFn()` zodat de server-only import niet in de clientbundel belandt — de import-protection-plugin blokkeert dat anders bij de build) en laadt 'm in de authStore vóórdat `isIngelogd()` checkt.

_Bewuste afweging — niet-`httpOnly`_: de cookie kan niet `httpOnly` zijn, want die wordt geschreven vanuit een **client-side** `authStore` (`document.cookie`, geen serverendpoint dat een `Set-Cookie`-header kan sturen op het moment van inloggen). Dit is geen nieuwe blootstelling: hetzelfde token staat toch al leesbaar in `localStorage` op ditzelfde device — een `httpOnly`-cookie zou XSS tegen cookie-diefstal beschermen, maar het token is via `localStorage` sowieso al voor JS op de pagina bereikbaar. Wél altijd gezet: `SameSite=Lax` (CSRF-mitigatie) en conditioneel `Secure` (`true` zodra `location.protocol === "https:"`, dus vanzelf actief bij de geplande `pb.tappenmars.nl`-migratie; lokaal draait alles nog op `http`, dus daar bewust `false` anders zou de cookie nooit meegestuurd worden).

_Enige echte trade-off_: `getPb()` gebruikt een module-scoped singleton-`PocketBase`-instantie die het Node-proces overleeft. Voor een single-user lokale devmachine (dit project) is dat onschadelijk, maar bij een toekomstige multi-user server zou een sessie uit request A in theorie zichtbaar kunnen blijven voor request B als beide requests toevallig na elkaar dezelfde Node-worker raken vóórdat de cookie van request B is ingeladen. Voor de geplande Pi/VPS-migratie (nog steeds in de kern single-tenant, één wijngaard) is dit acceptabel; bij een echte multi-tenant uitbouw moet `getPb()` per-request een verse instantie teruggeven in plaats van de gedeelde singleton.

**Test**: ingelogd + F5 op `/kelder/partijen/nieuw` → blijft ingelogd (nog te bevestigen door Thomas met echte credentials, zie VRAGEN VOOR THOMAS in WERKLOG.md); uitgelogd + dezelfde URL → nog steeds nette redirect (bevestigd in de browser, ongewijzigd gedrag). Build/tsc/eslint/vitest allemaal schoon na de wijziging.

---

## Open vragen (beslissen vóór fase 0)

**Bijgewerkt in v1.1 — zie het changelog hieronder voor hoe deze in de praktijk zijn beslist.**

1. ~~Oogstrecord splitsbaar over partijen?~~ **Beslist (v1.1): nee**, relatieveld volstaat — nooit een `partij_oogst`-koppeltabel gebouwd, geen vraag naar splitsen ontstaan.
2. ~~Dichtheid in SG of °Oechsle?~~ **Beslist (v1.1): °Oechsle als primaire invoereenheid**, met Brix én SG als afgeleide/opgeslagen weergave (`analyses.dichtheid_oechsle`/`_brix`/`_sg`, zie `src/lib/dichtheid.ts` — de SG-gebaseerde formule, niet de grovere lineaire benadering uit de allereerste Fase 0–2-prompt).
3. ~~Offline invoer voor `kelderlog`/`analyses` gewenst?~~ **Beslist (v1.1): ja, zoals geadviseerd — nog niet uitgevoerd.** `src/lib/sync.ts`'s `SyncSoort` dekt vandaag geen enkele kelder-collectie, ook `kelderlog`/`analyses` niet. Terecht wél buiten de wachtrij: `tankboek`/`bottelrondes` (atomiciteit, §7.6). Openstaande implementatietaak, zie `WERKLOG.md`.
4. ~~Lotnummerconventie akkoord?~~ **Beslist (v1.1): ja, `L<jj>-<PARTIJCODE>-<volgnr>` blijft de conventie** (bijv. "L26-JOH-01"). `partijen.lotnummer` is vrije tekst; `bottelrondes.lotnummer` valt automatisch terug op `partij.lotnummer` als de client niets meestuurt (Fase 4, DECISIONS-FASE4.md). Er is nog geen generator die de conventie zelf afdwingt/voorstelt — openstaande implementatietaak.
5. Valt De Tappenmars onder de EU-vrijstelling voor kleine producenten, en is er een AGP-traject nodig? (§5 — bepaalt of extra velden nodig zijn) — **nog steeds open, bij Thomas/Douane/RVO, geen appbeslissing.**
6. ~~Hook-migratie van de assistent (weg van browser-API-key) vóór of ín fase 6?~~ **Gedaan** — `src/lib/assistent.ts` bestaat niet meer, alle Anthropic-aanroepen lopen server-side via `pb_hooks/agent*.js` (Fase 3). Geverifieerd opnieuw in `WERKLOG.md` Blok 0 (4 juli 2026): geen `VITE_ANTHROPIC_API_KEY`-referentie meer in de broncode.

---

## Changelog

### v1.1 — 4 juli 2026 (Blok A, mega-prompt-traject "MVP naar écht goed")

**A1 — `kelderlog` vs. `partij_toevoegingen` samengevoegd.** Er bestonden twee parallelle ontwerpen voor hetzelfde concept: deze §1.6 beschrijft `kelderlog` met een `toevoeging`-actie, maar de kelder-uitbreiding (DECISIONS-KELDERUITBREIDING.md) bouwde daarnaast een aparte `partij_toevoegingen`-collectie met een eigen `TOEVOEGING_EENHEDEN`-enum en een `VEELGEBRUIKTE_TOEVOEGINGEN`-datalist (Bentoniet, Oenopur, Go-Ferm, Pro-ferm, Sulfiet, Aktivkohle, Panzym extract, Ao/Fo). **Besluit**: `kelderlog` (met `actie: "toevoeging"`) is vanaf nu de enige weg om een toevoeging te registreren. De "Toevoeging"-sneltoets op het partijdetailscherm (`src/routes/kelder.partijen.$partijId.tsx`) opent nu hetzelfde logboekformulier met `actie` voorgezet op `"toevoeging"`; het `Middel`-veld van dát formulier kreeg de `VEELGEBRUIKTE_TOEVOEGINGEN`-datalist (voorheen alleen op het losse toevoeging-formulier). De bestaande `KELDERLOG_EENHEDEN`-enum (afgekort: g/kg/ml/l/g_hl/mg_l) blijft de eenheid voor álle kelderlog-acties, inclusief toevoeging — geen aparte, voluit-geschreven eenhedenlijst meer voor dit ene actietype.

- **Collectie `partij_toevoegingen` NIET verwijderd of leeggehaald.** Er was geen manier om zonder inlog-credentials te verifiëren of er al echte (niet-test) invoer van Thomas in staat — DECISIONS-KELDERUITBREIDING.md documenteert dat de rooktest-data is opgeruimd, maar dat garandeert niet dat de collectie sindsdien nooit is gebruikt. Conform de regel "collecties met productiedata niet samenvoegen zonder toestemming" is de create-functie (`createToevoeging` in `kelder-data.ts`, `valideerToevoeging` in `validatie.ts`) verwijderd (dode code na de UI-wijziging), maar de collectie zelf, het schema, `fetchToevoegingen` en het `PartijToevoeging`-type blijven bestaan. Het partijdetailscherm toont eventuele oude records nog steeds, nu als alleen-lezen sectie "Toevoegingen (oud, N)" die vanzelf verdwijnt zodra een partij geen data in die collectie heeft.
- **VRAAG VOOR THOMAS** (zie ook `WERKLOG.md`): staat er in `partij_toevoegingen` nog echte invoer van jou in? Zo nee: de collectie kan in een latere sessie veilig verwijderd worden uit `scripts/setup-pocketbase.mjs`. Zo ja: die data moet eerst als `kelderlog`-records gemigreerd worden vóór verwijdering.

**A2 — open vragen beslist**, zie de bijgewerkte lijst hierboven. Geen schemawijzigingen nodig; twee items (offline-sync voor kelderlog/analyses, lotnummer-autosuggestie) zijn bevestigd nog niet gebouwd en blijven als openstaande taak in `WERKLOG.md` staan voor Blok D/E.
