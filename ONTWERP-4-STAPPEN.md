# Fase 10 — Proactieve assistent: Fase 4, Implementatieplan

> **Correctie (Fase 16, 28 augustus 2026):** waar dit document "producent"
> schrijft, heet dat vanaf Fase 16 **eigenaar** (collectie `eigenaars`, veld
> `eigenaar`). De term is gewijzigd omdat De Tappenmars ook voor andere
> wijngaarden en fruittelers verwerkt en bottelt; die klanten zijn geen
> producent maar eigenaar van hun eigen product. De tekst hieronder blijft
> staan zoals hij destijds is geschreven.

**Status: BESLOTEN door Thomas (24 juli 2026) — Fase 5 (bouwen) is gestart, stap 1 t/m 5.**

---

## Volgorde-eis, herbevestigd

Elke stap hieronder is **zelfstandig werkend en testbaar**. Stap 1 alleen al levert Thomas een betere Vandaag-widget dan `meldingen.tsx` nu heeft — zonder dat er ooit een AI-aanroep bijkomt. De AI-correlatietool (stap 6) is een losse, optionele laag aan het eind die nooit gebouwd hoeft te worden zonder dat de rest waarde verliest. Dit is geen slogan maar een concrete verificatie: na elke stap kan de app gecommit, getest en dagelijks gebruikt worden.

---

## Stap 1 — Signaal-contract + twee bestaande signalen verhuizen

**Wat wordt gebouwd**: `src/lib/signalen.ts` met het `Signaal`/`SignaalProducent`-contract (Fase 3 §1) en de verzamelfunctie `verzamelSignalen()`. Twee bestaande, al werkende detecties verhuizen hier eerst naartoe, ongewijzigd in gedrag: het onderhoud-binnen-30-dagen-signaal en het backup-ouder-dan-2-dagen-signaal (nu dubbel geïmplementeerd — dit is de eerste de-duplicatie).

**Bestanden**:

- Nieuw: `src/lib/signalen.ts`
- Gewijzigd: `src/components/meldingen.tsx` (onderhoud- en backup-detectie eruit, roept straks `verzamelSignalen()` aan voor die twee) — **maar `meldingen.tsx` blijft in stap 1 nog gewoon bestaan en werken**, dit is een interne verhuizing, geen zichtbare wijziging voor Thomas.

**Definition of Done**: `npm test` dekt `signalen.ts` met minstens: leeg bij geen problemen, één onderhoudssignaal bij een record binnen 30 dagen, één backupsignaal bij een verouderde `laatste_backup`, en dat een falende producent de andere niet blokkeert (de `try/catch`-garantie uit Fase 3 expliciet getest met een producent die gooit).

**Hoe te testen**: `npm test` groen. Browser: de hub toont exact dezelfde twee meldingen als vóór de wijziging (géén zichtbaar verschil — puur interne opschoning).

**Hergebruikt/vervangt/vult aan**: vervangt de twee losse implementaties in `meldingen.tsx` en `index.tsx` (`BackupWidget`) door één bron — lost de in Fase 1 benoemde bug op (dubbele, uit de pas lopende checks).

**Regressierisico**: laag. Puur een interne verhuizing van bestaande, geteste logica; geen nieuwe UI, geen schema-wijziging. Risico zit in het per ongeluk veranderen van de drempel-waarden tijdens het overtypen — mitigatie: exact dezelfde constanten hergebruiken, niet herschrijven.

---

## Stap 2 — AGP-signaal en kelderlog-taaksignaal verhuizen

**Wat wordt gebouwd**: de resterende twee signalen uit `meldingen.tsx` (AGP-drempel, `"TAAK:"`-kelderlogregels) migreren naar `signalen.ts` als producenten. Na deze stap is `meldingen.tsx` een dunne wrapper die alleen nog `verzamelSignalen()` aanroept en rendert — nog steeds geen zichtbare wijziging.

**Bestanden**: `src/lib/signalen.ts` (2 nieuwe producenten), `src/components/meldingen.tsx` (verder uitgekleed).

**Definition of Done**: tests voor de twee nieuwe producenten (AGP boven/onder 80%-drempel, taak binnen/buiten 7 dagen — beide grensgevallen expliciet, consistent met de bestaande test-conventie in dit project).

