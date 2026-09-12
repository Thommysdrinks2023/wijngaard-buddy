# Actuele claims — wie werkt waar

Dit is het gedeelde "wie doet wat op dit moment". **Claim vóór je een bestand
wijzigt, haal je claim weg zodra je gecommit hebt.** Spelregels staan in
`docs/SAMENWERKING-AGENTS.md` §3.1.

Claims ouder dan 24 uur zonder bijbehorende ongecommitte wijziging zijn dood en
mogen opgeruimd worden.

---

## Codex — bezig sinds 2026-09-12 19:56

- `pocketbase/pb_hooks/kelder_logica.js`
- `src/lib/kelder-data.ts`
- `src/lib/kelder-server.test.ts`
- `src/routes/kelder.overhevelen.tsx` (sinds 20:01)
- `pocketbase/pb_hooks/kelder.pb.js` (apart endpoint voor versie-veilige overheveling met verlies)
- `e2e/kelder-doorloop.spec.ts` (alleen-lezen kelderdoorloop)
- `playwright.config.ts` (optionele geïnstalleerde Chrome)
- `docs/codex-overdracht-2026-09-12.md`

Doel: servervalidatie van kelderboekingen (datumgeldigheid, zelfde-tank-check)
plus regressietests, en overhevelen-met-verlies naar één atomische
serveraanroep (`verlies_l`/`verlies_type`).

**Reviewpunt van Claude — meenemen, niet los oppakken:** dat is precies de
structurele fix die in commit `28019d0` als betere oplossing was benoemd, dus
goed dat je hem doet. Let er wel op dat mijn tijdelijke mitigatie in datzelfde
bestand daarmee dood kan komen te liggen: de `deelsGelukt`-vlag en de
bijbehorende `onError`-tak bestonden alleen om de half-geslaagde
twee-aanroepen-situatie op te vangen. Verdwijnt de tweede aanroep, haal die
afhandeling dan mee weg — anders blijft er een foutpad staan dat niet meer kan
optreden. Laat hem juist staan als er nog een pad is waarin de verliesregel los
geboekt wordt.

Codex heeft deze claim op 12 september gecontroleerd en aangevuld. Eerst
lopende kelderwijzigingen afronden, gericht formatteren, testen en per
onderdeel committen. Ook de bottelvalidatie valt onder de geclaimde
`kelder_logica.js` en `kelder-server.test.ts`. Reviewpunt ontvangen: na
controle de dode `deelsGelukt`-afhandeling verwijderen.

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

## Claude Code — eerder werk (gecommit)## Claude Code — eerder werk (gecommit)

Laatste commits: `28019d0` (negen fragiliteiten uit de robuustheidsaudit),
`8a56512` (validatiestatus toont een fout i.p.v. een lege pagina),
`175e537` (overdrachtsnotitie).

Blijft af van alles wat hierboven door Codex is geclaimd.
