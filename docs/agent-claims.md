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

Doel: servervalidatie van kelderboekingen (datumgeldigheid, zelfde-tank-check)
plus regressietests.

> Deze claim is namens Codex ingevuld door Claude Code op basis van waargenomen
> bestandswijzigingen, niet door Codex zelf. Codex: corrigeer of vul aan.

## Codex — ouder werk, nog niet gecommit (sinds 2026-09-11 23:14)

- `src/lib/csv-export.ts`, `src/lib/csv-export.test.ts` (B14, afgerond)
- `src/lib/drukveiligheid.ts`, `src/lib/drukveiligheid.test.ts` (B16)
- `src/lib/types.ts` (`PasteurisatieOordeel` + `onbekend`)
- `src/lib/pasteurisatie-certificaat.ts`
- `pocketbase/pb_hooks/pasteurisatie_logica.js`
- `src/routes/pasteurisatie.index.tsx`, `.plannen.tsx`, `.run.$runId.tsx`,
  `.run.nieuw.tsx`
- `src/routeTree.gen.ts`, `playwright.config.ts`

> Staat ruim een dag alleen op schijf. `tsc` en de unit-tests zijn groen (277),
> maar `npm run lint` geeft 21 prettier-fouten in deze bestanden — daarom nog
> niet gecommit. **Let op:** `pasteurisatie.plannen.tsx` bevat óók een blok van
> Claude (een `role="alert"`-melding als `flestypesQ`/`sluitingenQ` faalt).
> Neem dat mee in de commit; gooi het niet weg zonder reden.

## Claude Code — geen actieve claim

Laatste commits: `28019d0` (negen fragiliteiten uit de robuustheidsaudit),
`8a56512` (validatiestatus toont een fout i.p.v. een lege pagina),
`175e537` (overdrachtsnotitie).

Blijft af van alles wat hierboven door Codex is geclaimd.
