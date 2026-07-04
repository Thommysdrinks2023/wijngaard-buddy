# Werklog — Tappenmars Buddy

Doorlopend werklog voor het meerdaagse traject "MVP naar écht goed" (mega-prompt v2, juli 2026). Dit is het eerste bestand dat Thomas na elke sessie leest. De bestaande `DECISIONS-*.md`-bestanden blijven staan als historisch archief van eerdere sessies en worden niet meer aangevuld — vanaf nu gaat alles hierin.

---

## 2026-07-04 — Blok 0: Nulmeting

Uitgevoerd vóór enige codewijziging, zoals verplicht. Bronnen: `CLAUDE.md`, `ARCHITECTURE.md` (v1.0), `DECISIONS-FASE3.md`, `DECISIONS-KELDERUITBREIDING.md`, `DECISIONS-FASE4.md`, `MVP-AUDIT-RAPPORT.md`, `STATUS-RAPPORT.md`, `scripts/setup-pocketbase.mjs` (schema-bron van waarheid), `pocketbase/pb_hooks/*`, en live PocketBase-probes.

**Ontbrekende documenten uit de opdracht:** `PROJECT-NOTEBOOK.md` en `fase-4-botteling-voorraad.md` bestaan niet in de projectroot — dit zijn fantoomverwijzingen (zelfde patroon als eerder geconstateerd bij `tappenmars-buddy-systeemontwerp.md`/`COMPETITIVE-ANALYSIS.md` in de kelder-uitbreiding-sessie). Per de documentvoorrangsregel (werkelijke codebase wint) wordt `DECISIONS-FASE4.md` behandeld als het leidende record van wat voor botteling/voorraad daadwerkelijk is gebouwd en getest, en `PROJECT-NOTEBOOK.md` wordt simpelweg niet gelezen (bestaat niet) — dit werklog vervult die rol vanaf nu.

### 0.1 — Collecties (bron: `scripts/setup-pocketbase.mjs`, geverifieerd live)

**Wijngaard (bestaand, ongewijzigd):** `rijen`, `metingen`, `observaties`, `fenologie`, `gezondheid`, `oogst`, `werkuren` (incl. spuitregistratie), `steekproef_planten`, `steekproef_metingen`, `werkkalender`, `notities`, `lab` (bodem/sap), `rij_locaties`, `ai_gesprekken` (legacy, ongebruikt maar bewust laten staan), `audit_log`, `vineyard_settings`. Alle hebben `vineyard_id` + `created`/`updated` (regel 5 is dus al project-breed toegepast, niet iets om opnieuw te doen).

**Kelder Fase 0–2 + kelder-uitbreiding (gebouwd, DECISIONS-KELDERUITBREIDING.md):** `producenten`, `tanks` (48 seed, veld `soort` = vrije tekst met de Excel-typecodes, geen aparte `tank_type_label` nodig), `partijen` (uitgebreid met `producent`/`opdracht_type`/`ouder_partij`/`lotnummer`/`gist`/`ontstelen`/`voorklaren`/`ph_bij_aanmaak`/`totaal_zuur_bij_aanmaak`/`standtijd`/`koeling`/dichtheidsvelden), `tankboek` (**listRule/viewRule = AUTH_RULE, createRule/updateRule/deleteRule = null** — onwijzigbaar, alleen de server-hook mag schrijven), `analyses` (AUTH_RULE op alle operaties), `kelderlog` (AUTH_RULE op alle operaties), `regelgeving_instellingen` (scaffold, geen UI), `partij_toevoegingen` (AUTH_RULE, eigen `TOEVOEGING_EENHEDEN`-enum + `VEELGEBRUIKTE_TOEVOEGINGEN`-datalist in de frontend), `voedingswaarde_berekeningen` (AUTH_RULE).

**Fase 4 — Botteling & Voorraad (gebouwd, DECISIONS-FASE4.md, vandaag Blok E+F afgerond):** `bottelrondes`, `voorraad_flessen`, `voorraad_mutaties` — dit is het **drie-collecties-model** uit de daadwerkelijke bouwopdracht, niet het twee-collecties-model (`bottelingen`+`voorraad_mutaties`) uit `ARCHITECTURE.md` §1.7. **`bottelingen` bestaat niet** (live geverifieerd: 404) — `ARCHITECTURE.md` is op dit punt verouderd.

**AI-agent Fase 3 (gebouwd, DECISIONS-FASE3.md):** `agent_gesprekken`, `agent_berichten`, `agent_acties` (list/view **open**, create/update/delete = null — bevestigd met live data: 5 echte, niet-test observatie-acties van 3 juli 2026, "rij 1–5 Muscaris gezond" — **dit is productiedata, niet aanraken**), `inzichten`, `advies_feedback`.

