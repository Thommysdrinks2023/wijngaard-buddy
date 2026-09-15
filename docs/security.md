# Security-notities (Fase 7 Blok A)

Laatst bijgewerkt: 16 juli 2026.

## 1. PocketBase admin-UI-afscherming

**Huidige situatie (Windows dev-machine): al afgeschermd.** PocketBase start via
`deploy/start-pocketbase.bat` met `--http=127.0.0.1:8090` — de server (en dus ook
de admin-UI op `/_/`) is **uitsluitend vanaf deze machine zelf** bereikbaar, niet
vanaf het LAN of internet. Er is geen extra firewallregel nodig zolang deze bind
niet verandert.

**Bij migratie naar Raspberry Pi / VPS moet dit expliciet geregeld worden:**

- Bind PocketBase aan het LAN-adres (Pi) of `127.0.0.1` achter een reverse proxy (VPS).
- Scherm `/_/` en `/api/settings` af in de reverse proxy (nginx/Caddy):
  alleen toegankelijk vanaf het LAN of via een VPN/SSH-tunnel — nooit publiek.
- Publiek hoeven alleen: `/api/collections/*` (met de bestaande API-rules),
  de app-routes en `/api/tappenmars/*` + `/api/agent/*` (die laatste pas na
  rate-limit-herziening, zie CLAUDE.md).
- Dit valt onder de toestemmingsregel (geen serverconfig zonder akkoord van Thomas).

## 2. 2FA/OTP voor beheerders

PocketBase 0.39 **ondersteunt** OTP en MFA (per auth-collectie, dus ook voor
`_superusers` en `users`). **Bewust nog niet ingeschakeld**, want:

- OTP-codes worden per e-mail bezorgd en **SMTP staat niet geconfigureerd**
  (gecontroleerd op 16 juli 2026 via `/api/settings`: `smtp.enabled = false`).
  OTP aanzetten zonder werkende mail = gegarandeerde lock-out.

**Upgrade-route (wanneer gewenst):** (1) SMTP instellen in de PocketBase-admin
(bijv. de Cloud86-mailserver van tappenmars.nl), (2) testmail versturen,
(3) OTP aanzetten voor `_superusers`, daarna optioneel MFA voor `users` met rol
beheerder. Pas doen als e-mailbezorging bewezen werkt.

**Tussenmaatregel (nu van kracht):** wachtwoordbeleid — beheerderswachtwoorden
minimaal 14 tekens, uniek per account, niet hergebruikt van andere diensten.
De bestaande accounts voldoen (vastgelegd in het werklog van 16 juli 2026).
De server luistert bovendien alleen op localhost (punt 1), waardoor het
aanvalsoppervlak beperkt is tot de machine zelf.

## 3. EXIF-metadata (GPS) in foto's

Elke foto-upload loopt door `src/lib/foto-compressie.ts`, die de afbeelding
**altijd** via canvas hercodeert naar een kale JPEG — canvas-hercodering neemt
géén EXIF-metadata over, dus GPS-locatie, cameramodel en tijdstempel worden
vóór opslag gestript. Sinds Fase 7 geldt dit ook voor kleine bestanden
(< 300 KB) en voor gevallen waar hercodering groter uitvalt; die gingen eerder
ongewijzigd (mét metadata) door.

**Restrisico:** als de browser een afbeelding helemaal niet kan decoderen
(exotisch formaat, corrupt bestand), wordt het origineel geüpload. Dat is
zeldzaam en betreft dan meestal geen camerafoto met GPS.

## 4. Backup-monitoring

`scripts/backup-pocketbase.ps1` meldt sinds Fase 7 zijn resultaat op twee manieren:

- **Lokaal**: `backup-log.txt` (bestond al) én een statusrecord in PocketBase
  (`regelgeving_instellingen`, sleutel `laatste_backup`) zodat de app een
  widget "laatste geslaagde backup" kan tonen (waarschuwing na > 2 dagen).
- **Extern (optioneel)**: staat er een URL in `scripts/healthcheck-url.txt`
  (bijv. een healthchecks.io-ping-URL), dan pingt het script die bij succes en
  `<url>/fail` bij falen. Bestand leeg of afwezig = alleen lokaal loggen.
  Het bestand staat in `.gitignore` (bevat een geheim ping-adres).

## 5. AVG

Zie `docs/privacy.md`.

## 6. Agent-context-minimalisatie (geverifieerd 16 juli 2026)

De systeemprompt van de AI-agent is een statisch bestand
(`agent_systeemprompt.md`, gelezen in `leesSysteemprompt()`); er wordt **geen
klant- of persoonsdata standaard ingeladen**. Klantgegevens bereiken het model
uitsluitend wanneer het zelf `zoek_klanten`/`zoek_orders` aanroept — dus alleen
bij expliciete klant-/ordervragen in het gesprek, en dan beperkt tot
naam/type/contact resp. orderregels. Foto's en metingen bevatten na punt 3 geen
locatiemetadata meer.
