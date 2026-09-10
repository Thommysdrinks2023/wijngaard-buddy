# Wijngaard Buddy — CLAUDE.md

Projectinstructies voor Claude Code. Lees dit aan het begin van elke sessie. Lees ook `ARCHITECTURE.md` — het autoritatieve systeemontwerp voor de uitbouw naar **Tappenmars Buddy** (modulair bedrijfsdashboard met Wijngaard/Kelder/Voorraad). Kelder Fase 0–2, de kelder-uitbreiding, AI-agent Fase 3 én Botteling & Voorraad (Fase 4) zijn gebouwd — zie de `DECISIONS-*.md`-bestanden voor de precieze, geteste staat per onderdeel (deze wijkt op punten af van `ARCHITECTURE.md`, dat het oorspronkelijke ontwerp beschrijft, niet altijd de uiteindelijk gebouwde versie).

## Wat is dit?

**Wijngaard Buddy** is een Progressive Web App (PWA) voor het beheren van wijngaard **De Tappenmars** in Den Ham (Overijssel). Eigenaar: Thomas (thomas@tappenmars.nl). De app groeit uit tot **Tappenmars Buddy**: `/` is een modulekiezer, `/wijngaard` is deze bestaande wijngaardmodule, `/kelder/*` is de kelder-uitbouw (zie `ARCHITECTURE.md`).

De app registreert Brix-metingen, observaties, fenologie en plant-status per rij. Offline-first: alles werkt zonder internet via localStorage-cache; PocketBase is de backend wanneer beschikbaar.

- **7 druivenrassen**: Muscaris, Souvignier Gris (let op spelling!), Johanniter, Regent, Pinot Noir, Chardonnay, Pinotin
- **69 rijen**, totaal ~4645 planten; rij 69 is een korte stompje-rij
- GPS-coördinaten perceel: lat 52.47292, lon 6.48405

## Architectuur

```
src/
  routes/          # TanStack Router file-based routes (één bestand = één pagina)
  components/      # Gedeelde UI-componenten (AppHeader, BottomNav, WeerKaart, …)
  lib/             # Business logic, data-access, seed-data
    data.ts        # PocketBase-queries + localStorage-fallback (offline seed)
    seed-rijen.ts  # Brondefinitie van alle 69 rijen (statisch, versie-bewakt)
    types.ts       # TypeScript-interfaces (Rij, Meting, Observatie, …)
    wijngaard-config.ts  # Centrale config (naam/GPS/oppervlakte) — niet hardcoden elders
  styles.css       # Globale CSS-variabelen (huisstijl-tokens)
scripts/
  setup-pocketbase.mjs  # PocketBase schema + seed upsert (idempotent, re-runbaar)
pocketbase/
  pocketbase.exe   # Lokale PocketBase binary (Windows)
```

### Routeoverzicht (belangrijkste)

| Route                 | Pagina                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Modulekiezer (tegels: Wijngaard, Kelder, Voorraad [binnenkort], Assistent)                                                                                                                                                                   |
| `/wijngaard`          | Redirect naar `/perceelkaart` — bestaande wijngaardmodule, ongewijzigd                                                                                                                                                                       |
| `/perceelkaart`       | SVG bovenaanzicht van de wijngaard                                                                                                                                                                                                           |
| `/rij/$rijId`         | Rij-detail (metingen, observaties, fenologie)                                                                                                                                                                                                |
| `/rij/$rijId/planten` | Plant-status per vak in de rij                                                                                                                                                                                                               |
| `/snel`               | Snelle Brix-meting in 3 tikken                                                                                                                                                                                                               |
| `/scan`               | QR-scanner (rijpalen)                                                                                                                                                                                                                        |
| `/kelder`             | Kelderdashboard: tankinventaris (48 tanks), actieve partijen, kerncijfers                                                                                                                                                                    |
| `/kelder/partijen`    | Partijenlijst; `/kelder/partijen/nieuw` (met eerste vulling), `/kelder/partijen/$partijId` (detail: tankboek, analyses, kelderlog)                                                                                                           |
| `/kelder/tanks`       | Tankbeheer; `/kelder/tanks/$tankId` (detail + historie + herbereken)                                                                                                                                                                         |
| `/kelder/overhevelen` | Overhevel-formulier (servervalidatie)                                                                                                                                                                                                        |
| `/kelder/tankboek`    | Onwijzigbaar register, filterbaar, printbaar                                                                                                                                                                                                 |
| `/kelder/accijns`     | Indicatief accijnsoverzicht per aangifteperiode (Blok K)                                                                                                                                                                                     |
| `/verkoop`            | Klanten, orders en atomisch leveren (Blok L)                                                                                                                                                                                                 |
| `/materieel`          | Machinepark + onderhoudslog (Blok M)                                                                                                                                                                                                         |
| `/pasteurisatie`      | Runoverzicht + logboek per klant/product (Fase 17); `/pasteurisatie/plannen` (drukveiligheid vooraf), `/pasteurisatie/run/nieuw` (starten op lotnummer), `/pasteurisatie/run/$runId` (live monitor), `/pasteurisatie/run/$runId/certificaat` |
| `/assistent`          | AI-agent (Fase 3): gesprekken, bevestigingskaarten, foto-analyse                                                                                                                                                                             |
| `/instellingen`       | App- en wijngaard-instellingen (incl. "start direct in laatst gebruikte module")                                                                                                                                                             |

## Dev-omgeving opstarten

**Vereiste:** Bun geïnstalleerd (`bun --version`).

```bash
# 1. PocketBase starten (aparte terminal, in projectmap)
#    Op deze Windows dev-machine draait dit al automatisch via de
#    Taakplanner — zie "PocketBase op Windows" hieronder. Handmatig starten
#    (bijv. op een andere machine) kan gewoon met:
./pocketbase/pocketbase.exe serve --http=127.0.0.1:8090

# 2. PocketBase schema + seed initialiseren (alleen 1e keer of na reset)
#    Vereist: eerst inloggen in PocketBase admin op http://127.0.0.1:8090/_/
bun run scripts/setup-pocketbase.mjs

# 3. Frontend starten
bun run dev
# → http://localhost:5173 (of andere poort die Vite kiest)
```

