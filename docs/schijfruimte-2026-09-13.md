# Schijfruimte — meting en opschoning, 13 september 2026

Aanleiding: Thomas meldde weinig ruimte. Bij meting bleek de C-schijf vrijwel
vol: **0,5 GB vrij van 236,9 GB**. Dat verklaarde ook waarom de E2E-testsuite
die avond omviel — de eerste tests deden er 2,8 uur over. Dat waren geen
testfouten maar een uitgehongerde machine.

## Wat ik heb opgeschoond (veilig en regenereerbaar)

| Wat                                                     | Vrijgemaakt |
| ------------------------------------------------------- | ----------- |
| npm-cache (`npm cache clean --force`)                   | ~1,4 GB     |
| Windows-Temp, bestanden ouder dan 7 dagen               | ~1,3 GB     |
| Projectartefacten (`test-results`, `playwright-report`) | klein       |

**Resultaat: 0,5 GB → ruim 3,2 GB vrij.**

Alles hierboven komt vanzelf terug wanneer het nodig is. Er is geen enkel
persoonlijk of bedrijfsbestand aangeraakt.

## Waar de ruimte werkelijk zit — dit zijn jouw keuzes, niet de mijne

Van de 236,9 GB:

| Post                        | Grootte | Opmerking                                  |
| --------------------------- | ------- | ------------------------------------------ |
| `Users\Gebruiker\AppData`   | 56,3 GB | zie hieronder                              |
| `Users\Gebruiker\Documents` | 56,2 GB | vrijwel volledig persoonlijk/bedrijfsmatig |
| `Windows`                   | 43,6 GB | systeem                                    |
| `Users\Gebruiker\Pictures`  | 29,2 GB | persoonlijk                                |
| `ProgramData`               | 16,1 GB | waarvan **13,75 GB McAfee**                |
| `Program Files` (beide)     | 18,4 GB | programma's                                |
| `Users\Gebruiker\Downloads` | 5,9 GB  | vaak op te ruimen, maar jouw keuze         |

Binnen AppData springen eruit:

- `Local\Packages` — 16,4 GB (Windows Store-apps)
- `Local\CapCut` — **14,5 GB** (videobewerking; cache of je eigen projecten)
- `Local\Microsoft` — 5,2 GB

### Drie dingen die ik je zou voorleggen

1. **Twee virusscanners tegelijk: McAfee (13,75 GB) én Norton.** Dat kost niet
   alleen ruimte — twee scanners die elkaars bestandstoegang controleren maken
   een machine aantoonbaar traag, en dat past bij wat ik zag (tests die 2,8 uur
   duurden, ~60 vastgelopen node-processen). Eén ervan verwijderen levert
   waarschijnlijk het meeste op, in ruimte én snelheid. **Dit raak ik niet aan:
   beveiligingssoftware verwijderen is jouw beslissing, geen agentklus.**
2. **CapCut, 14,5 GB.** Kijk of dat cache is of je echte videoprojecten. Als het
   projecten zijn: die horen op een externe schijf, niet op een volle C.
3. **Downloads, 5,9 GB.** Meestal grotendeels installatiebestanden die je niet
   meer nodig hebt.

## Wat ik bewust NIET heb gedaan

- Niets in `Documents`, `Pictures`, `Downloads` of de prullenbak (die is leeg).
- Geen virusscanner aangeraakt.
- `.cache\codex-runtimes` (1,36 GB) en `AppData\Roaming\Claude\vm_bundles`
  (1,95 GB) laten staan: dat is de runtime van Codex respectievelijk mijzelf.
  Weggooien werkt, maar dwingt een nieuwe download af en kan een lopende sessie
  breken.
- De ~60 verweesde node-processen niet afgeschoten. Ze kosten nauwelijks
  geheugen en één ervan is mijn eigen sessie; verkeerd gokken breekt het werk.
  Een herstart van de computer ruimt ze vanzelf op.

## Terugkerend patroon om te onthouden

`CLAUDE.md` beschrijft een eerdere keer dat de schijf volliep door ~14 GB
verweesde OneDrive-updateresten in Temp. Dat was deze keer **niet** de oorzaak
(Temp was ~2 GB). Het loont om bij "schijf vol" eerst te meten in plaats van de
vorige oorzaak aan te nemen.
