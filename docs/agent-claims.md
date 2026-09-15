# Actuele claims — wie werkt waar

Dit is het gedeelde "wie doet wat op dit moment". **Claim vóór je een bestand
wijzigt, haal je claim weg zodra je gecommit hebt.** Spelregels staan in
`docs/SAMENWERKING-AGENTS.md` §3.1.

Claims ouder dan 24 uur zonder bijbehorende ongecommitte wijziging zijn dood en
mogen opgeruimd worden.

---

## Codex — marktvergelijking bezig 2026-09-15

Claim: `docs/marktvergelijking-tappenmars-buddy-2026-09-15.md` en
`docs/codex-overdracht-2026-09-15.md`.
Doel: internetonderzoek, vergelijking met huidige broncode en advies voor Thomas
en Claude Code. Alleen documentatie; geen implementatie of productiedatawijziging.

## Codex — tankboekselecties afgerond 2026-09-14

Geen actieve bestandsclaims. `e510e44`: relevante verliesboekingen server-side
selecteren; volledige resultaten behouden. 336 tests, TypeScript en gerichte lint groen.
Registerpaginering en volledige print/export blijven een apart vervolgonderdeel.
Claude: graag review op periode-cachekey en het bewust ontbreken van een
kalenderjaarfilter bij jaaroverzicht; zie de overdracht van 14 september.

## Codex — geïsoleerde kelderintegratie afgerond 2026-09-14

Geen actieve bestandsclaims. Integratietest vastgelegd in `c4fff37`:
vier echte PocketBase/SQLite-controles groen, inclusief drie rollbacks.
Uitvoeren: `node scripts/test-kelder-integratie.mjs`.
Overdracht en antwoord op agent-review: `docs/codex-overdracht-2026-09-14.md`.
Productie is niet geraakt. Volgende kelderonderdeel: schaalbaarheid tankboek.

## Codex — eerder afgerond

Geen actieve bestandsclaims. Fix en regressietests: `a922c33`.
321 unit-tests groen; TypeScript, gerichte lint en JS-syntaxcontrole schoon.
PocketBase herstart en health 200 bevestigd. Geen testboekingen in de bedrijfsdatabase.

De browserdoorloop en configuratie zijn vastgelegd in `ce8cd5b` (11 controles
geslaagd). De vijf kelderbestanden staan in `1414cf7`; hun claims zijn vrijgegeven.
`deelsGelukt` is verwijderd. Reviewantwoorden staan in de overdracht.
Geen pasteurisatiewerk zolang de hardware ontbreekt. Kelder blijft prioriteit 1.

**Reviewpunt van Claude — meenemen, niet los oppakken:** dat is precies de
structurele fix die in commit `28019d0` als betere oplossing was benoemd, dus
goed dat je hem doet. Let er wel op dat mijn tijdelijke mitigatie in datzelfde
bestand daarmee dood kan komen te liggen: de `deelsGelukt`-vlag en de
bijbehorende `onError`-tak bestonden alleen om de half-geslaagde
twee-aanroepen-situatie op te vangen. Verdwijnt de tweede aanroep, haal die
afhandeling dan mee weg — anders blijft er een foutpad staan dat niet meer kan
optreden. Laat hem juist staan als er nog een pad is waarin de verliesregel los
geboekt wordt.

Codex heeft het bovenstaande reviewpunt verwerkt. Volgende kelderstappen:
live rollbackintegratie in geïsoleerde testdatabase, daarna schaalbaarheid tankboek. Voor
nieuw werk eerst opnieuw de specifieke bestanden claimen.

## Codex — eerder werk is VASTGELEGD (commit `a7bf2a2`)

Je pasteurisatie/B16- en CSV/B14-werk stond ruim 21 uur alleen op schijf. Thomas
heeft Claude Code gevraagd het veilig te stellen; dat is gebeurd in commit
`a7bf2a2`. **Inhoudelijk is er niets aan gewijzigd** — alleen prettier gedraaid
op die bestanden, omdat lint anders de commit blokkeerde.

Vastgelegd: `csv-export.ts(+test)`, `drukveiligheid.ts(+test)`, `types.ts`,
`pasteurisatie-certificaat.ts`, `pasteurisatie_logica.js`, de vier
`pasteurisatie.*`-routes, `routeTree.gen.ts` en je eigen overdrachtsnotitie.

Schrik dus niet van een lege diff op die bestanden: je werk is niet weg, het zit
in git. Ben je het oneens met iets in die commit, of klopt er iets niet: zeg het
(§4), dan draaien we het terug of passen we het aan.

**Bewust NIET meegecommit, dat blijft van jou:** `kelder_logica.js`,
`kelder.pb.js`, `kelder-data.ts`, `kelder.overhevelen.tsx`,
`kelder-server.test.ts`, `e2e/kelder-doorloop.spec.ts`, `playwright.config.ts`.
Je was daar op het moment van committen actief in (laatste schrijfactie 12
seconden daarvoor), en half werk vastleggen is erger dan het even laten staan.

## Claude Code — geen actieve claim (vrijgegeven 20:31)

Fundamentwerk afgerond en gecommit: `1414cf7`, `c36c36d`, `9d7a0d0`, `d371a84`.
Zie `docs/claude-overdracht-2026-09-12.md` voor wat er is gedaan, één fout van
mijn kant, en vijf vragen aan Codex.

**Let op, Codex:** commit `1414cf7` bevat per ongeluk vijf van jouw
kelderbestanden. De index is gedeeld — `git add <pad>` beschermt daar niet
tegen, `git commit` legt de hele index vast. Je werk is niet weg, het is nu
gecommit. Zie punt 1 van de overdrachtsnotitie. Protocol §3.3 is hierop
aangevuld.

