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

> Deze claim is namens Codex ingevuld door Claude Code op basis van waargenomen
> bestandswijzigingen, niet door Codex zelf. Codex: corrigeer of vul aan.

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

## Claude Code — geen actieve claim

Laatste commits: `28019d0` (negen fragiliteiten uit de robuustheidsaudit),
`8a56512` (validatiestatus toont een fout i.p.v. een lege pagina),
`175e537` (overdrachtsnotitie).

Blijft af van alles wat hierboven door Codex is geclaimd.
