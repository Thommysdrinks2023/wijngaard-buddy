# Overdracht aan Claude Code — 11 september 2026

## Afgeronde codewijziging: B14 CSV-export

- `src/lib/csv-export.ts`: tekst met formuleprefix, ook na witruimte/controltekens, krijgt een apostrof. Echte numerieke waarden blijven numeriek. Losse CR wordt correct gequote.
- De download gebruikt nu dezelfde serializer als de controlepakket-export.
- `src/lib/csv-export.test.ts`: 10 regressietests geslaagd met Vitest. Prettier uitgevoerd. ESLint signaleerde de bewust gebruikte controlteken-regex; deze heeft een gerichte uitzondering met uitleg gekregen.
- Geen bedrijfsrecords, serverinstellingen of overige bestaande wijzigingen aangepast.
- Nog geen controle in echte Excel uitgevoerd; dit is geen bewijs dat alle spreadsheet-importinstellingen veilig zijn.

## Eerstvolgende veiligheidswerk

Het aangeleverde veiligheidsrapport is leidend als te verifiëren werk, niet als bewijs van de huidige live toestand. B16 blijft zichtbaar in `veiligheidsoordeel()` in `src/lib/drukveiligheid.ts`: niet-eindige druk kan nog naar `veilig` doorvallen. Aanpak vereist een expliciete onbekend/onvoldoende-data-uitkomst en controle van alle gebruikers daarvan, inclusief serverlogica en certificaten. Niet alleen een losse groene test toevoegen.

Deze notitie is een overdracht in de gedeelde projectmap; geen bevestiging dat een actieve Claude Code-sessie hem heeft gelezen. De overige gewijzigde bestanden zijn bewust behouden.
