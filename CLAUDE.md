# Wijngaard Buddy — CLAUDE.md

Projectinstructies voor Claude Code. Lees dit aan het begin van elke sessie.

## Wat is dit?

**Wijngaard Buddy** is een Progressive Web App (PWA) voor het beheren van wijngaard **De Tappenmars** in Den Ham (Overijssel). Eigenaar: Thomas (thomas@tappenmars.nl).

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
| Route | Pagina |
|---|---|
| `/` | Dashboard |
| `/perceelkaart` | SVG bovenaanzicht van de wijngaard |
| `/rij/$rijId` | Rij-detail (metingen, observaties, fenologie) |
| `/rij/$rijId/planten` | Plant-status per vak in de rij |
| `/snel` | Snelle Brix-meting in 3 tikken |
| `/scan` | QR-scanner (rijpalen) |
| `/assistent` | AI-assistent (Claude, in opbouw) |
| `/instellingen` | App- en wijngaard-instellingen |

## Dev-omgeving opstarten

**Vereiste:** Bun geïnstalleerd (`bun --version`).

```bash
# 1. PocketBase starten (aparte terminal, in projectmap)
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
- **Componenten**: geen commentaar tenzij de *reden* niet-voor-de-hand-liggend is; geen multi-regel docstrings.

## Aandachtspunten

- **Spelling ras**: "Souvignier Gris" (niet "Souveginier"). Staat in `seed-rijen.ts`, `RAS_KLEUR` in meerdere routes, en PocketBase seed-script.
- **Rij 23/24**: hebben `planten_per_vak: 4` (standaard = 5). De perceelkaart-SVG gebruikt `fysiekeLengteBasis()` om de *fysieke* rijlengte te berekenen, niet het plantaantal — niet aanpassen zonder die helper te begrijpen.
- **Rij 69**: stompje-rij, 36 planten. In de perceelkaart-SVG groeit hij van *onder* naar boven (`groeitVanOnder = true`).
- **PocketBase setup-script** (`scripts/setup-pocketbase.mjs`): idempotent. Doet upsert (PATCH bestaand / POST nieuw) + verwijdert rijen die niet in de seed staan. Veilig om meerdere keren te draaien.
- **Netlify**: nog niet live. Deployment-configuratie bestaat (`wrangler.jsonc`), maar de site wordt nog lokaal gebruikt.
- **VPS (Hetzner)**: PocketBase draait niet op de VPS — wachtwoord reset nodig via Hetzner-console. Plan: `pb.tappenmars.nl` voor HTTPS-productie, SSL via Cloud86.
- **Raspberry Pi migratie**: gepland als productie-backend (lokaal in de schuur), nog niet uitgevoerd.
- **/assistent route**: in opbouw. `VITE_ANTHROPIC_API_KEY` nog niet ingesteld — de pagina laadt maar AI-gesprekken werken niet zonder sleutel.
- **localStorage-sleutels**: `wg.rijen.v3` (rijen-cache), `wg.wijngaard_config.v1` (config). Versienummer ophogen = reseed bij volgende app-start.