**Hoe te testen**: `npm test` groen. Browser: hub toont nog steeds identieke meldingen als voorheen, nu volledig via de nieuwe laag.

**Hergebruikt/vervangt/vult aan**: voltooit de verhuizing die stap 1 begon.

**Regressierisico**: laag, zelfde aard als stap 1. Iets hoger omdat de AGP-berekening een berekening over `partijen`-records doet (niet alleen een simpele datumvergelijking) — extra aandacht bij het overzetten van de `filter`/`reduce`-logica.

---

## Stap 3 — Vandaag-widget (nieuwe UI, vervangt `meldingen.tsx` zichtbaar)

**Wat wordt gebouwd**: `src/components/vandaag-widget.tsx`, de eerste **zichtbaar nieuwe** component. Toont `verzamelSignalen()`-resultaat gesorteerd op ernst→datum, met het plafond (instelbaar via `signaal_max_zichtbaar`, default 6, Fase 2 §3) en een "en nog N meer"-regel bij overschrijding. Elk signaal toont zijn `waarom`-tekst uitklapbaar (geen aparte call — staat al in het object, Fase 3 §3). Snooze/dismiss via localStorage (`wg.signalen.staat.v2`), inclusief de eenmalige migratie van de oude `wg.meldingen.afgevinkt.v1`-sleutel (Fase 2 §6).

**Bestanden**:

- Nieuw: `src/components/vandaag-widget.tsx`
- Gewijzigd: `src/routes/index.tsx` (`Meldingen`-component vervangen door `VandaagWidget`)
- Verwijderd: `src/components/meldingen.tsx` (na deze stap overbodig — pas verwijderen als de widget in productie draait, niet eerder)

**Definition of Done**: alle signalen uit stap 1+2 verschijnen ongewijzigd; snooze/dismiss migreert bestaande weggeklikte items zonder dat ze terugkomen; het plafond werkt aantoonbaar (test met >6 nep-signalen); de "waarom"-uitklap toont tekst zonder netwerkverkeer (te verifiëren via `read_network_requests` in de browser — nul nieuwe requests bij het uitklappen).

**Hoe te testen**: browser-verificatie op de hub (publiek, geen login nodig): bestaande afgevinkte meldingen blijven weg; een nieuw signaal (bv. tijdelijk een `laatste_backup` >2 dagen terugzetten) verschijnt; snoozen en de pagina verversen laat het gesnoozede item weg tot de snooze-datum; `npx tsc`/`eslint`/`vitest` schoon.

**Hergebruikt/vervangt/vult aan**: vervangt `meldingen.tsx` zichtbaar. Dit is het moment waarop Thomas voor het eerst een merkbaar andere hub ziet.

**Regressierisico**: middel. Dit is de eerste stap die de hub-pagina daadwerkelijk visueel wijzigt. Mitigatie: de migratie van de afvink-state is expliciet getest vóórdat `meldingen.tsx` verwijderd wordt (niet gelijktijdig — eerst de widget ernaast draaien, browser-geverifieerd, dan pas de oude component weghalen, zoals hierboven aangegeven bij "Verwijderd").

---

## Stap 4 — Voorraad-bijna-op-signaal (het enige echt nieuwe regel-signaal)

**Wat wordt gebouwd**: het `drempel_aantal`-veld op `voorraad_flessen` (schema-migratie via `ensureVelden`, idempotent), een invoerveld op de bestaande voorraad-bewerkpagina, en de nieuwe signaalproducent `voorraadBijnaOpSignalen()` (client-side filter, Fase 2 §9).

**Bestanden**: `scripts/setup-pocketbase.mjs` (nieuw veld), `src/lib/types.ts` (`VoorraadFles`-interface), `src/routes/voorraad.$voorraadId.tsx` of het bewerkformulier (nieuw invoerveld), `src/lib/signalen.ts` (nieuwe producent), + de drie instellingssleutels in `regelgeving_instellingen` geseed met defaults (Fase 2 §3).

**Definition of Done**: `node scripts/setup-pocketbase.mjs` 2× gedraaid, curl-geverifieerd dat het veld en de instellingen bestaan; een voorraadrecord onder de drempel produceert het signaal, erboven niet; een record zonder eigen drempel valt terug op de globale standaard (test voor beide paden).

