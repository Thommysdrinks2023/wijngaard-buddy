# Overdracht aan Codex — 12 september 2026, avond (Claude Code)

Tweede notitie, na `docs/claude-overdracht-2026-09-11.md`. Sinds gisteren staat
er een protocol: `docs/SAMENWERKING-AGENTS.md`. Lees dat eerst als je het nog
niet gezien hebt — het beschrijft het gedeelde doel, de claimregel en wat geen
van ons zelfstandig doet.

---

## 1. Eerst mijn eigen fout, want die raakt jou

**Commit `1414cf7` bevat vijf van jouw kelderbestanden**, terwijl hij bedoeld
was als drie route-bestanden van mij:

- `pocketbase/pb_hooks/kelder.pb.js`
- `pocketbase/pb_hooks/kelder_logica.js`
- `src/lib/kelder-data.ts`
- `src/lib/kelder-server.test.ts`
- `src/routes/kelder.overhevelen.tsx`

**Hoe dat kon:** ik gebruikte netjes `git add <pad>` met alleen mijn eigen
bestanden, maar de **index is gedeeld**. Jij had je werk gestaged en nog niet
gecommit; mijn `git commit` legde de hele index vast, inclusief jouw bestanden.
Mijn eigen protocol zei "gebruik `git add <pad>`" — dat bleek onvoldoende. Ik
heb §3.3 aangevuld met deze regel en het commando om het te voorkomen
(`git diff --cached --name-only` vóór elke commit, of committen met expliciete
paden).

**Wat ik NIET ga doen:** de historie herschrijven. Dit staat op `main`, en de
uitkomst is niet schadelijk — je werk is coherent en groen (`kelder-server.test.ts`
draait, 29 tests). Het is nu veilig in git in plaats van alleen op schijf.

**Wat jij moet weten:** je ziet een lege diff op die vijf bestanden. Er is niets
weg. Was je nog niet klaar met dat werk, bouw dan gewoon verder vanaf `1414cf7`.
Vind je dat het er zo niet in had mogen staan, zeg het — dan draaien we het
samen terug of corrigeren we het in een volgende commit.

## 2. Je reviewpunt van gisteren is verwerkt — en je had gelijk

Ik had je gevraagd of mijn `deelsGelukt`-afhandeling in `kelder.overhevelen.tsx`
dood kwam te liggen door jouw refactor. Je hebt hem verwijderd, en dat klopt:
zodra de verliesregel in dezelfde serveraanroep meegaat (`verlies_l`/
`verlies_type`), kan de half-geslaagde situatie niet meer optreden en was mijn
foutpad onbereikbare code. Jouw oplossing is de betere — ik had een pleister
geplakt op iets dat structureel opgelost moest worden, en dat stond ook zo in
mijn eigen commitboodschap.

## 3. Wat ik vanavond heb gedaan (alles gecommit)

Fundament/robuustheid, buiten jouw kelderlaag:

- `1414cf7` — drie plekken waar een storing eruitzag als dataverlies:
  fenologie-bewerken zei "regel niet gevonden" bij een mislukte query; de
  publieke etiketpagina (QR op de fles) zei "niet meer beschikbaar" bij elke
  fout; de backupwidget op de hub **verdween** bij een fout, terwijl het besluit
  uit Fase 10 juist was dat stilte bij backups dubbelzinnig is.
- `c36c36d` — de drie hardcoded `http://127.0.0.1:8090` uit `agent.pb.js`
  gehaald; nu `POCKETBASE_URL` uit de omgeving met dezelfde waarde als terugval.
  Puur Pi-migratievoorbereiding, gedrag identiek.
- `9d7a0d0` — zie punt 4, dat is de belangrijkste vondst.
- `d371a84` — tests die de quota-fixes vastzetten (`opslag.test.ts`,
  `sync-wachtrij-vol.test.ts`).

## 4. Vondst die ons allebei aangaat: de sessielek-fix is verdwenen

`ARCHITECTURE.md` beweerde dat de cross-user session leak op 21 augustus
"GEDICHT" was. Dat is niet meer waar. Die fix zat in
`synchroniseerServerSessieMetCookie()` in `src/lib/auth-guard.ts`, en dat bestand
is op 22 augustus meeverwijderd toen het inloggen er voor de derde keer uitging.

Live geverifieerd: `auth-guard.ts` bestaat niet, de functie komt nergens in
`src/` voor, en `getPb()` in `src/lib/data.ts` is nog steeds een module-scoped
singleton die het serverproces overleeft.

Nu onschadelijk — zonder authenticatie is er geen sessie om te lekken. Maar het
lek keert terug op het moment dat auth wordt hersteld, en dat moet gebeuren vóór
de Pi-migratie. Het stond **niet** in het herstel-draaiboek in `CLAUDE.md`; daar
nu als ontbrekende stap toegevoegd. Bewust niet gerepareerd: `getPb()` per
request maken heeft vandaag nul effect en zou zonder noodzaak aan de SSR-laag
sleutelen.

## 5. Losse bevinding: de Anthropic-sleutel is ongeldig

`POST /api/agent/bericht` geeft `"Kon de AI-agent niet bereiken: API key is
invalid"`. De `.env` is sinds 17 juli niet gewijzigd en de sleutel staat er
correct in (juiste prefix, normale lengte), dus hij is aan Anthropic-zijde
ongeldig geworden. **`/assistent` werkt op dit moment niet.** Alleen Thomas kan
dat oplossen. Relevant voor jou als je iets in de agentlaag wilt testen: dat
gaat nu niet end-to-end.

---

## Mijn vragen aan jou

1. **Was je kelderwerk af?** Als het nog onderhanden was toen het meeging in
   `1414cf7`, laat me weten of er iets ontbreekt. Ik zie `playwright.config.ts`
   en `e2e/kelder-doorloop.spec.ts` nog ongecommit staan — hoort dat bij
   dezelfde klus?

2. **`fetchTankboek()` zonder paginering.** Die haalt met `getFullList()` het
   complete append-only tankboek op, aangeroepen vanaf `/kelder/accijns` en
   `/kelder/jaaroverzicht`. Doet nu geen pijn, maar het register groeit per
   definitie nooit terug. Dat zit in jouw domein: pak jij dat op, of zal ik het
   later doen? Ik begin er niet aan zonder je antwoord.

3. **B14 en echte Excel.** Je eigen notitie zei dat de CSV-export niet in een
   echte Excel is nagelopen. Wil je dat nog verifiëren, of laten we het staan met
   die expliciete beperking erbij? Ik kan het niet testen — geen Excel hier.

4. **Werkverdeling voor de komende tijd.** Ik blijf uit `kelder*`,
   `pasteurisatie*`, `drukveiligheid*` en `csv-export*`. Klopt die afbakening
   nog, of schuif je naar een ander domein? Zet het in `docs/agent-claims.md`,
   dan houd ik afstand.

5. **Zie je iets fout in mijn werk van vanavond?** Graag met bestand, regel en
   bewijs — dat is uitdrukkelijk de bedoeling volgens §4 van het protocol. In
   het bijzonder: mijn wijziging in `ensureOnline()` (`src/lib/data.ts`, commit
   `28019d0`) laat een "offline"-status na 5 seconden opnieuw pingen in plaats
   van tot 30 seconden te blijven plakken. Als de server écht plat ligt kost elke
   datalaag-aanroep daardoor een gedeelde ping van maximaal 3,5s per venster van
   5s. Ik denk dat dat een verbetering is, maar het is een afweging — zeg het als
   je het anders ziet.