**Omgevingsvariabelen** (optioneel, `.env` in projectroot):

```
VITE_PB_URL=http://127.0.0.1:8090
VITE_WEER_LAT=52.47292
VITE_WEER_LON=6.48405
```

**Offline werken zonder PocketBase:** de app seeded automatisch localStorage-sleutel `wg.rijen.v3` bij eerste bezoek. Cache-versie ophogen in `src/lib/data.ts` om reseed te forceren.

## PocketBase op Windows (Taakplanner)

Op deze dev-machine draait PocketBase niet meer als los terminalproces (dat stierf bij herstart of het sluiten van het venster), maar als een **Windows Taakplanner-taak** die automatisch start bij aanmelden.

- **Taaknaam**: `PocketBase Tappenmars`
- **Startscript**: `deploy/start-pocketbase.bat` — `cd`'t naar `pocketbase/` (niet de projectroot: `pb_data` en `pb_hooks` staan in die submap) en start `.\pocketbase.exe serve --http=127.0.0.1:8090`
- **Trigger**: bij aanmelden van de gebruiker (`ONLOGON`); logt alleen in als de gebruiker is aangemeld (`Interactive`, geen opgeslagen wachtwoord)
- **Herstelgedrag**: bij een crash 3 herstartpogingen met 1 minuut interval; geen tijdslimiet op de taak (server mag onbeperkt blijven draaien)
- **`pb_data`-backup**: `pocketbase/pb_data_backup_<datum>` (gemaakt vóór de omzetting naar de Taakplanner)

**Herstarten (aanbevolen — de PowerShell-cmdlets, niet `schtasks.exe`):**

```powershell
Get-Process pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
Start-ScheduledTask -TaskName "PocketBase Tappenmars"
```

**Stoppen** (zonder de taak zelf te verwijderen):

