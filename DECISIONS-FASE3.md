# Fase 3 — AI Agent: beslissingenlog

Autonome bouwsessie. Elke zelfstandige beslissing, afwijking en eigenaardigheid staat hieronder met motivatie, oplopend per blok. Lees dit eerst.

## Vooraf: discrepanties tussen de opdracht en de werkelijke codebase

1. **`pb_hooks/assistent.pb.js` bestaat niet.** De opdracht zegt "er bestaat al een AI-proxy in pb_hooks/assistent.pb.js" — dit klopt niet. De huidige `/assistent`-implementatie (`src/lib/assistent.ts`) roept de Anthropic API **rechtstreeks vanuit de browser** aan met `VITE_ANTHROPIC_API_KEY` (Vite-buildtime-variabele, in de bundel zichtbaar). Er is geen serverproxy. ARCHITECTURE.md §6.1 beschrijft dit ook als "twee generaties", maar de tweede generatie (de hook) is nooit gebouwd — alleen gepland. **Gevolg**: Fase 3 bouwt de hook vanaf nul, niet als verplaatsing van bestaande code.
2. **"Hergebruik de bestaande omgevingsvariabele die assistent.pb.js al gebruikt" is daardoor niet uitvoerbaar** — die hook en dus die variabele bestaan niet. Bovendien is `VITE_ANTHROPIC_API_KEY` sowieso ongeschikt voor servergebruik: het is een Vite-buildtime-var (frontendbundel), geen OS-omgevingsvariabele die het PocketBase-proces kan lezen. **Beslissing**: nieuwe server-only variabele `ANTHROPIC_API_KEY` (geen `VITE_`-prefix) toegevoegd. PocketBase leest omgevingsvariabelen via `$os.getenv()` (bevestigd in `pb_data/types.d.ts`), maar laadt zelf geen `.env`-bestand. `deploy/start-pocketbase.bat` is daarom uitgebreid om `.env` in de projectroot in te lezen en te exporteren vóór het starten van `pocketbase.exe` — zonder het bestand zelf aan te raken qua git-status (blijft genegeerd).
3. **`VITE_ANTHROPIC_API_KEY` staat in `.env` maar is LEEG.** CLAUDE.md klopt hier dus wel: er is geen werkende sleutel. **Belangrijke consequentie**: de agent-loop kan tijdens deze sessie niet end-to-end tegen de echte Anthropic API getest worden — zie "Open punten". Ik heb `ANTHROPIC_API_KEY=` (leeg, met toelichting) toegevoegd aan `.env` en `.env.example` zodat Thomas alleen die ene regel hoeft in te vullen. `VITE_ANTHROPIC_API_KEY` wordt na Fase 3 niet meer gebruikt (browser-implementatie vervangen door de serverhook) maar laat ik ongemoeid staan — verwijderen is cosmetisch.
4. **PocketBase JSVM-mogelijkheden geverifieerd vóór het bouwen** (voorkomt de eigenaardigheden uit CLAUDE.md): `$http.send()` bestaat voor uitgaande calls (nodig voor de Anthropic-aanroep vanaf de server), `$os.getenv()` voor omgevingsvariabelen. Geen ingebouwde base64-encoder gevonden in de JSVM-globals — voor `analyseer_foto` is een handgeschreven base64-encoder nodig (zie Blok C).
5b. **`schtasks /End /TN "..."` stopt niet altijd het echte `pocketbase.exe`-proces.** De taak zelf rapporteert "terminated successfully", maar het onderliggende `pocketbase.exe` (gestart via het bat-bestand) bleef als wees-proces doordraaien — waarschijnlijk omdat Task Scheduler alleen de directe cmd.exe-wrapper beëindigt, niet het kleinkind-proces. Voor een écht herstart (bijv. na een `.env`-wijziging): `Get-Process pocketbase | Stop-Process -Force` vóór `schtasks /Run`. Toegevoegd aan CLAUDE.md.
5. **Twee bekende PocketBase-eigenaardigheden uit CLAUDE.md blijven van kracht** en zijn vanaf het begin verwerkt in `agent.pb.js`/`agent_logica.js`: (a) gedeelde code via `require()` binnen elke handler, nooit top-level in het `.pb.js`-bestand; (b) fouten binnen `runInTransaction` verliezen hun boodschap — valideren zonder te gooien, `{ fout }` teruggeven.

## Blok A — Schema

- 5 collecties toegevoegd aan `setup-pocketbase.mjs`: `agent_gesprekken`, `agent_berichten`, `agent_acties`, `inzichten`, `advies_feedback`. Alle velden/select-waarden exact per opdracht; `deleted`-vlag toegevoegd waar de opdracht dat vermeldt (soft-delete, consistent met bestaand patroon in bv. `analyses`/`kelderlog` niet aanwezig maar wél expliciet gevraagd voor deze vier — overgenomen).
- **`agent_acties` heeft `createRule`/`updateRule`/`deleteRule` op `null`** (net als `tankboek`): de client mag voorstellen alleen lézen. Alleen de agent-hook (met superuser-rechten binnen de hook-context) mag ze aanmaken/bijwerken. Dit dwingt "bevestigen vóór boeken" ook op API-niveau af, niet alleen in de UI.
- `usersCol` (PocketBase's ingebouwde auth-collectie) was nog niet als variabele beschikbaar in het script — toegevoegd via `api("/api/collections/users")`, nodig als relatie-doel voor `gebruiker`/`bevestigd_door`/`gegeven_door`.
- **Oude `ai_gesprekken`-collectie (client-side chatgeschiedenis) blijft ongemoeid staan**, ook al vervangt Fase 3 die functionaliteit volledig. Verwijderen is destructief en niet expliciet gevraagd — "niet slopen"-principe. Kan later opgeruimd worden.
- Twee testruns (create + idempotent) + curl-check van `agent_acties`-API-rules: geslaagd.

## Blok B+C — Agent-loop + tools
_(wordt aangevuld tijdens het bouwen)_

## Blok D — Bevestigingsflow
_(wordt aangevuld tijdens het bouwen)_

## Blok G — Systeemprompt
_(wordt aangevuld tijdens het bouwen)_

## Blok H — Frontend
_(wordt aangevuld tijdens het bouwen)_

## Blok E — Inzichten
_(wordt aangevuld tijdens het bouwen)_

## Blok F — Web search
_(wordt aangevuld tijdens het bouwen)_

## Open punten

- **Geen werkende Anthropic API-sleutel beschikbaar** (`.env` heeft `VITE_ANTHROPIC_API_KEY=` leeg, en er is nog geen `ANTHROPIC_API_KEY`). Alle onderdelen die een echte Claude-aanroep vereisen (agent-loop, tool-gebruik, foto-analyse, de meeste testchecklist-punten) zijn daarom gebouwd en zo goed mogelijk statisch/structureel getest (schema, endpoints bestaan en valideren correct, foutafhandeling bij ontbrekende sleutel), maar NIET end-to-end geverifieerd tegen de echte API. Zodra Thomas een sleutel invult bij `ANTHROPIC_API_KEY` in `.env` (en de Taakplanner-taak herstart, zie CLAUDE.md), is dat de eerste test.

## Oplevering
_(aan het eind ingevuld)_