**Hoe te testen**: curl-verificatie van het schema vóór de frontend (harde regel), daarna browser: voorraad tijdelijk onder de ingestelde drempel zetten → signaal verschijnt op de hub met correcte "waarom"-tekst (bv. "18 flessen, drempel 24").

**Hergebruikt/vervangt/vult aan**: volledig nieuw regel-signaal, geen bestaande functionaliteit geraakt behalve het voorraad-schema (additief, `ensureVelden`, niet-destructief).

**Regressierisico**: laag. Schema-toevoeging is additief en idempotent; het enige echte risico is de client-side filterlogica (drempel-fallback) die per ongeluk een wijn zonder ingevulde drempel als "altijd op orde" of "altijd in de rode zone" behandelt — dekken met expliciete randgeval-tests (`drempel_aantal: null`, `aantal_huidig: 0`).

---

## Stap 5 — Signaal→taak-promotie (hergebruikt bestaande infrastructuur)

**Wat wordt gebouwd**: een "Maak hiervan een taak"-knop op signalen die een `taakVoorstel` hebben (Fase 3 §1). De knop roept de **al bestaande** `agent_acties`-bevestigingsflow aan met `actie_type: "kelderlog"` — geen nieuwe backend-logica, alleen een nieuwe aanroeper van bestaande code.

**Bestanden**: `src/components/vandaag-widget.tsx` (knop + call naar de bestaande `agent_acties`-creatiefunctie, zonder tussenkomst van de AI-agent zelf — dit is een direct voorstel, geen Claude-aanroep), `src/lib/signalen.ts` (welke producenten een `taakVoorstel` meeleveren, te beginnen met het onderhoud-signaal: "Plan onderhoud in").

**Definition of Done**: klikken op de knop maakt een `agent_acties`-record met status `voorgesteld` aan (curl/browser-verificatie), dat vervolgens door de **bestaande** bevestigingskaart op `/assistent` getoond en afgehandeld kan worden. Geen nieuwe status, geen nieuw veld.

**Hoe te testen**: browser, ingelogd: knop klikken → naar `/assistent` navigeren → de nieuwe actie staat in de lijst met status "voorgesteld" → bevestigen voert 'm uit via het bestaande pad.

**Hergebruikt/vervangt/vult aan**: hergebruikt 100% van de bestaande `agent_acties`-flow. Dit is de concrete uitwerking van Fase 1's antwoord op "signaal versus taak."

**Regressierisico**: laag-middel. Het enige risico is dat een handmatig aangemaakte `agent_acties`-record een velden-vorm mist die de bestaande flow verwacht (bv. `bericht_id` dat normaliter uit een AI-beurt komt) — vereist een korte check van hoe `agent_acties` momenteel zonder AI-beurt aangemaakt zou kunnen worden; mogelijk moet `bericht_id` optioneel gemaakt worden voor dit pad. **Dit is het punt in het plan waar het meest onderzoek nodig is vóór de bouw** — vlaggen als aandachtspunt bij de start van deze stap, niet nu al oplossen zonder de code erbij te hebben.

---

## Stap 6 — AI-correlatietool — **optioneel, alleen na Fase 1-akkoord én na een echt seizoen**

**Wat wordt gebouwd** (indien en wanneer): `pocketbase/pb_hooks/signalen.pb.js` met `POST /api/signalen/correlatie` (Fase 3 §4a), de `signaal_analyses`-collectie (Fase 2 §5), en een knop in de Vandaag-widget die verschijnt zodra er ≥2 gelijktijdige signalen zijn.

**Bestanden**: nieuw hook-bestand, nieuwe collectie via `setup-pocketbase.mjs`, `src/lib/signalen-data.ts` (client-aanroep), knop + weergave in `vandaag-widget.tsx`.

**Definition of Done**: curl-test van het endpoint (rate-limit-gedrag, budget-plafond-gedrag, foutmeldingen — alle vier de foutgevallen uit Fase 3 §4a expliciet getest, zelfde patroon als de Fase 9-rate-limit-test met een tijdelijk verlaagde limiet); een opgeslagen `signaal_analyse` is achteraf leesbaar zonder nieuwe AI-aanroep.

**Hoe te testen**: eerst curl (server-side, geen kosten nodig voor de foutpaden — zelfde truc als Fase 9 Blok E: rate-limit en validatiefouten triggeren vóór de echte Anthropic-call), dan één bewuste, betaalde live-aanroep met echte signalen om de daadwerkelijke output te beoordelen.