**Bevestigde discrepantie (kern van Blok A1):** `kelderlog` heeft al een `actie: "toevoeging"`-waarde in zijn enum (conform `ARCHITECTURE.md` §1.6), maar functioneert niet zo — de daadwerkelijke "toevoeging registreren"-UI op het partijdetailscherm gebruikt volledig de aparte `partij_toevoegingen`-collectie (met autocomplete/datalist). Twee parallelle wegen voor hetzelfde concept, beide live en met eigen enum (`KELDERLOG_EENHEDEN` afgekort vs. `TOEVOEGING_EENHEDEN` voluit). **Nog niet opgelost — zie Blok A hieronder.**

**Offline-sync-dekking (`src/lib/sync.ts`, `SyncSoort`):** dekt alleen wijngaard-collecties (`meting`, `observatie`, `fenologie`, `gezondheid`, `oogst`, `werkuren`, `steekproef_plant`, `steekproef_meting`, `werkkalender`, `notitie`, `lab`, `rij_locatie`, `audit`). **Geen enkele kelder-collectie zit in de wachtrij** — ook `kelderlog`/`analyses` niet, terwijl `ARCHITECTURE.md` §4 daar wél offline-invoer voor adviseerde. Bewust conform voor `tankboek`/`bottelrondes` (atomiciteit, §7.6), een echt gat voor `kelderlog`/`analyses`.

### 0.2 — Hooks (`pocketbase/pb_hooks/`)

