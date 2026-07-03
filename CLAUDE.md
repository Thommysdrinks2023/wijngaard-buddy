# Wijngaard Buddy — CLAUDE.md

Projectinstructies voor Claude Code. Lees dit aan het begin van elke sessie. Lees ook `ARCHITECTURE.md` — het autoritatieve systeemontwerp voor de uitbouw naar **Tappenmars Buddy** (modulair bedrijfsdashboard met Wijngaard/Kelder/Voorraad). Kelder Fase 0–2 is gebouwd (partijen, tankbeheer, tankboek met validatieregels, analyses, kelderlog); botteling en voorraad (Fase 3+) nog niet.

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

| Route                 | Pagina                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Modulekiezer (tegels: Wijngaard, Kelder, Voorraad [binnenkort], Assistent)                                                         |
| `/wijngaard`          | Redirect naar `/perceelkaart` — bestaande wijngaardmodule, ongewijzigd                                                             |
| `/perceelkaart`       | SVG bovenaanzicht van de wijngaard                                                                                                 |
| `/rij/$rijId`         | Rij-detail (metingen, observaties, fenologie)                                                                                      |
| `/rij/$rijId/planten` | Plant-status per vak in de rij                                                                                                     |
| `/snel`               | Snelle Brix-meting in 3 tikken                                                                                                     |
| `/scan`               | QR-scanner (rijpalen)                                                                                                              |
| `/kelder`             | Kelderdashboard: tankinventaris (48 tanks), actieve partijen, kerncijfers                                                          |
| `/kelder/partijen`    | Partijenlijst; `/kelder/partijen/nieuw` (met eerste vulling), `/kelder/partijen/$partijId` (detail: tankboek, analyses, kelderlog) |
| `/kelder/tanks`       | Tankbeheer; `/kelder/tanks/$tankId` (detail + historie + herbereken)                                                               |
| `/kelder/overhevelen` | Overhevel-formulier (servervalidatie)                                                                                              |
| `/kelder/tankboek`    | Onwijzigbaar register, filterbaar, printbaar                                                                                       |
| `/assistent`          | AI-agent (Fase 3): gesprekken, bevestigingskaarten, foto-analyse — vereist inloggen                                                |
| `/instellingen`       | App- en wijngaard-instellingen (incl. "start direct in laatst gebruikte module")                                                   |

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
VITE_ANTHROPIC_API_KEY=sk-ant-...   # Nog niet ingevuld — assistent werkt zonder
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
- **Routing**: TanStack Router file-based. Nieuwe pagina = nieuw bestand in `src/routes/`. Voer daarna `bun run dev` uit zodat `routeTree.gen.ts` automatisch bijgewerkt wordt.
- **Data**: queries via TanStack Query (`useQuery`). Alle PocketBase-calls zitten in `src/lib/data.ts`.
- **Componenten**: geen commentaar tenzij de _reden_ niet-voor-de-hand-liggend is; geen multi-regel docstrings.

## Aandachtspunten

