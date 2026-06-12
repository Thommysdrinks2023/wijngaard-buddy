# MVP-Audit Wijngaard Buddy

**Laatst bijgewerkt:** 12 juni 2026 · na de "productie-kwaliteit"-ronde
**Vorige score: 72/100 → Nieuwe score: 88/100**

## Scores per onderdeel

| Feature | Was | Nu | Wat er veranderde |
|---|---|---|---|
| Dashboard | 8 | 9 | Waarschuwingen (vigor↓, ziektedruk, dagen-zonder-meting per ras), jaarvergelijking |
| Perceelkaart | 8 | 9 | Opent nu de rij-detailpagina; snelle-meting-knop bovenaan |
| Metingen invoeren | 7 | 9 | /snel-modus (Brix in 3 tikken, rij onthouden), vorige/volgende rij |
| Observaties | 8 | 8 | Ongewijzigd (was al goed) |
| Fenologie | 7 | 8 | Prullenbak + ongedaan-maken bij verwijderen, offline edit synct |
| Steekproeven | 6 | 7 | Duidelijk afgebakend t.o.v. Gezondheid, verwijderen herstelbaar |
| Werkkalender | 6 | 6 | Ongewijzigd |
| Weer widget | 8 | 8 | Ongewijzigd (verwachting + vorstalarm waren er al) |
| GDD | 8 | 8 | Ongewijzigd |
| Vine Health | 7 | 8 | Ziektedruk-integratie + waarschuwingen + meerjarengrafiek |
| Harvest Tracker | 7 | 8 | kg/ha + vergelijkingsgrafiek |
| Work Report | 7 | 9 | **Wettelijke spuitregistratie** (middel/dosering/reden/wachttijd), kosten, taart |
| Custom Trends | 7 | 7 | ErrorState toegevoegd |
| Foto's | 7 | 9 | **Compressie naar 1600px (80-90% kleiner)** + offline-opslag bestond al |
| Login/Auth | 5 | 7 | Optioneel (bewuste keuze: app moet altijd direct openen in het veld); naam in header, uitloggen, welkomstscherm |
| Offline mode | 8 | 9 | Sync-fouten zichtbaar + melding, conflictwaarschuwing, audit-log offline-safe |
| Data export | 6 | 7 | Bestond al; prullenbak + audit-log erbij als vangnet |
| Navigatie | 7 | 9 | **Zoekfunctie overal bereikbaar**, menu gegroepeerd (Veld/Analyse/Beheer), onboarding |
| Responsive/mobiel | 8 | 8 | + zonlicht-modus (zwart/geel) en grotere-tekst-optie |

## Nieuw in deze ronde

- **Login optioneel** (de verplichte variant sloot gebruikers buiten en is teruggedraaid);
  de "Niet ingelogd"-badge in de header waarschuwt zichtbaar op elk scherm
- **Zoekfunctie** (/zoeken): rijnummer, ras, type, datum, vrije tekst, middelnaam
- **Spuitregistratie** volgens NL-registratieplicht
- **Prullenbak** (30 dagen) + "Ongedaan maken" (5 sec) bij verwijderen
- **Audit-log** (wie/wat/wanneer/oude waarde) lokaal + audit_log-collectie
- **Foto-compressie** vóór upload met besparing-melding
- **Sync-problemen zichtbaar** in instellingen + toast bij geweigerde records
- **Conflictwaarschuwing** bij updates die elkaar kruisen (laatste schrijver wint)
- **Zonlicht-modus** + grotere tekst, focus-states, aria-labels
- **Onboarding** (3 schermen) bij eerste gebruik
- **Snelle meting** (/snel) — Brix in 3 tikken met onthouden rij
- **DRY**: gedeelde opslag-helpers, lab-mapper gededupliceerd, hele codebase door prettier
- **Productie-build**: getest, alle routes 200; lint 0 fouten; tsc 0 fouten

## Wat nog openstaat (eerlijk)

1. **Server**: alles draait nog op de laptop. VPS herstellen (Hetzner-wachtwoordreset) of
   Raspberry Pi inrichten + `scripts/install-pocketbase-vps.sh` + `setup-pocketbase.mjs`.
2. **HTTPS** (pb.tappenmars.nl): vereist voor camera (QR-scan), GPS en PWA-installatie
   op telefoons buiten localhost. Dit is de resterende echte showstopper voor veldgebruik.
3. Offsite backup (zips staan op dezelfde laptop-schijf).
4. Werkkalender-UI en FormField-component-consolidatie (functioneel prima, cosmetisch).
5. Seizoens-archivering ("afgesloten" markeren) — jaarwissel en terug-invoeren werken al.

**Score 88/100.** De resterende 12 punten zitten vrijwel volledig in infrastructuur
(server + HTTPS), niet in de software zelf.