**Hergebruikt/vervangt/vult aan**: volledig nieuw, additief. Geen bestaand endpoint gewijzigd.

**Regressierisico**: geen op bestaande functionaliteit (nieuw endpoint, nieuwe collectie). Het risico zit in de scope-discipline: dit is precies het onderdeel waarvan Fase 1 zegt dat het te vroeg is zonder echte piekdag-data. **Aanbeveling: deze stap niet inplannen vóór het najaar van 2026, en pas na een expliciet, apart akkoord van Thomas — niet automatisch meenemen als "stap 6 van het plan" zodra stap 1-5 af zijn.**

---

## Samenvattend stappenoverzicht

| Stap                                       | Levert op zichzelf waarde?       | AI-aanroep?                      | Regressierisico                           |
| ------------------------------------------ | -------------------------------- | -------------------------------- | ----------------------------------------- |
| 1. Signaal-contract + 2 signalen verhuizen | Ja (interne opschoning, bug-fix) | Nee                              | Laag                                      |
| 2. Resterende 2 signalen verhuizen         | Ja (voltooit opschoning)         | Nee                              | Laag                                      |
| 3. Vandaag-widget                          | Ja (zichtbaar betere hub)        | Nee                              | Middel                                    |
| 4. Voorraad-bijna-op-signaal               | Ja (nieuw, nuttig signaal)       | Nee                              | Laag                                      |
| 5. Signaal→taak-promotie                   | Ja (sneller taken aanmaken)      | Nee (hergebruikt bestaande flow) | Laag-middel                               |
| 6. AI-correlatietool                       | Optioneel, apart te beoordelen   | Ja                               | Geen (nieuw, additief) — wel scope-risico |

**Bevestiging van de volgorde-eis**: stappen 1 t/m 5 bevatten **geen enkele** AI-aanroep. Als stap 6 nooit gebouwd wordt, is alles wat er dan staat — een opgeschoonde, uitgebreide, ontdubbelde signaallaag met taak-promotie — op zichzelf een duidelijke verbetering, geen half werk.

---

## Besluiten van Thomas (24 juli 2026)

1. **Stap 3, twee-fasen-aanpak**: akkoord — widget eerst naast `meldingen.tsx`, browser-verifiëren, dan pas de oude component verwijderen.
2. **Stap 5's velden-onderzoek, vooraf uitgevoerd** (niet doorgeschoven, op uitdrukkelijk verzoek van Thomas: "een bekend risico hoort niet halverwege de bouw ontdekt te worden"): curl-verificatie op de live database (24 juli 2026) bevestigt dat `agent_acties.bericht_id` al `required: false` is. **Geen schemawijziging nodig** — bouwstap 5 kan zonder vooronderzoek beginnen.
3. **Stap 6 losgekoppeld**: akkoord, bevestigd. Stap 1-5 is het volledige, af te bouwen resultaat van dit plan; stap 6 blijft een apart besluit na het seizoen.

**Overige besluiten die dit stappenplan raken** (details in `ONTWERP-2-DATAMODEL.md`/`ONTWERP-3-API.md`):

- Snooze/dismiss wordt server-side (`signaal_status`-collectie), niet localStorage — stap 3 bouwt deze collectie mee, geen voorwaardelijk onderdeel meer.
- `inzichten` krijgt geen opschoning — stap 2 (dat de kritieke-inzichten-signaalproducent verhuist) moet een expliciete `sort`/`limit` gebruiken in plaats van de hele tabel op te halen (zie Fase 2 §9 — nieuw aandachtspunt, was niet relevant toen de 12-snapshot-limiet nog gold).
- De twee bestaande hardcoded drempels (backup 2 dagen, AGP-waarschuwing 80%) verhuizen mee naar de nieuwe `app_instellingen`-collectie in stap 1/2, niet naar `regelgeving_instellingen`.
- Voorraaddrempel-veld (`drempel_aantal`) wordt nu al toegevoegd in stap 4, ook al gebruikt Thomas voorlopig alleen de globale standaard.
- Geen budgetplafond-endpoint (stap 6 sowieso uitgesteld, en zelfs dan niet nodig — prepaid credits + bestaande rate-limit volstaan).