- **Spelling ras**: "Souvignier Gris" (niet "Souveginier"). Staat in `seed-rijen.ts`, `RAS_KLEUR` in meerdere routes, en PocketBase seed-script.
- **Rij 23/24**: hebben `planten_per_vak: 4` (standaard = 5). De perceelkaart-SVG gebruikt `fysiekeLengteBasis()` om de _fysieke_ rijlengte te berekenen, niet het plantaantal — niet aanpassen zonder die helper te begrijpen.
- **Rij 69**: stompje-rij, 36 planten. In de perceelkaart-SVG groeit hij van _onder_ naar boven (`groeitVanOnder = true`).
- **PocketBase setup-script** (`scripts/setup-pocketbase.mjs`): idempotent. Doet upsert (PATCH bestaand / POST nieuw) + verwijdert rijen die niet in de seed staan. Veilig om meerdere keren te draaien.
- **Netlify**: nog niet live. Deployment-configuratie bestaat (`wrangler.jsonc`), maar de site wordt nog lokaal gebruikt.
- **VPS (Hetzner)**: PocketBase draait niet op de VPS — wachtwoord reset nodig via Hetzner-console. Plan: `pb.tappenmars.nl` voor HTTPS-productie, SSL via Cloud86.
- **Raspberry Pi migratie**: gepland als productie-backend (lokaal in de schuur), nog niet uitgevoerd.
- **/assistent route (Fase 3, AI-agent) gebouwd**: chatscherm met bevestigingskaarten per actietype, gesprekkenlijst, fotoknop, bronnenregel, feedback-knoppen. Vereist inloggen (in tegenstelling tot de rest van de Wijngaard-module) — alle agent-collecties hebben `AUTH_RULE`. Backend: `pocketbase/pb_hooks/agent.pb.js` + `agent_logica.js` + `agent_uitvoering.js` (endpoints `/api/agent/bericht`, `/api/agent/actie/:id/bevestig`, `/afwijzen`); systeemprompt in `agent_systeemprompt.md`. Server-only sleutel `ANTHROPIC_API_KEY` in `.env` (nog leeg — zie DECISIONS-FASE3.md "Open punten"; niet te verwarren met de frontend-var `VITE_ANTHROPIC_API_KEY`, die na Fase 3 niet meer gebruikt wordt). Model `claude-sonnet-5`. Schrijfacties gaan altijd via een `agent_acties`-voorstel, nooit direct — de bevestigde actie hergebruikt de bestaande Fase 2-endpoints/logica (`kelder_logica.js`).
- **Wekelijkse inzichten-berekening** (`scripts/bereken-inzichten.mjs`): berekent 5 simpele patronen (brix-verloop, gistingssnelheid/stagnatie, uitval-clusters, GDD-afwijking, fenologie-vergelijking t.o.v. eerdere seizoenen) en schrijft ze naar de `inzichten`-collectie; de agent citeert ze via `zoek_inzichten`. Draait **handmatig, wekelijks** op deze Windows-devmachine (`node scripts/bereken-inzichten.mjs <email> <wachtwoord> [pocketbase-url]`, url optioneel als `VITE_POCKETBASE_URL` in `.env` staat) — pas als de Raspberry Pi productiebackend live is, wordt dit een cron/systemd-timer. Testdata: `scripts/seed-testdata-agent.mjs <email> <wachtwoord> [url] [--cleanup]`.
- **PocketBase JS-SDK auto-cancellation-valkuil** (ontdekt bij Fase 3, geldt app-breed): de client annuleert standaard een eerdere aanroep naar dezelfde URL zodra een tweede binnenkomt. Elke pagina die zowel `AppHeader` (met `VerbindingBadge`/`useVerbinding()`) rendert als zelf data ophaalt via `ensureOnline()`, draait twee onafhankelijke `pingPb()`-lussen die elkaars `pb.health.check()`-aanroep kunnen annuleren — de verliezer rapporteert dan "offline" terwijl de server bereikbaar is. Fix zit al in `pingPb()` (`src/lib/data.ts`): `pb.health.check({ requestKey: null })`. Kom je alsnog een pagina tegen die willekeurig "offline" lijkt te flakkeren vlak na laden: dit is de eerste verdachte.
- **localStorage-sleutels**: `wg.rijen.v3` (rijen-cache), `wg.wijngaard_config.v1` (config), `wg.instellingen.laatste_module.v1`/`wg.instellingen.auto_start_module.v1` (modulekiezer). Versienummer ophogen = reseed bij volgende app-start.
- **Kelder-module (Tappenmars Buddy), Fase 0–2 gebouwd**: collecties `producenten`, `partijen` (met producent/opdracht_type/ouder_partij/lotnummer/dichtheden), `tanks` (48 stuks geseed uit Thomas' Excel-tankinventaris; `huidige_partij`/`huidig_volume_l` zijn CACHES), `tankboek` (onwijzigbaar register: API-rules create/update/delete = null), `analyses`, `kelderlog` (werklogboek), `regelgeving_instellingen` (scaffold). Datalagen: `kelder-data.ts` + `partijen-data.ts` (online-only, bewust géén sync-wachtrij). Dichtheidsconversie °Oe↔Brix↔SG in `src/lib/dichtheid.ts` (SG-gebaseerde formule, níet de lineaire benadering). Volgende fases (botteling, voorraad, cuvée/splitsing): zie `ARCHITECTURE.md`.
- **Tankboek-boekingen lopen UITSLUITEND via server-endpoints** (`pocketbase/pb_hooks/kelder.pb.js`): `POST /api/tappenmars/partij-aanmaken`, `/tankboek-boeking`, `/tanks-herbereken`. Atomisch via `runInTransaction`; valideert capaciteit, bronvolume ("systeem toont X L, jij boekt Y L"), doeltank-partij, status, toekomstdatum. Correcties = nieuwe regel met `corrigeert`-verwijzing, nooit bewerken.
- **PocketBase JSVM-valkuilen** (kostte een debugsessie — niet opnieuw ontdekken): (1) routerAdd-handlers draaien in een VM-pool waar closures én top-level functies/const-declaraties uit het .pb.js-bestand NIET bestaan — gedeelde code (én kleine helpers/constanten) via `require(`${\_\_hooks}/bestand.js`)` bínnen de handler (zie `kelder_logica.js`); (2) fouten gegooid binnen `runInTransaction` verliezen hun boodschap — valideer zonder te gooien (retourneer `{ fout }`) en gooi de `BadRequestError` pas buiten de transactie; (3) hooks herladen niet op Windows — PocketBase herstarten na elke wijziging in `pb_hooks/`; (4) **`record.get("jsonveld")` levert géén geparsed object en géén string op, maar een `types.JSONRaw` (een byte-array, `Array<number>`)** — `{...record.get("veld")}` spreidt dan bytes i.p.v. de echte sleutels, wat bv. een correct ingevulde `partij` liet verdwijnen tot "partij is verplicht". Gebruik `.string()` + `JSON.parse()` (zie `leesJsonVeld()` in `pocketbase/pb_hooks/agent_uitvoering.js`) om een json-veld terug te lezen na een `.get()`.
- **TanStack Router — routes onder een bestaande pagina nesten automatisch.** Een bestand als `kelder.tanks.tsx` wordt door de router-generator een kind-route van `kelder.tsx` zodra die bestaat, en dan moet `kelder.tsx` een `<Outlet />` bevatten (patroon: `rij.$rijId.tsx`) — anders rendert de kind-route de verkeerde inhoud (dit ging eerder mis). Wil je bewust een "vlakke" route zonder nesting terwijl de ouder al bestaat, gebruik dan de trailing-underscore-escape (`kelder_.partijen.tsx` → `/kelder/partijen`, geen parent-layout).
