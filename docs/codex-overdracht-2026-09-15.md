# Codex-overdracht — 15 september 2026

## Internetonderzoek vergelijkbare bedrijfsapps

Thomas vroeg vergelijkbare apps online te onderzoeken, onze sterke punten/gaten te bepalen en dit met Claude Code te delen. Resultaat: `docs/marktvergelijking-tappenmars-buddy-2026-09-15.md`.

Vergeleken: InnoVint, vintrace, Process2Wine, eVineyard, Odoo, Commerce7, Tecnosoft TS Manager/SPD en Ellab ValSuite. Primaire webbronnen staan bij de vergelijking. Geen proefaccounts, offertes of aanschaf; geen claim van onafhankelijk bewezen productkwaliteit.

**Belangrijkste richting:** bestaande keldertaken en registraties verbinden tot één invoer per handeling. Daarna inkoop, materiaalplanning, kostprijs en mengen/splitsen. Pasteurisatie blijft wachten op hardware. Geen tweede takenmodel, boekhouding of sensorveiligheid naast bestaande bronnen bouwen.

## Review gevraagd

- `src/lib/accijns.ts:43,84,131–132` berekent bedragen uit verkoop/eigen gebruik. De pagina roept dit aan op `src/routes/kelder.accijns.tsx:148`. Bottelen schrijft al `accijnsplichtig_volume_l` en `accijns_categorie` in `pocketbase/pb_hooks/kelder_logica.js:363–364`. Dit sluit nog niet aan op de in ARCHITECTURE §9 genoteerde bedrijfsafspraak over botteling. **Zekerheid: rechtstreeks uit huidige code vastgesteld; geen live belastingberekening of vergunningcontrole uitgevoerd.** Controleer met Thomas de grondslag vóór inhoudelijke wijziging.
- Meng/splits-, inkoop-, complete kostprijs- en terugroepwerkstromen niet aangetroffen. Bestaande losse bouwstenen expliciet genoemd, inclusief taken, Vandaag-widget, leveranciersvelden en traceerbaarheidsexport. Graag tegenspraak met broncode als iets recent al gebouwd is.

## Wijzigingen en verificatie

Alleen dit document, het onderzoeksrapport en de eigen claim. Wordt met expliciete paden gecommit; de commit is terug te vinden met `git log -- docs/marktvergelijking-tappenmars-buddy-2026-09-15.md`.

Internetbronnen gelezen en gerichte broncode-inspectie uitgevoerd. Geen applicatietests opnieuw gedraaid: geen applicatiecode gewijzigd. Geen productiedata, hooks, auth, serverconfiguratie of pasteurisatievalidatie veranderd. De bestaande verwijdering van `.claude/settings.local.json` is niet van Codex en blijft ongemoeid.

Volgende stap: Claude controleert de bevindingen en stelt één kleine kelderwerkstroom voor. Het rapport is een advies, geen nieuwe brede implementatieopdracht. Een bestand in deze map betekent niet dat Claude het al gelezen heeft.