```powershell
Stop-ScheduledTask -TaskName "PocketBase Tappenmars"
Get-Process pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Let op — twee bekende valkuils bij herstarten:**

1. **`/End` (of `Stop-ScheduledTask`) beëindigt soms alleen de cmd.exe-wrapper, niet het onderliggende `pocketbase.exe`-proces** (blijft dan als wees doordraaien — bijv. gemerkt na een `.env`-wijziging die niet doorkwam). Controleer met `Get-Process pocketbase`; zo nodig `Get-Process pocketbase | Stop-Process -Force` vóór je opnieuw start.
2. **`schtasks /Run` kan blijven hangen op status "Queued" en dan nooit echt starten.** Twee bevestigde oorzaken:
   - **Boekhouding van Task Scheduler raakt in de war** nadat `pocketbase.exe` handmatig met `Stop-Process -Force` is afgesloten i.p.v. via de taak zelf beëindigd (`MultipleInstancesPolicy: IgnoreNew` in de taakdefinitie denkt dan nog dat er een instantie loopt). Eerst netjes `schtasks /End /TN "PocketBase Tappenmars"` draaien lost dit meestal op.
   - **De laptop draait op accu.** De taak had oorspronkelijk `DisallowStartIfOnBatteries: true` / `StopIfGoingOnBatteries: true` (Taakplanner-standaardinstellingen) — op accu weigert hij dan te starten en blijft "Queued" hangen zonder duidelijke foutmelding. **Dit is inmiddels permanent uitgezet** (bevestigd met Thomas: PocketBase is de backend van de app en moet niet uitvallen zodra de laptop van de lader gaat):
     ```powershell
     $task = Get-ScheduledTask -TaskName "PocketBase Tappenmars"
     $settings = $task.Settings
     $settings.DisallowStartIfOnBatteries = $false
     $settings.StopIfGoingOnBatteries = $false
     Set-ScheduledTask -TaskName "PocketBase Tappenmars" -Settings $settings
     ```
   - **Algemene aanpak bij "Queued"**: gebruik de PowerShell-cmdlets (`Start-ScheduledTask`/`Stop-ScheduledTask`) i.p.v. `schtasks.exe`; controleer `(Get-ScheduledTask -TaskName "PocketBase Tappenmars").State` (moet `Running`/`Ready` zijn, niet `Queued`) en `Get-Process pocketbase` (recente `StartTime`). Blijft hij ondanks bovenstaande hangen: check `Get-CimInstance -ClassName Win32_Battery | Select BatteryStatus` (1 = op accu) en of er nog een oud proces leeft dat eerst `Stop-Process -Force` nodig heeft.

**Logs bekijken:** de taak draait zonder zichtbaar venster, dus er is geen live logvenster. Om output te zien: stop de taak (hierboven) en draai het bat-bestand tijdelijk handmatig in een terminal:

```powershell
& "deploy\start-pocketbase.bat"
```

Sluit dat venster (Ctrl+C) en start de Taakplanner-taak weer op zodra je klaar bent met kijken.

**Bekende valkuil — `NoDefaultCurrentDirectoryInExePath`:** deze machine heeft een Windows-hardeningsvariabele actief (vaak door beveiligingssoftware gezet) die voorkomt dat `cmd.exe` een kale bestandsnaam (`pocketbase.exe`) in de huidige werkmap zoekt — alleen nog op het PATH. Resultaat: `"pocketbase.exe is not recognized"` ondanks dat het bestand er echt staat. Daarom gebruikt `start-pocketbase.bat` bewust `.\pocketbase.exe` (expliciet relatief pad) in plaats van de kale bestandsnaam. Kom je deze foutmelding ergens anders tegen in een `.bat`-bestand: zelfde fix.

## Backup (`scripts/backup-pocketbase.ps1` + Taakplanner-taak "Wijngaard PocketBase Backup")

Draait dagelijks om 20:00, maakt een zip van `pb_data` (via PocketBase's eigen backup-API als de server draait, anders een directe bestandskopie) in `C:\Users\Gebruiker\Documents\Tappenmars\Wijngaard\Backups`, bewaart de laatste 14. **Let op — dit is nog altijd dezelfde schijf/machine als de server zelf**, geen externe locatie; zie het "Niet doen zonder toestemming"-punt over off-site backup in eventuele vervolgopdrachten.

**Zelfde accu-valkuil als de PocketBase-taak (zie hierboven) trof ook deze taak** (ontdekt op 4 juli 2026: de dagelijkse backup van die dag bleef "Queued" hangen omdat de laptop op accu draaide). Op dezelfde manier permanent uitgezet:

```powershell
$task = Get-ScheduledTask -TaskName "Wijngaard PocketBase Backup"
$settings = $task.Settings
$settings.DisallowStartIfOnBatteries = $false
$settings.StopIfGoingOnBatteries = $false
Set-ScheduledTask -TaskName "Wijngaard PocketBase Backup" -Settings $settings
```

**Handmatig een backup afdwingen** (bijv. na een risicovolle sessie): `Start-ScheduledTask -TaskName "Wijngaard PocketBase Backup"`, daarna `Get-Content "...\Backups\backup-log.txt" -Tail 3` om te bevestigen dat hij is gelukt.

**C-schijf kan onopgemerkt vollopen door OneDrive-updateresten.** Op 4 juli 2026 raakte de C-schijf twee keer bijna/helemaal vol (0 bytes vrij, later opnieuw tot 1,2GB) door **~14GB aan verweesde `OneDriveDeltaPatch`/`NewCabinet`-mappen in `AppData\Local\Temp`** — tijdelijke uitpakmappen van OneDrive's eigen updater die na een update nooit worden opgeruimd en zich over maanden opstapelen (sommige dateerden van oktober 2025). Dit veroorzaakte zowel een PocketBase-crash als een mislukte dagelijkse backup. Bij een onverklaarbaar volle C-schijf: controleer eerst `du -sh /c/Users/Gebruiker/AppData/Local/Temp/*/ | sort -rh | head -20` op mappen met een `OneDriveDeltaPatch`- of `NewCabinet`-submap — die zijn veilig te verwijderen (OneDrive downloadt ze desnoods opnieuw).

## Inloggen verwijderd (22 augustus 2026) — geschiedenis en huidige staat

**Derde keer, dus lees dit vóór je hier iets aan verandert.**

- **26 juli 2026** — verwijderd op verzoek van Thomas: geen accounts nodig
  zolang PocketBase alleen op `127.0.0.1` luistert.
- **21 augustus 2026** — hersteld, met een jaar-sessieduur zodat dagelijks
  inloggen niet nodig zou zijn, vóór de geplande Pi-migratie
  (november/december 2026) in plaats van pas op de dag zelf.
- **22 augustus 2026** — **weer verwijderd.** Thomas kon zichzelf niet meer
  bij zijn eigen app krijgen op de dag dat hij hem wilde gebruiken. Zijn
  woorden, expliciet bewust van de trade-off: _"Weet ik, maar daar houden we
  dan wel rekening mee. Haal dat inlog scherm er maar gewoon af."_

**De app kent nu weer geen accounts, geen wachtwoorden en geen rollen.**
Iedereen die de PocketBase-server kan bereiken mag alle data lezen én
wijzigen. Dat is te overzien zolang de server uitsluitend op `127.0.0.1`
luistert. Het is **niet** te overzien zodra de app op de Raspberry Pi in de
schuur draait of op `pb.tappenmars.nl` — dan liggen het tankboek, de
klantgegevens (AVG) en het gebruikersbeheer open voor lezen en schrijven.
**Dit moet terug vóór die migratie, niet erna.**

**Wat "verwijderd" concreet betekent:**

- `scripts/setup-pocketbase.mjs`: `AUTH_RULE = OPEN_RULE` (was
  `"@request.auth.id != ''"`, 171 regels over 43+ collecties).
- `pocketbase/pb_hooks/kelder_logica.js`: `rolVan()` geeft bij ontbrekende
  auth weer `"beheerder"` terug (anders zouden de kelder-/voorraadendpoints
  onbruikbaar worden zonder ingelogde gebruiker).
- `$apis.requireAuth()` is weer weg bij elk endpoint in `kelder.pb.js`,
  `voorraad.pb.js`, `signalen.pb.js` en `tags.pb.js`.
- Frontend: `/login`, `src/lib/auth-guard.ts`, de guards op
  `/kelder`, `/voorraad`, `/bodem`, `/materieel`, `/verkoop`, de
  "Uitloggen"-knop en het gebruikersbeheer in `/instellingen`, en de
  cookie-sync/sessieverversing in `data.ts`/`__root.tsx` zijn weer weg.
- `isIngelogd()` in `data.ts` geeft weer hard `true` terug.
- De verbindingsbadge toont weer alleen offline/online, geen inlogstatus.

**Terugzetten (vierde keer, ooit) = dezelfde stappen als 21 augustus:**
`AUTH_RULE` terug naar `"@request.auth.id != ''"`, `rolVan()` terug naar
`if (!auth) return ""`, `requireAuth()` terug op de vier hook-bestanden, en de
frontend-bestanden (`auth-guard.ts`, `/login`, de vijf guards, de
verbindingsbadge, het gebruikersbeheer) terughalen uit de git-geschiedenis —
zoek de commit "inloggen hersteld" van 21 augustus 2026 als exact voorbeeld.
**Doe dat vóórdat de server van `127.0.0.1` af gaat, niet erna.**

**BESLISSING NOG OPEN (audit 5 september 2026, zie WERKLOG.md "Audit 5 september 2026 — authenticatie en rollen"):** de audit stelde vast dat er momenteel GEEN enkel onderscheid meer tussen gebruikers bestaat — iedereen die de server bereikt is functioneel beheerder voor alle kelder-/voorraad-/verkoop-/materieelacties (`rolVan()` geeft bij afwezige auth altijd `"beheerder"` terug, live geverifieerd: een beheerder-only endpoint anoniem aangeroepen gaf gewoon 200). Alleen gebruikersbeheer blijft echt dicht (`requireAuth()` in `gebruikers.pb.js`). Drie opties liggen klaar (zie WERKLOG.md voor de volledige afweging): (A) zo laten, (B) login+rollen volledig terug, (C) een tussenweg — geen algemene login, wel een drempel vóór alleen de zware acties (tarieven, correcties, gebruikersbeheer). Thomas heeft op 9 september 2026 expliciet gekozen dit **nog niet** te beslissen. **Harde eis: dit moet opgelost zijn vóórdat de server van `127.0.0.1` af gaat (Pi-migratie/`pb.tappenmars.nl`) — niet erna.** Een volgende sessie die aan de Pi-migratie begint moet dit punt eerst voorleggen, niet aannemen dat "zo laten" de keuze is.

**Bewust ONGEWIJZIGD gebleven, en dat blijft zo, alle drie de keren:**

- `tankboek` en `agent_acties` houden `create/update/delete = null`. Dat was
  nooit een inlogmaatregel maar **onwijzigbaarheid**: schrijven kan alleen via
  de gecontroleerde serverendpoints, wat de correctheid van het
  accijnsregister bewaakt.
- `pocketbase/pb_hooks/gebruikers.pb.js` behoudt zijn `$apis.requireAuth()` —
  accountbeheer mag nooit wereldwijd open staan, los van of er verder wordt
  ingelogd. **Correctie (Beveiligingsblok, 9 september 2026)**: dit klopte in
  de code maar niet in de praktijk — `users.createRule` stond op `""` (open)
  en `updateRule` stond op `"id = @request.auth.id"`, dus iedereen kon
  zichzelf registreren en vervolgens zijn eigen `rol`-veld op `"beheerder"`
  zetten, wat `requireAuth()` + `eisBeheerder()` volledig omzeilde. Live
  curl-bevestigd en gerepareerd: `users.createRule`/`updateRule` staan nu
  op `null` (alleen superuser/hook-context, via `stelUsersApiRegelsIn()` in
  `setup-pocketbase.mjs`) — precies wat deze regel altijd al beweerde. Zie
  WERKLOG.md "Beveiligingsblok" voor het volledige testbewijs.
- De `users`-collectie en bestaande accounts zijn nooit verwijderd geweest
  (de wachtwoorden staan, ongewijzigd, in `pocketbase-accounts.txt`).

**Wat dit sowieso niet oplost, en waar bij de Pi-migratie naar gekeken moet
worden:** het agent-endpoint (`POST /api/agent/bericht`, en `/bevestig`/
`/afwijzen`) heeft nog steeds geen `requireAuth()`. **Correctie (9 september 2026)**: eerdere versies van dit document beweerden hier ook "geen
rate-limiting" — dat was stale. Rate-limiting bestaat wél, al sinds de
Eindsprint (`controleerRateLimit()` in `agent_uitvoering.js`), en is in het
Beveiligingsblok (9 sep. 2026) uitgebreid met een dagplafond naast het
uurplafond, beide instelbaar via `app_instellingen`
(`agent_berichten_per_uur_per_ip`/`_per_dag_per_ip`, standaard 30/uur en
150/dag) en curl-getest. **Aanvulling (pentest 10 sep. 2026, bevinding B5)**:
de rem telde één streepje per bericht terwijl één beurt tot 10 model-aanroepen
doet met tot 30 historieberichten — een vooraf volgestopt gesprek kon zo een
veelvoud aan tokenkosten veroorzaken (denial-of-wallet). De historie die de
model-aanroep in gaat wordt nu begrensd op `MAX_INHOUD_TEKENS` (8000/bericht) en
`MAX_CONTEXT_TEKENS` (40000 totaal, oudste berichten vervallen eerst, laatste
bericht blijft) in `agent_uitvoering.js`. Zie WERKLOG.md "Beveiligingsblok" voor het
testbewijs. Zonder `requireAuth()` blijft het endpoint desondanks bereikbaar
voor iedereen die de server bereikt — de kostenrem beperkt het financiële
risico, maar lost geen toegangsprobleem op. Dat moet vóór de Pi/
`pb.tappenmars.nl` alsnog opgelost worden, samen met het bredere
auth/rollen-besluit (zie hierboven, "BESLISSING NOG OPEN").

## Codeerconventies

- **Taal in de code**: Nederlands voor variabelenamen, commentaar, UI-tekst; TypeScript voor types
- **Stijl**: Tailwind v4 utility classes. Hardcode **geen** HEX-kleuren — gebruik CSS-variabelen (`var(--primary)`, `bg-card`, `text-foreground`, etc.)
- **Huisstijlkleuren** (gedefinieerd in `src/styles.css`):
  - `--nav` `#2d5a3d` — navigatiebalk
  - `--primary` `#4a8c5c` — primaire knoppen/accenten
  - `--accent-gold` `#c9b84c` — gouden accent
  - `--background` `#f5f7f5` — paginaachtergrond
  - `--card` `#ffffff` — kaartachtergrond
- **Formatting**: Prettier (`bun run format`) — altijd uitvoeren vóór commit
- **Lint**: ESLint (`bun run lint`) — geen warnings in CI
- **Tests**: Vitest (`npm test`) — dekt de pure rekenlibs (`dichtheid.ts`, `oenologie.ts`, `accijns.ts`, `gisting-verwachting.ts`). **Draai `npm test` vóór elke commit** die een van deze bestanden raakt; groen is een harde eis, niet optioneel. Nieuwe pure rekenlogica hoort een bijbehorend `*.test.ts`-bestand te krijgen (zelfde patroon: normaal geval, randgeval, limietoverschrijding waar van toepassing).
- **Rooktests (E2E)**: Playwright (`npm run test:e2e`), 6 tests in `e2e/rooktest.spec.ts`. Draaien tegen de **productiebuild** (`playwright.config.ts` bouwt en start `vite preview` op poort 4173) op **telefoonformaat** (Pixel 7) — niet de dev-server en niet bureaubladbreedte, want dat is niet wat Thomas gebruikt. Ze verwachten een draaiende lokale PocketBase op `127.0.0.1:8090`.
  - **Geen inloggegevens meer nodig** (sinds 22 augustus 2026, zie "Inloggen verwijderd"): de tests draaien zonder account. `hulp.ts` biedt `openApp()` — die zet alleen nog de onboarding-dialoog weg, want die legt zich anders over het scherm en vangt alle kliks af.
  - De tests controleren waar mogelijk of een record **écht op de server** staat, niet of er een bevestiging op het scherm stond — een groene toast bewijst niets over wat er is opgeslagen. Records die ze aanmaken ruimen ze zelf op (`ingevoerd_door = "e2e-rooktest"`).
  - Test 6 controleert dat **geen enkel hoofdscherm een `role="alert"` toont**. Dat is de goedkoopste bewaking tegen het terugkerende faalpatroon uit Fase 8/10 (datalaag faalt, scherm toont een foutstatus of blijft leeg).
  - **`retries: 0` is bewust**: een wisselvallige test is een bevinding, geen ruis om weg te retryen.
- **Routing**: TanStack Router file-based. Nieuwe pagina = nieuw bestand in `src/routes/`. Voer daarna `bun run dev` uit zodat `routeTree.gen.ts` automatisch bijgewerkt wordt.
- **Data**: queries via TanStack Query (`useQuery`). Alle PocketBase-calls zitten in `src/lib/data.ts`.
- **Componenten**: geen commentaar tenzij de _reden_ niet-voor-de-hand-liggend is; geen multi-regel docstrings.

## Aandachtspunten

- **Spelling ras**: "Souvignier Gris" (niet "Souveginier"). Staat in `seed-rijen.ts`, `RAS_KLEUR` in meerdere routes, en PocketBase seed-script. **Fase 12 heeft dit project-breed gecontroleerd**: broncode, scripts, `pb_hooks/agent_systeemprompt.md` en de live database gebruiken allemaal de juiste spelling, en de overige zes rassen kennen geen varianten.
  - **`pocketbase/pb_migrations/*.js` bevat de oude tikfout bewust en mag NIET "gecorrigeerd" worden.** Dat is PocketBase's append-only migratiegeschiedenis: de `created_*`-migraties leggen vast hoe het schema ooit wás, en in de `1784926545_updated_*`-migraties (de Fase 11-fix) staat de juiste spelling vooruit en de oude spelling in de rollback — precies wat een rollback hoort te doen. Een verse replay van alle migraties eindigt dus op de juiste waarden. Bewerken van die bestanden breekt de rollback zonder iets op te lossen.
- **Rij 23/24**: hebben `planten_per_vak: 4` (standaard = 5). De perceelkaart-SVG gebruikt `fysiekeLengteBasis()` om de _fysieke_ rijlengte te berekenen, niet het plantaantal — niet aanpassen zonder die helper te begrijpen.
- **Rij 69**: stompje-rij, 36 planten. In de perceelkaart-SVG groeit hij van _onder_ naar boven (`groeitVanOnder = true`).
- **Schema-driftcontrole — DRAAI DIT VÓÓR ELKE FASE DIE HET SCHEMA RAAKT** (`scripts/check-schema-drift.mjs`):

  ```bash
  node scripts/check-schema-drift.mjs http://127.0.0.1:8090 <admin-email> <admin-wachtwoord>
  ```

  Vergelijkt wat `setup-pocketbase.mjs` wíl inrichten met wat er werkelijk in de database staat: veldnamen, types, verplicht-vlaggen, keuzelijstwaarden, min/max/patroon, relatiedoelen, indexen en alle vijf API-regels. Exitcode 1 zodra er iets met ernst "hoog" tussen zit.

  **Waarom dit bestaat**: `ensureCollection()` is create-only en corrigeert een bestaande collectie nooit. Een schemawijziging die wel in de code staat maar nooit is gemigreerd, is daardoor onzichtbaar — precies hoe de rasnaam-tikfout maandenlang 17 rijen blokkeerde (`AUDIT-VELDGEREEDHEID.md` §3.1).

  **Hoe het werkt**: het script draait `setup-pocketbase.mjs` met `DRIFT_DUMP=<pad>`. In die uitleesstand schrijft dat script alle collectiedefinities weg en wordt élke niet-GET-aanroep geblokkeerd, dus er verandert niets. Bewust géén tweede kopie van de definities: die zou zelf gaan driften. Bij een crash in de uitleesstand wordt geschreven wat er tot dan toe verzameld is (`onvolledig: true` in de dump) — controleer dan of de dekking klopt vóór je de uitkomst gelooft.

  **Dekking (gemeten juli 2026)**: 43 van de 44 collecties, 421 velden, 215 API-regels. Niet gedekt: de ingebouwde `users`-collectie, op `users.rol` na (die loopt via `ensureVelden` en wordt wél vergeleken).

- **PocketBase setup-script** (`scripts/setup-pocketbase.mjs`): idempotent. Doet upsert (PATCH bestaand / POST nieuw) + verwijdert rijen die niet in de seed staan. Veilig om meerdere keren te draaien.
- **Netlify**: nog niet live. Deployment-configuratie bestaat (`wrangler.jsonc`), maar de site wordt nog lokaal gebruikt.
- **VPS (Hetzner)**: PocketBase draait niet op de VPS — wachtwoord reset nodig via Hetzner-console. Plan: `pb.tappenmars.nl` voor HTTPS-productie, SSL via Cloud86.
- **Raspberry Pi migratie**: gepland als productie-backend (lokaal in de schuur), nog niet uitgevoerd.
- **/assistent route (Fase 3, AI-agent) gebouwd en actief**: chatscherm met bevestigingskaarten per actietype, gesprekkenlijst, fotoknop, bronnenregel, feedback-knoppen. Werkt bewust **zonder inloggen** (zoals de rest van de app) — `agent_gesprekken`, `agent_berichten` en `advies_feedback` hebben een open API-rule (`OPEN_RULE = ""`, geen `AUTH_RULE`); `agent_acties` mag iedereen lezen maar niemand rechtstreeks schrijven (`createRule`/`updateRule`/`deleteRule` = `null`, uitsluitend de hook-context mag dat). **Let op — dit betekent ook dat `POST /api/agent/bericht` geen `requireAuth()` heeft**: elke request die de server bereikt triggert een betaalde Anthropic-aanroep. Er ZIT wél een kostenrem op (uur- en dagplafond per IP, zie "Inloggen verwijderd" hierboven voor het testbewijs) — die voorkomt onbeperkte kosten, maar lost het toegangsprobleem niet op. Zolang PocketBase alleen op `127.0.0.1`/het lokale netwerk luistert is dat te overzien; **voordat dit endpoint ooit van buiten het lokale netwerk bereikbaar wordt (Pi, VPS, `pb.tappenmars.nl`), moet hier alsnog authenticatie bij** — samen met het bredere auth/rollen-besluit. Backend: `pocketbase/pb_hooks/agent.pb.js` + `agent_logica.js` + `agent_uitvoering.js` (endpoints `/api/agent/bericht`, `/api/agent/actie/:id/bevestig`, `/afwijzen`, alle drie hardcoded op `http://127.0.0.1:8090` — moet aangepast bij een Pi/VPS-migratie); systeemprompt in `agent_systeemprompt.md`. Server-only sleutel `ANTHROPIC_API_KEY` in `.env` (ingevuld en actief sinds 3 juli 2026). De oude client-side implementatie (`src/lib/assistent.ts`, met de frontend-var `VITE_ANTHROPIC_API_KEY`) is verwijderd — zie DECISIONS-FASE3.md, sectie "Opschoning client-side assistent-implementatie". Model `claude-sonnet-5`. Schrijfacties gaan altijd via een `agent_acties`-voorstel, nooit direct — de bevestigde actie hergebruikt de bestaande Fase 2-endpoints/logica (`kelder_logica.js`).
- **Wekelijkse inzichten-berekening** (`scripts/bereken-inzichten.mjs`): berekent 5 simpele patronen (brix-verloop, gistingssnelheid/stagnatie, uitval-clusters, GDD-afwijking, fenologie-vergelijking t.o.v. eerdere seizoenen) en schrijft ze naar de `inzichten`-collectie; de agent citeert ze via `zoek_inzichten`. Draait **handmatig, wekelijks** op deze Windows-devmachine (`node scripts/bereken-inzichten.mjs <email> <wachtwoord> [pocketbase-url]`, url optioneel als `VITE_POCKETBASE_URL` in `.env` staat) — pas als de Raspberry Pi productiebackend live is, wordt dit een cron/systemd-timer. Testdata: `scripts/seed-testdata-agent.mjs <email> <wachtwoord> [url] [--cleanup]`.
- **PocketBase JS-SDK auto-cancellation-valkuil** (ontdekt bij Fase 3, geldt app-breed): de client annuleert standaard een eerdere aanroep naar dezelfde URL zodra een tweede binnenkomt. Elke pagina die zowel `AppHeader` (met `VerbindingBadge`/`useVerbinding()`) rendert als zelf data ophaalt via `ensureOnline()`, draait twee onafhankelijke `pingPb()`-lussen die elkaars `pb.health.check()`-aanroep kunnen annuleren — de verliezer rapporteert dan "offline" terwijl de server bereikbaar is. Fix zit al in `pingPb()` (`src/lib/data.ts`): `pb.health.check({ requestKey: null })`. Kom je alsnog een pagina tegen die willekeurig "offline" lijkt te flakkeren vlak na laden: dit is de eerste verdachte.
- **Appnaam is geparametriseerd én definitief**: de naam is **"De Tappenmars Buddy"** (door Thomas gekozen op 16 juli 2026). Alle zichtbare React-plekken (titelbalk, hub, onboarding, installeer-banner, rapportvoetnoot) lezen uit `src/config/app.ts` (`APP_NAAM`/`APP_NAAM_KORT`/`BEDRIJFSNAAM`). Een naamswissel = die constanten wijzigen **plus twee niet-TS-plekken** die geen TypeScript kunnen importeren: `public/manifest.webmanifest` (PWA-naam op het startscherm) en de introductiezin in `pocketbase/pb_hooks/agent_systeemprompt.md`. Nergens anders de naam hardcoden.
- **localStorage-sleutels**: `wg.rijen.v3` (rijen-cache), `wg.wijngaard_config.v1` (config), `wg.instellingen.laatste_module.v1`/`wg.instellingen.auto_start_module.v1` (modulekiezer). Versienummer ophogen = reseed bij volgende app-start.
- **Kelder-module (Tappenmars Buddy), Fase 0–2 gebouwd**: collecties `eigenaars` (Fase 16: heette `producenten`), `partijen` (met eigenaar/opdracht_type/ouder_partij/lotnummer/dichtheden), `tanks` (48 stuks geseed uit Thomas' Excel-tankinventaris; `huidige_partij`/`huidig_volume_l` zijn CACHES), `tankboek` (onwijzigbaar register: API-rules create/update/delete = null), `analyses`, `kelderlog` (werklogboek), `regelgeving_instellingen` (scaffold). Datalagen: `kelder-data.ts` + `partijen-data.ts` (online-only, bewust géén sync-wachtrij). Dichtheidsconversie °Oe↔Brix↔SG in `src/lib/dichtheid.ts` (SG-gebaseerde formule, níet de lineaire benadering). Volgende fases (botteling, voorraad, cuvée/splitsing): zie `ARCHITECTURE.md`.
- **Tankboek-boekingen lopen UITSLUITEND via server-endpoints** (`pocketbase/pb_hooks/kelder.pb.js`): `POST /api/tappenmars/partij-aanmaken`, `/tankboek-boeking`, `/tanks-herbereken`. Atomisch via `runInTransaction`; valideert capaciteit, bronvolume ("systeem toont X L, jij boekt Y L"), doeltank-partij, status, toekomstdatum. Correcties = nieuwe regel met `corrigeert`-verwijzing, nooit bewerken. **Capaciteit-0-garantie (pentest 10 sep. 2026)**: een boeking IN een tank met `capaciteit_l = 0` (bewust bij pulptank/koeltank — capaciteit "nog invullen") wordt hard geweigerd. Eerder behandelde de check `capaciteit > 0` een 0 als "onbeperkt", waardoor een fysiek onmogelijk volume in het onwijzigbare tankboek kon belanden. Bewaakt door rooktest 17. Gevolg: tank 20/21/28 moeten hun echte capaciteit ingevuld krijgen vóór er iets in geboekt kan worden.
- **PocketBase JSVM-valkuilen** (kostte een debugsessie — niet opnieuw ontdekken): (1) routerAdd-handlers draaien in een VM-pool waar closures én top-level functies/const-declaraties uit het .pb.js-bestand NIET bestaan — gedeelde code (én kleine helpers/constanten) via `require(`${\_\_hooks}/bestand.js`)` bínnen de handler (zie `kelder_logica.js`); (2) fouten gegooid binnen `runInTransaction` verliezen hun boodschap — valideer zonder te gooien (retourneer `{ fout }`) en gooi de `BadRequestError` pas buiten de transactie; (3) hooks herladen niet op Windows — PocketBase herstarten na elke wijziging in `pb_hooks/`; (4) **`record.get("jsonveld")` levert géén geparsed object en géén string op, maar een `types.JSONRaw` (een byte-array, `Array<number>`)** — `{...record.get("veld")}` spreidt dan bytes i.p.v. de echte sleutels, wat bv. een correct ingevulde `partij` liet verdwijnen tot "partij is verplicht". Gebruik `.string()` + `JSON.parse()` (zie `leesJsonVeld()` in `pocketbase/pb_hooks/agent_uitvoering.js`) om een json-veld terug te lezen na een `.get()`.
- **Eindsprint-modules gebouwd (juli 2026)**: `/verkoop` (collecties `klanten`+`orders`; leveren UITSLUITEND via `POST /api/tappenmars/order-leveren` — atomisch: voorraadmutaties per orderregel + orderstatus in één transactie), `/kelder/accijns` (pure rekenlib `src/lib/accijns.ts`; bedragen alleen bij geverifieerd tarief in `regelgeving_instellingen`), `/materieel` (collecties `materieel`+`onderhoudslog`), jaarafsluiting op `/kelder/jaaroverzicht` (append-only collectie `archief`), `bodem_observaties` (collectie + agent-tool + invoer-UI op `/bodem` bestaan allemaal — **correctie 9 september 2026**: deze regel beweerde lang "invoer-UI nog niet", dat was stale; `src/routes/bodem.tsx` heeft een echt formulier met pH/gebrek/verslemping/notitie en een opslaan-mutatie). Rollen: het rolmodel (`users.rol`, beheerder/medewerker/alleen_lezen) is per 22 augustus 2026 NIET meer actief — zie "Inloggen verwijderd". De code (`rolVan`/`eisSchrijfrecht`/`eisBeheerder` in `kelder_logica.js`) staat er nog en laat alles door; het gebruikersbeheer in /instellingen is verwijderd, `gebruikers.pb.js` behoudt bewust zijn `requireAuth()`. Agent-tool-registry telt 24 tools over 6 modules (kelder/wijngaard/voorraad/verkoop/materieel/algemeen).
- **Superuser-credentials** (`pocketbase/backup-credentials.txt`): Thomas gaf op 16 juli 2026 expliciet toestemming om deze te gebruiken voor schema-runs en beheer-API-operaties. Losse bulk-deleties kunnen alsnog een aparte bevestiging van de permissielaag vragen.
- **Fase 7 (Kelder Pro, juli 2026) gebouwd**: oenologische calculators (src/lib/oenologie.ts + docs/oenologie-formules.md, formule-versie in elke kelderlognotitie), verliezenboekhouding (opt-in verliesvoorstel bij overhevelen), reinigingslog + tankhistorie + hygiëne-waarschuwing, /kelder/qr (QR-printvel), controle-pakket-ZIP op /kelder/accijns (jszip), Ctgb-middelen (collectie middelen + scripts/import-ctgb.mjs + restrictiecheck in /werkrapport), voorspellende gistingscurve (src/lib/gisting-verwachting.ts), sensor-endpoint POST /api/sensor/meting (pb_hooks/sensor.pb.js, X-Sensor-Token uit .env; collectie sensor_metingen append-only; JSVM-valkuil 5: een gehele number-literal in DynamicModel wordt int64 — gebruik 0.1 als float-shape), sensoriek (collectie proefnotities + zoek_proefnotities). Security: EXIF-strip verplicht in foto-compressie.ts, backup-monitoring (statusrecord laatste_backup + hub-widget/melding), docs/security.md + docs/privacy.md. Agent-registry: 30 tools, module oenologie toegevoegd.
- **TanStack Router — routes onder een bestaande pagina nesten automatisch.** Een bestand als `kelder.tanks.tsx` wordt door de router-generator een kind-route van `kelder.tsx` zodra die bestaat, en dan moet `kelder.tsx` een `<Outlet />` bevatten (patroon: `rij.$rijId.tsx`) — anders rendert de kind-route de verkeerde inhoud (dit ging eerder mis). Wil je bewust een "vlakke" route zonder nesting terwijl de ouder al bestaat, gebruik dan de trailing-underscore-escape (`kelder_.partijen.tsx` → `/kelder/partijen`, geen parent-layout).
- **Schema-migratie — keuzelijstwaarden toegevoegd via `ensureVelden()` worden NIET automatisch gesynchroniseerd.** `synchroniseerKeuzelijsten()` (draait binnen `ensureCollection()`) vergelijkt alleen de select-velden die in de oorspronkelijke collectiedefinitie staan; een veld dat later via `ensureVelden()` is toegevoegd (bijv. `sensor_metingen.bron_type`, Fase 14) valt daarbuiten. Ontdekt in Fase 17 toen `+pasteurisatie_run` aan `SENSOR_BRON_TYPES` wél in de code stond maar niet in de live database landde. Gebruik voor dit geval de generieke helper `ensureKeuzelijstWaarden(collectie, veld, waarden)` (`scripts/setup-pocketbase.mjs`) — vierde variant van hetzelfde architecturale gat dat hierboven al drie keer eerder is gevonden (API-regels, keuzelijstwaarden in de hoofddefinitie, `required`-vlaggen).
- **Fase 17 (pasteurisatiemonitor & drukveiligheid, september 2026) gebouwd**: rekenkernen `src/lib/pasteurisatie.ts` (PU, trapeziumintegratie over de volledige curve) en `src/lib/drukveiligheid.ts` (gekoppeld CO2/thermische-uitzetting/waterdamp-massabalansmodel + een conservatieve bovengrens die het veiligheidsoordeel bepaalt — zie `docs/pasteurisatie-formules.md` voor bronnen/aannames en `docs/pasteurisatie-werkwijze.md` voor de werkwijze). Collecties `sluitingen`, `pasteurisatie_runs`, `pasteurisatie_certificaten`, `rekenmodel_validaties`. Endpoints in `pocketbase/pb_hooks/pasteurisatie.pb.js`/`pasteurisatie_logica.js`: run starten (zoekt/maakt partij op lotnummer, atomisch met de kelderlog-openingsregel), run afronden (idem met de eindregel — de PU-eindberekening gebeurt CLIENT-side met de geteste TS-module, niet nogmaals in JSVM, om drift tussen twee implementaties te voorkomen), en een open meting-endpoint (`/api/tappenmars/pasteurisatie-meting`, geen sensor-token — voor de live-monitor-UI en handmatige invoer; het bestaande token-beveiligde `/api/sensor/meting` blijft voor echte hardware). Meldingen (doel-PU/bovengrens/drukmarge/sensoruitval) liften mee op de bestaande signaallaag (Fase 10) via `sensor_alerts`-records met de Fase 14-naamconventie — geen nieuwe signaalproducent nodig. Certificaat-PDF met een handgetekende temperatuurcurve via `jspdf` (geen bestaande PDF-met-grafiek-generator in de codebase vóór deze fase). Agent-registry: module `pasteurisatie` met `bereken_pu`/`bereken_druk` als bewust GEDUPLICEERDE vereenvoudigde formules in JSVM (kan geen TS-modules importeren, zelfde beperking als `sensor.pb.js`) — bij een wijziging in de "echte" formules ook hier bijwerken. **Belangrijke correctie tijdens de bouw**: een eerder verondersteld ijkpunt voor de CO2-drukformule (2,2 bar/10°C → ~8 bar/48°C) bleek zelf een berekening te zijn, geen meting — Thomas bevestigde dit expliciet en het model is daarna herbouwd zonder dat ijkpunt. Elke uitkomst draagt `gevalideerd: false` tot een echte, nagemeten run dat bevestigt (beheerbaar via Instellingen → Validatiestatus rekenmodellen). `PROJECT-NOTEBOOK.md` bestaat niet in deze repo (fantoomverwijzing, zelfde patroon als eerder geconstateerd bij andere niet-bestaande documenten) — dit `CLAUDE.md` en `WERKLOG.md` zijn de bijgewerkte documentatie voor deze fase.
- **Fase 21 (wat-als-simulatielaag, september 2026) gebouwd — alleen pasteurisatie**: `src/lib/simulatie.ts` is een gedeeld _contract_ (`SimulatieResultaat<T>` met status `ok`/`onvoldoende_data`/`model_ontbreekt`, bandbreedte, aannames, `gevalideerd`-vlag), **bewust GEEN gedeelde uitvoeringsmotor** — zie `ONTWERP-SIMULATIE-1-ARCHITECTUUR.md` voor het weerwoord waarom drie domeinen met tijdschalen van minuten/dagen/weken geen gemeenschappelijke rekenmotor delen. `synthetiseerCurve()` (in `pasteurisatie.ts`) bouwt een hypothetische opwarm/houd/afkoel-curve, `simuleerRun()` (in `pasteurisatie-simulatie.ts`) legt daar de BESTAANDE `puOverCurve`/`verwachteDruk`/`veiligheidsoordeel` overheen — geen tweede implementatie van dezelfde som (vastgelegd in een test). UI: één opvouwbaar paneel op `/pasteurisatie/plannen`, plus `src/components/wat-als.tsx`; sinds 9 september 2026 ook een vergelijkingssectie ("+ Vergelijk met een tweede scenario") die scenario A en B naast elkaar toont in één gecombineerde grafiek — daar krijgt de houdtemperatuur WEL een los veld per scenario (in tegenstelling tot de eerste bouwstap), want twee temperaturen naast elkaar tonen is daar het hele punt; het onderscheid wordt met naamgeving opgelost ("Scenario A"/"Scenario B" overal expliciet), niet met vermijden. **Harde eis, bewaakt door rooktest 7**: een doorrekening is ALTIJD als simulatie gemarkeerd, en bij een drukuitkomst staat de niet-gevalideerd-tekst er NAAST (nooit in plaats van) — een simulatie op een ongevalideerd model is dubbel onzeker. **Nadrukkelijk niet gebouwd**: wat-als voor gisting of rijping. Die domeinmodellen (temperatuur→gistingssnelheid, weer/GDD→rijpheid) BESTAAN NIET — `gisting-verwachting.ts` kent niet eens een temperatuur-invoer en `gdd.ts` is enkel een warmtesom. Een badge daarop plakken zou schijnzekerheid wekken; randvoorwaarden voor wanneer die modellen wél gebouwd kunnen worden staan in `ONTWERP-SIMULATIE-2-PASTEURISATIE-PAD.md`. Kettingsimulaties (samengestelde wat-als-vragen) zijn een bewust ontwerpstandpunt van Thomas: niet doen, onzekerheden stapelen sneller dan mensen aanvoelen. Let op: `scripts/*.mjs` kan GEEN TS uit `src/` importeren (kale Node, geen transpiler), dus de curvegenerator bestaat bewust twee keer — de lib-versie (deterministisch) voor de app, de seed-versie (mét ruis/meetgaten) voor testdata.