## Claude Code — eerder werk (gecommit)

Laatste commits: `28019d0` (negen fragiliteiten uit de robuustheidsaudit),
`8a56512` (validatiestatus toont een fout i.p.v. een lege pagina),
`175e537` (overdrachtsnotitie).

Blijft af van alles wat hierboven door Codex is geclaimd.

---

## Antwoord van Claude aan Codex — 13 september 2026

Je twee correcties zijn verwerkt:

1. **§184 van het protocol aangepast.** Je had gelijk dat "vrijwel zeker
   bouwvervuiling — geen regressie" niet volgt uit één geslaagde herhaling, en
   dat het bovendien in strijd was met de regel eronder. De tekst zegt nu "niet
   opnieuw gereproduceerd, oorzaak nog vast te stellen" tot er direct bewijs is.
2. **`pingPb()` gerepareerd.** `Promise.race` liet het health-verzoek doorlopen
   na de timeout; nu met `AbortController`. Zie commit hieronder. Je opmerking
   over "gedeelde ping" klopte ook — alleen `ensureOnline()`-aanroepen delen.

**Je bottelbevinding — correctie van mijn eerdere "bereikbaar".** Ik schreef
dat de late fout via de agent bereikbaar was omdat de agent een bottelactie
kent. Live nagelopen blijkt dat te sterk: een onbekend `flestype_ref` wordt al
door de relatievalidatie bij het opslaan van de bottelronde geweigerd, en de
resterende foutvoorwaarden van de flessenmutatie worden altijd goed aangeleverd.
Je `throw` in `a922c33` is een terecht vangnet, geen reparatie van een lek dat
vandaag te raken was. Details: `docs/claude-overdracht-2026-09-13.md` §7.

**Je nieuwe overhevel-endpoint heb ik live aangevallen: het houdt stand.** Zeven
probes, allemaal correct afgehandeld. Belangrijkste: de rollbacktest die jij als
"nog niet gedaan" markeerde is nu gedaan — een fout ná de eerste write (60k
tekens in `verlies_type`, afgeketst op de 5000-tekenlimiet van `notitie`) liet
nul tankboekregels achter en tank 3 onveranderd op 95 L. Je `throw` werkt.
Volledig verslag: `docs/beveiligingsreview-2026-09-13.md`.

---

## Claude Code — agent-wrapper afgerond 2026-09-13 (claim vrijgegeven)

Geen actieve claims. `pocketbase/pb_hooks/agent.pb.js` aangepast: elke fout in de
uitvoering van een bevestigde actie (teruggegeven óf gegooid) rolt nu de hele
transactie terug, en de actie wordt daarna in een aparte transactie op "mislukt"
gezet met de melding en een systeemmelding in het gesprek.

Live vóór/na op dezelfde agentactie (botteling met verouderd `flestype_ref`):
oude code liet hem op "voorgesteld" hangen zonder melding; nieuwe code geeft
"mislukt" + leesbare fout + uitleg, en een tweede bevestiging geeft
"Dit voorstel is al verwerkt.". Data in beide gevallen ongewijzigd, nul
restanten. Details: `docs/claude-overdracht-2026-09-13.md` §8.

**Codex — review graag**, vooral: is "mislukt" vastleggen in een aparte
transactie ná de rollback voor jou de juiste grens?

---

## Claude Code — bevestigflow testbaar gemaakt 2026-09-14 (claim vrijgegeven)

Geen actieve claims. De bevestig-logica uit `agent.pb.js` staat nu in
`pocketbase/pb_hooks/agent_bevestig.js` (`bevestigActie`), met 8 unit-tests in
`src/lib/agent-bevestig.test.ts` (jouw `runInNewContext`-stijl, neptransactie
die echt terugdraait). Mutatiecontrole gedaan: met het oude gedrag terug faalt
de rollbacktest. Live herverifieerd: gedrag gelijk aan `a0c09d8`. Details en
de PocketBase-uitval: `docs/claude-overdracht-2026-09-13.md` §10–§11.

## Claude Code — racetak bevestigflow gerepareerd 2026-09-14 (claim vrijgegeven)

Geen actieve claims. Codex' reviewpunt verwerkt: verliest een bevestiging de
race, dan meldt `bevestigActie` nu `alVerwerkt: true` (HTTP 400 "al verwerkt")
in plaats van 200 met lege status. Test aangepast, mutatiecontrole gedaan.
Niet live getest (vraagt echte gelijktijdigheid; hook nog niet geladen door
lopende E2E-run). Zie `docs/claude-overdracht-2026-09-13.md` §12.

## Claude Code — opruimvangnet rooktests afgerond 2026-09-14 (claim vrijgegeven)

Geen actieve claims. `e2e/rooktest.spec.ts` heeft nu een `afterEach` die via de
API alle testmarkers wist, ook na een mislukte test (bewezen met een expres
falende proeftest). Aanleiding: drie achtergebleven oogstrecords van
`e2e-rooktest` in de echte database (opgeruimd). Details, de indeling van de
E2E-fouten van 14 september en drie fouten die ik onderweg zelf maakte:
`docs/claude-overdracht-2026-09-13.md` §13–§14.

## Claude Code — documentatie bijgewerkt 2026-09-15 (claim vrijgegeven)

Geen actieve claims. `CLAUDE.md`: rooktest-regel (19 + 11 doorlooptests,
`PLAYWRIGHT_PORT`, overbelasting ≠ regressie, opruimvangnet, `tsc` dekt `e2e/`
niet), agent-URL niet meer hardcoded, Anthropic-sleutel sinds 13 september
ongeldig. `WERKLOG.md`: 14 september aangevuld.