| Bestand(en)                                                                          | Bedient                                                         | Endpoints                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent.pb.js` + `agent_logica.js` + `agent_uitvoering.js` + `agent_systeemprompt.md` | `/assistent` (enige, geen los `assistent.pb.js` — bestaat niet) | `POST /api/agent/bericht`, `POST /api/agent/actie/{id}/bevestig`, `POST /api/agent/actie/{id}/afwijzen` — **geen** `requireAuth()` (bewust, "login optioneel") |
| `kelder.pb.js` + `kelder_logica.js`                                                  | `/kelder/*`-formulieren                                         | `POST /api/tappenmars/tankboek-boeking`, `/partij-aanmaken`, `/bottelronde-aanmaken`, `/tanks-herbereken` — **alle vier** `$apis.requireAuth()`                |
| `voorraad.pb.js` + `voorraad_logica.js`                                              | `/voorraad`-mutatieformulier                                    | `POST /api/tappenmars/voorraad-mutatie` — `$apis.requireAuth()`                                                                                                |

Overhevelen loopt (bevestigd) als **één** tankboekregel via het generieke `tankboek-boeking`-endpoint, niet als twee regels zoals `ARCHITECTURE.md` §1.4 oorspronkelijk beschreef — bewuste, eerder gedocumenteerde afwijking, niet opnieuw aanpassen.

### 0.3 — Assistent-opschoning (H1 uit Blok H)

`src/lib/assistent.ts` **bestaat niet meer** (verwijderd in Fase 3, zie DECISIONS-FASE3.md "Naverwerking"). Geen enkele `VITE_ANTHROPIC_API_KEY`-referentie meer in `src/`, `pocketbase/`, `.env` of `.env.example` (grep leeg). **H1 is dus al gedaan — VERIFIËREN, niet bouwen.** Geen productie-build aanwezig om een bundel-grep op te draaien, maar aangezien de variabele nergens in de broncode voorkomt kan Vite hem sowieso niet hebben ingebundeld.

### 0.4 — Fase-status

Kelder-uitbreiding: **volledig gebouwd en getest** (Blok 1–3, DECISIONS-KELDERUITBREIDING.md). Fase 4 (botteling & voorraad): **volledig gebouwd en getest**, inclusief agent-integratie — Blok E is vandaag in deze sessie gecommit (`c91b5cf`) en Blok F (koppeling/rooktest/oplevering) is vandaag afgerond en gecommit (`3f1e8c1`), vóórdat dit mega-prompt-traject begon.

### 0.5 — Blok-labels voor de rest van dit document

| Blok | Label                                                  | Motivatie                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | **BOUWEN** (A1) / grotendeels **AANVULLEN** (A2)       | A1 (kelderlog vs. partij_toevoegingen) is een echt, nooit opgelost dubbel ontwerp. A2: dichtheid-eenheid en offline-beleid zijn al impliciet correct ingevuld door eerdere sessies; lotnummerconventie bestaat als veld maar de exacte `L<jj>-<code>-<volgnr>`-notatie wordt nergens afgedwongen.                                        |
| B    | **BOUWEN**                                             | Geen `rol`-veld, geen `users`-relatie waar dan ook — overal tekstvelden (`ingevoerd_door`, `verantwoordelijke`). Grote, bewuste koerswijziging t.o.v. "login optioneel".                                                                                                                                                                 |
| C    | **AANVULLEN** (backup) / **BOUWEN** (rate limit)       | Backup bestaat al (dagelijkse Taakplanner-taak, 14-daagse rotatie) maar alleen op dezelfde schijf als de server — geen offsite, geen 7/4/12-tiering, restore nooit getest. Rate limiting bestaat totaal niet (al gedocumenteerd risico in CLAUDE.md/STATUS-RAPPORT).                                                                     |
| D    | **VERIFIËREN** (fundament) + **BOUWEN** (2 onderdelen) | `tanks-herbereken`-endpoint bestaat al. Nachtelijke consistentiecheck en peiling-flow (§7.1/§7.3): bevestigd afwezig (geen treffers in hooks/routes/lib).                                                                                                                                                                                |
| E    | **VERIFIËREN/AANVULLEN** (kern) + **BOUWEN** (extra's) | Bottelrondes/voorraad volledig gebouwd en getest. Fermentatiecurves en analyses-grafieken: bevestigd afwezig (geen recharts op partijdetail). Lotnummer-autosuggestie: terugval op partij-lotnummer bestaat al, een generator voor de conventie niet.                                                                                    |
| F    | **BOUWEN**                                             | Alleen een kale `window.print()`-knop op `/kelder/tankboek`; geen PDF/Excel-opmaak, geen traceerbaarheidsrapport, geen jaaroverzicht. `/rapport` (wijngaard-seizoensrapport) is een bruikbaar precedent-patroon.                                                                                                                         |
| G    | **BOUWEN**                                             | Geen `bodem_observaties`-collectie, geen enkele match.                                                                                                                                                                                                                                                                                   |
| H    | H1 **VERIFIËREN** (klaar) / H2–H4 **BOUWEN/AANVULLEN** | H1 hierboven bevestigd schoon. H2 (tool-registry) is nog niet als aparte structuur gebouwd. H3: `zoek_voorraad`/`voorraad_detail` bestaan al (Fase 4 Blok E) — dat deel is VERIFIËREN; bodem/kelderlog-tools zijn BOUWEN en wachten op G/A. H4: systeemprompt bestaat en heeft al kelderkennis, bodemdomein ontbreekt logischerwijs nog. |
| I    | **BOUWEN**                                             | Geen werkorders, geen `inkopen`-collectie, geen blend-calculator gevonden.                                                                                                                                                                                                                                                               |
| J    | **AANVULLEN**, doorlopend                              | `CLAUDE.md` vandaag al bijgewerkt (ops-fix, zie hieronder); `scripts/tests/` bestaat nog niet.                                                                                                                                                                                                                                           |

### Zijspoor: operationele bevinding tijdens de nulmeting (niet onderdeel van de mega-prompt, wel belangrijk)

Tijdens Blok 0 bleek de C-schijf van de Windows-devmachine twee keer bijna/helemaal vol te lopen (0 bytes vrij, later opnieuw tot 1,2GB), veroorzaakt door **~14GB verweesde OneDrive-update-tempmappen** in `AppData\Local\Temp` (niet gerelateerd aan dit project). Dit had de PocketBase-Taakplanner-taak laten crashen (herstart) én de dagelijkse backup-taak van vandaag laten vasthangen op "Queued" (zelfde bekende accu-instelling-valkuil als eerder bij de PocketBase-taak, nu ook hier gefixt). Opgelost: tempmappen opgeruimd (~8GB vrije ruimte terug), accu-instelling van de backup-taak uitgezet, gemiste backup van vandaag alsnog gedraaid. Vastgelegd in `CLAUDE.md` (commit `e0229d2`) zodat een volgende sessie dit direct herkent.

**VRAAG VOOR THOMAS:** geen — dit was een pure infrastructuur-herstelactie zonder databeslissing, veilig uit te voeren (temp-installatiebestanden, geen documenten of projectdata).

**Definition of Done Blok 0:** gehaald. Geen enkele codewijziging aan de applicatie zelf; de enige wijziging is de CLAUDE.md-ops-notitie hierboven (buiten de mega-prompt-scope, apart gecommit).

---

## 2026-07-04 — Blok A: Ontwerpconflicten oplossen

Backup vooraf: dagelijkse backup was toch al net gedraaid tijdens het oplossen van het Zijspoor hierboven (`wijngaard_backup_20260704_222215.zip`) — geen aparte `pb_data_backup_blokA_...` nodig, deze dekt dezelfde staat.

**A1 — `kelderlog` vs. `partij_toevoegingen` samengevoegd.** Zie `ARCHITECTURE.md` v1.1-changelog voor de volledige motivatie. Kort: de "Toevoeging"-sneltoets op `/kelder/partijen/$partijId` opent nu het bestaande Kelderlog-formulier met `actie` voorgezet op `"toevoeging"`, en het `Middel`-veld van dát formulier kreeg de `VEELGEBRUIKTE_TOEVOEGINGEN`-datalist (Bentoniet, Oenopur, Go-Ferm, Pro-ferm, Sulfiet, Aktivkohle, Panzym extract, Ao/Fo) die eerder alleen op het losse toevoeging-formulier stond. Het aparte formulier, de bijbehorende state (`tDatum`/`tNaam`/`tHoeveelheid`/`tEenheid`/`tNotities`/`tFouten`), de mutatie en `createToevoeging`/`valideerToevoeging` zijn verwijderd (dode code na de UI-wijziging).

- **`partij_toevoegingen` (collectie + data) NIET verwijderd.** Kon niet geverifieerd worden of er al echte invoer van Thomas in staat (geen inlog-credentials beschikbaar in deze sessie om de collectie te bevragen; DECISIONS-KELDERUITBREIDING.md documenteert alleen dat rooktest-data is opgeruimd, niet dat de collectie sindsdien nooit is gebruikt). Conform regel 11 (geen samenvoeging van collecties met productiedata zonder toestemming) is de veiligste route gekozen: schrijven stopt, lezen blijft. Het partijdetailscherm toont eventuele bestaande records nu als alleen-lezen sectie "Toevoegingen (oud, N)", die vanzelf wegvalt zodra een partij niets in die collectie heeft.
- **VRAAG VOOR THOMAS:** staat er in `partij_toevoegingen` nog echte invoer van jou in (dus niet alleen de testdata die na Blok 2 van de kelder-uitbreiding is opgeruimd)? Zo nee: mag in een volgende sessie de collectie zelf uit `scripts/setup-pocketbase.mjs` en de database. Zo ja: eerst een migratiescript naar `kelderlog`-records vóór verwijdering.
- **Geverifieerd:** `tsc --noEmit` en `eslint` schoon op de drie aangepaste bestanden (`kelder.partijen.$partijId.tsx`, `kelder-data.ts`, `validatie.ts`); browserpreview van `/kelder/partijen` en de modulehub laat geen consolefouten zien. **Niet visueel doorgeklikt op een echte partijdetailpagina** — er bestaat momenteel geen enkele partij in de database (alle eerdere sessies ruimen hun testdata op, en het aanmaken van een nieuwe partij vereist login waarvoor geen testaccount is aangemaakt in deze sessie, dezelfde grens als eerdere sessies). De code is wel gelezen en nagelopen op structurele correctheid (JSX-nesting, state-referenties, importa's) vóór en ná de wijziging.

**A2 — open vragen beslist**, vastgelegd in `ARCHITECTURE.md` v1.1 (zie "Open vragen"-sectie, nu met doorgestreepte + beantwoorde punten). Samengevat: oogstrecord-splitsing en dichtheidseenheid waren al impliciet correct volgens eerdere sessies (geen wijziging nodig); offline-sync voor `kelderlog`/`analyses` en een lotnummer-autosuggestiegenerator zijn bevestigd nog niet gebouwd en blijven expliciet openstaand voor Blok D/E; de AGP/vrijstellingsvraag blijft terecht bij Thomas/Douane/RVO liggen (geen appbeslissing).

**Definition of Done Blok A:** gehaald — geen dubbele ontwerpen meer, `ARCHITECTURE.md` is v1.1, beslissingen staan hierboven met motivatie.

### Volgende stap (niet in deze sessie gedaan)

**Blok B (gebruikers & rollen)** is de volgende in de rij. Dit is een fundamentele koerswijziging: schrijven op gedeelde serverdata gaat overal login vereisen (nu nog alleen bij `/kelder/*`/`/voorraad`, straks ook — impliciet via hetzelfde principe — relevant voor de agent-schrijfacties). **Let op vóór dat blok start:** `agent_acties` bevat al échte, niet-testdata sinds 3 juli 2026 (zie Blok 0) — de agent-schrijfflow wordt dus per direct gebruikt. Blok B raakt de bestaande 3 accounts (migratie naar een `rol`-veld) en moet zorgvuldig, met een verse `pb_data`-backup vooraf (regel 10), in een aparte sessie gebeuren — niet toevallig aan het einde van een al lange sessie erbij gepakt.

---
