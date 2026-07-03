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

## Blok 2 — Partijformulier + partij_toevoegingen

**Nog een discrepantie met de opdracht**: `gist` stond al in het Fase 0-2-schema van `partijen` (zie `ensureVelden("partijen", [...])`, sectie 3a-4) én al in het partijformulier — niet opnieuw toegevoegd, dat zou een dubbel veld zijn geworden. De overige 6 velden (`ontstelen`, `voorklaren`, `ph_bij_aanmaak`, `totaal_zuur_bij_aanmaak`, `standtijd`, `koeling`) ontbraken wél en zijn toegevoegd via een nieuwe `ensureVelden`-aanroep in `setup-pocketbase.mjs`.

- **Naamgeving `created_at`/`created_by` → `created`/`updated` (autodate) + `ingevoerd_door`**: de opdracht noemt `created_at, created_by` voor `partij_toevoegingen`, maar dat past niet bij de bestaande conventie (alle andere kelder-collecties gebruiken PocketBase's `autodate`-velden `created`/`updated` plus een los tekstveld `ingevoerd_door` — geen relatie naar `users`). Aangehouden voor consistentie met `analyses`/`kelderlog`.
- **`partij_toevoegingen` is een gewone AUTH_RULE-collectie**, geen lockdown zoals `tankboek`: het is geen wettelijk volume-register, dus create/update/delete staat open voor ingelogde gebruikers — zelfde niveau als `analyses`/`kelderlog`. Geen custom server-endpoint nodig; rechtstreeks via `pb.collection("partij_toevoegingen")` in `kelder-data.ts`, exact het patroon van `createAnalyse`/`createKelderlog`.
- **`TOEVOEGING_EENHEDEN` is een eigen enum**, bewust niet hergebruikt van `KELDERLOG_EENHEDEN` (die is afgekort: `g/kg/ml/l/g_hl/mg_l`) — de opdracht vroeg expliciet voluit geschreven waarden (`gram/kilogram/ml/liter/mg_per_liter`), en het zijn twee verschillende collecties zonder gedeelde betekenis.
- **`VEELGEBRUIKTE_TOEVOEGINGEN`** (Bentoniet, Oenopur, Go-Ferm, Pro-ferm, Sulfiet, Aktivkohle, Panzym extract, Ao/Fo) is een HTML `<datalist>` gekoppeld aan het naam-veld — blijft vrije tekst (geen `<select>`), user kan gewoon iets nieuws typen.
- **Tankboek-historie was al prominent zichtbaar** op het partijdetail-scherm: het staat al als eerste lijst-sectie direct onder de statuskaart en acties, vóór Analyses/Toevoegingen/Logboek, en toont (in tegenstelling tot Analyses/Kelderlog) de volledige historie zonder `.slice()`. Geen wijziging nodig — de gevraagde "handmatige Excel-verwijzing overbodig maken" was hier al het geval.
- **Vierde actieknop "Toevoeging"** toegevoegd naast Overhevelen/Analyse/Logboek (grid van 3 naar 4 kolommen). Nieuwe sectie "Verwerking" op het partijdetail-scherm toont de 6 nieuwe velden samengevat in één regel, maar alléén als er minstens één is ingevuld (voorkomt lege ruis bij oudere partijen).
- **Live getest** in de browserpreview (tijdelijk testaccount, zie Blok 1-noot): nieuwe partij aangemaakt met `ontstelen`/`voorklaren` aangevinkt, gist "Lalvin QA23", pH 3.4, totaal zuur 6.2, standtijd "24 uur", koeling "4 graden, 2 dagen" → partijdetail toont exact "Ontsteeld · Voorgeklaard · pH 3.4 · Totaal zuur 6.2 · Standtijd 24 uur · Koeling: 4 graden, 2 dagen". Drie toevoegingen met alle drie een andere eenheid (Bentoniet 50 gram, Go-Ferm 0,5 kilogram, Sulfiet 80 mg/liter) → lijst toont alle drie correct met eenheid-label. Testpartij + toevoegingen achteraf verwijderd.
- **Tooling-kanttekening (geen appbug)**: de preview-browser accepteerde synthetische klik-events op checkboxes/knoppen niet altijd (React-state bleef ongewijzigd na een CDP-`click`); een `element.click()`-aanroep vanuit de paginacontext zelf werkte wel betrouwbaar. Puur een testomgeving-eigenaardigheid, losstaand van de applicatiecode.

## Blok 3 — Voedingswaarde-/etiketberekening

### Handmatige natelling vooraf (verplicht volgens de opdracht, vóór implementatie)

Testwaarden: alcohol 85 g/l, restsuiker 2 g/l, zuur 6 g/l, glycerine 8 g/l (default).

Per 100 ml (= g/l ÷ 10): alcohol 8,5 · restsuiker 0,2 · zuur 0,6 · glycerine 0,8.

Kcal per component (per 100 ml × factor):

- alcohol: 8,5 × 7 = 59,5
- restsuiker: 0,2 × 4 = 0,8
- glycerine: 0,8 × 2,4 = 1,92
- zuur: 0,6 × 3 = 1,8

Ongeronde som: 59,5 + 0,8 + 1,92 + 1,8 = **64,02** → `kcal_totaal` (afgerond) = **64**.
`kj_totaal` = 64 × 4,25 = **272**.
`koolhydraten_totaal` (glycerine + restsuiker per 100 ml) = 0,8 + 0,2 = **1,0 gram**.
`waarvan suiker` (restsuiker per 100 ml) = **0,2 gram**.

**Verwachte uitkomst voor deze testinvoer**: `kcal_totaal = 64`, `kj_totaal = 272`, etikettekst met "Koolhydraten 1,0 gram" en "Waarvan suiker 0,2 gram". Dit wordt hieronder na implementatie tegen de daadwerkelijke UI-uitkomst geverifieerd.

### Implementatiebeslissingen

- **Nieuw bestand `src/lib/voedingswaarde.ts`**: pure rekenfunctie `berekenVoedingswaarde()`, zelfde soort losstaande, geen-serverstaat-module als `dichtheid.ts`. Volgt de Excel-volgorde letterlijk: eerst de vier ongeronde kcal-componenten optellen, dan pas `Math.round()` op de som (niet andersom) — precies het punt waar een makkelijke, onopgemerkte fout zou kunnen sluipen.
- **`kj_totaal` gebruikt de afgeronde `kcal_totaal`** (`Math.round(kcal_totaal * 4.25)`), conform de letterlijke formule uit de opdracht ("kj_totaal = kcal_totaal × 4,25"). Voor de gegeven testcase maakt dit toevallig niets uit (64,02 × 4,25 = 272,085, rondt ook af op 272), maar bij andere invoer kan het een eenheid schelen — bewust de opdracht letterlijk gevolgd i.p.v. de nauwkeuriger ongeronde variant.
- **`koolhydraten_totaal` en `restsuiker_per_100ml` zijn geen aparte velden in de collectie** (de opdracht vraagt alleen `kcal_totaal`, `kj_totaal` en `etiket_tekst` als opgeslagen berekende velden) — ze bestaan alleen als tussenstap binnen `berekenVoedingswaarde()` om de etikettekst mee samen te stellen.
- **Etikettekst met komma-decimalen** (bv. "1,0 gram", niet "1.0 gram"): dit is letterlijk kopieerbare tekst voor een echt productetiket, dus Nederlandse decimaalnotatie in plaats van de Engelse punt-notatie die de rest van de opgeslagen numerieke velden gebruikt.
- **Nieuwe collectie `voedingswaarde_berekeningen`**: zelfde AUTH_RULE-niveau en `ingevoerd_door`/`created`/`updated`-conventie als `analyses`/`kelderlog`/`partij_toevoegingen` (zie Blok 2) — geen custom endpoint nodig, gewoon aanmaken via `pb.collection(...)`. Elke berekening is een los, nooit overschreven record (historie), zoals expliciet gevraagd.
- **Voorinvullen vanuit de laatste analyse**: `alcohol_pct` in `analyses` is een volumepercentage, geen g/l — er bestaat geen direct g/l-veld voor alcohol in het bestaande schema. Omgerekend met de standaard wijnbouwkundige dichtheid van ethanol (0,789 g/ml): `alcohol_g_l ≈ alcohol_pct × 7,89`. `restsuiker_g_l` en `zuur_g_l` (uit `totaalzuur_g_l`) hebben al exact de juiste eenheid en worden 1-op-1 overgenomen. Dit is een nieuwe, in de opdracht niet genoemde afleiding — nodig om de "voorinvullen"-belofte waar te maken — en blijft altijd overschrijfbaar vóór het berekenen.

### Bug gevonden tijdens het testen (ontstaan in Blok 2, blootgelegd door Blok 3)

Bij het testen van een nieuwe testpartij bleek de "Verwerking"-sectie (Blok 2) altijd te verschijnen met **"pH 0 · Totaal zuur 0"**, ook voor partijen waarvoor deze velden nooit zijn ingevuld. Oorzaak: PocketBase-nummervelden die nooit expliciet gezet zijn staan op `0`, niet op `null` — de weergavecheck `!= null` beschouwde die `0` dus onterecht als "wél ingevuld". Dit trof niet alleen mijn testpartij, maar in potentie **elke bestaande en toekomstige partij** waarvoor Thomas geen pH/zuur bij aanmaak invult (de normale situatie voor de meeste bestaande partijen, aangemaakt vóór deze velden bestonden). **Fix**: de checks aangepast naar `(waarde ?? 0) > 0` — pH/totaalzuur van exact 0 komt in de praktijk nooit voor bij wijn (`valideerAnalyse` staat elders al een geldig pH-bereik van 2–5 toe), dus "groter dan 0" is hier een betrouwbare "is ingevuld"-check. Geverifieerd: een testpartij zonder deze velden toont nu geen "Verwerking"-sectie meer.

### Live verificatie in de browserpreview (tijdelijk testaccount)

Testpartij aangemaakt, ingevoerd: alcohol 85 g/L, restsuiker 2 g/L, zuur 6 g/L, glycerine 8 g/L (default) → "Bereken" → server-record en UI tonen exact:

```
E 64 Kcal 272 Kj
Voedingswaarden Per 100 ML
Koolhydraten            1,0 gram
Waarvan suiker         0,2 gram
Bevat te verwaarlozen hoeveelheden vet, verzadigd vet, eiwit en zout
```

**Dit komt exact overeen met de handmatige natelling vooraf** (`kcal_totaal = 64`, `kj_totaal = 272`, koolhydraten 1,0 gram, waarvan suiker 0,2 gram) — geen enkele afwijking.

Voorinvullen getest met een analyse (alcohol 13,5 %vol, restsuiker 3 g/L, totaalzuur 5,5 g/L): "Vul in vanuit laatste analyse" zette de velden op alcohol **106,5** g/L (= 13,5 × 7,89, afgerond op 1 decimaal), restsuiker **3**, zuur **5,5** — allemaal correct. "Kopieer"-knop getest (schrijft naar het klembord via `navigator.clipboard`). Testpartij, testanalyse en testberekening achteraf verwijderd.
