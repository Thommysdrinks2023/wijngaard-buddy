# Kelder-uitbreiding — beslissingenlog

Autonome bouwsessie, vervolg op Fase 0–2 (kelder-basis) en Fase 3 (AI-agent). Verwerkt ontbrekende velden uit `Tankboek_Leeg.xlsx` en `Logboek_leeg.xlsx` in de bestaande Kelder-module. Zie `DECISIONS-FASE3.md` voor de bekende PocketBase-JSVM-eigenaardigheden (JSONRaw-valkuil, VM-pool-isolatie voor top-level declaraties in `.pb.js`-bestanden) — die gelden hier onverkort. Vóóraf: `pb_data` gekopieerd naar `pb_data_backup_kelderuitbreiding`.

## Blok 1 — Tanktypes

**Discrepantie met de opdracht**: de opdracht gaat ervan uit dat er een vaste enum `tank_type` (`stainless_steel, wooden_barrel, carboy, other`) bestaat die de Excel-waarden niet dekt, en stelt voor om daarnaast een los `tank_type_label`-tekstveld toe te voegen. **Die enum bestaat niet in deze codebase.** De `tanks`-collectie heeft al sinds Fase 0–2 een vrij tekstveld `soort` (zie `scripts/setup-pocketbase.mjs` `SEED_TANKS`), en dat veld is bij het bouwen van Fase 0–2 al 1-op-1 geseed uit dezelfde Excel — geverifieerd tegen de 48 live tank-records: alle codes 1–47 + IBC1 bestaan, en elke `soort`-waarde komt exact overeen met de tabel uit deze opdracht (`IM530`, `650`, `1050`, `IM1100`, `IM1600`, `IM2200`, `Pulptank`, `koeltank`, `525 onder`, `525 boven`, `IBC1000`), zonder rest-spaties (de seed-array is handgeschreven, niet uit een ruwe Excel-parse, dus dat probleem doet zich hier niet voor).

**Beslissing**: geen nieuw `tank_type_label`-veld, geen schemawijziging in Blok 1 — dat zou een exacte duplicaat zijn van een veld dat al bestaat en al correct gevuld is. In plaats daarvan alleen de twee dingen die nog echt ontbraken:

1. **UI toonde het type al** (`kelder.tanks.index.tsx` regel `· {t.soort} ·`, en `kelder.tanks.$tankId.tsx`'s `AppHeader subtitle`) — dit deel van de "test" was dus al vervuld vóór deze sessie.
2. **De "IM = zwemdekseltank"-toelichting stond alleen als codecommentaar** (`SEED_TANKS`-comment en `Tank`-interface-comment in `types.ts`), nooit zichtbaar voor Thomas. Toegevoegd: een voorwaardelijke regel "IM = zwemdekseltank" boven de tanklijst (alleen zichtbaar als er minstens één IM-tank in de lijst staat) en een uitgeschreven `(zwemdekseltank)`-suffix in de subtitle van de tankdetailpagina wanneer die tank een IM-type heeft.
3. **43/44 (`525 onder`/`525 boven`)**: bevestigd twee losse tankrecords, geen koppelmechanisme in de bestaande data — conform de default uit de opdracht, niets aan te passen.

Geen `setup-pocketbase.mjs`-wijziging nodig voor dit blok (geen nieuwe velden, geen her-seed).

**Test**: tanklijst en tankdetail tonen `soort` al voor alle 48 tanks; IM-toelichting nu zichtbaar in beide schermen. Geverifieerd in de browserpreview (zie rooktest onderaan).
