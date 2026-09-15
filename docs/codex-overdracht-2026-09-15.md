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

## Vervolg na opdracht Thomas — overhevelen met automatisch werklog

Thomas heeft daarna expliciet uitvoering goedgekeurd in deze volgorde:
kelderwerkstromen, inkoop/bottelvoorbereiding, kostprijs, mengen/splitsen,
kwaliteit/terugroepen, daarna koppelingen. De eerdere beperking tot onderzoek
geldt dus niet meer voor dit vervolg; veiligheids-/deploybesluiten blijven apart.

Commit `5c4c343`: `voerBoekingUit` schrijft bij overhevelen één kelderlogregel
binnen dezelfde transactie als tankboek, tankcaches en eventueel verlies.
De interne verliesrecursie schrijft geen extra werklog. Het log vermeldt bron,
doel, aangekomen liters, eventueel verlies, notitie en tankboek-id(s).
Geldt ook voor andere aanroepers van dezelfde helper, waaronder de agent.
De overhevelpagina ververst de kelderlog-query en legt de automatische registratie uit.

Bewust een werklog, geen tweede wettelijk register: tankboek blijft leidend.
De logregel hangt aan de doeltank; bron staat in tekst. Een relationele
terugkoppeling naar beide tanks en oude historische boekingen zijn niet toegevoegd.

Verificatie: 340 unit-tests groen (24 bestanden), TypeScript en gerichte ESLint
groen, JS-syntax en diff-check schoon. Zes geïsoleerde PocketBase/SQLite-tests
groen, inclusief één overheveling met verlies/werklog en rollback bij een te
lange werklognotitie. Die test controleert binnen de transactie dat beide
tankboekregels al bestaan vóór de late fout en dat na rollback alle aantallen
en beide tankvolumes weer gelijk zijn aan vóór de operatie.

Lokale PocketBase-taak kort herstart na commit; health 200 bevestigd. Geen
testboekingen in bedrijfsdata, geen schemawijziging. Geen nieuwe browserdoorloop
of live succesvolle productieboeking gedaan. Aanwezige verwijdering van
`.claude/settings.local.json` niet meegenomen.

**Nog niet klaar:** volledige stap 1 omvat meer dan deze registratieverbinding.
Optionele vervolgtaken, idempotentie bij opnieuw verzenden na een verloren
antwoord, en de overige dubbele-invoerketens blijven open. Geen taak verzonnen
die Thomas na elke overheveling verplicht moet uitvoeren. Niet doorgaan naar
inkoop alsof alle kelderwerkstromen hiermee afgerond zijn.

**Claude — review gevraagd:** controleer één werklog bij verliesrecursie,
rollbackgrens en log-zichtbaarheid op partij/tank. Onderzoek parallel welke
volgende handeling dubbele invoer vraagt, en werk een voorstel uit voor
vervolgtaken met het bestaande takenmodel en idempotentie. Claim bestanden
vóór aanpassen. Dit verzoek staat ook in agent-claims; ontvangst niet bevestigd.
