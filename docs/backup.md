# Backup & herstel — PocketBase (`pb_data`)

Eindsprint Blok C. De database is één map (`pocketbase/pb_data`): SQLite-bestanden (`data.db`, `auxiliary.db`) plus geüploade bestanden (`storage/`). Wie die map heeft, heeft alles.

## Huidige situatie (Windows-devmachine)

- **Script**: `scripts/backup-pocketbase.ps1` — draait dagelijks om 20:00 via Taakplanner-taak **"Wijngaard PocketBase Backup"** (accu-instellingen staan bewust uit, zie CLAUDE.md).
- **Werking**: server draait → consistente zip via PocketBase's eigen backup-API (superuser-login uit `pocketbase/backup-credentials.txt`); server uit → directe bestandskopie van `pb_data`.
- **Rotatie** (sinds 6 juli 2026): **7 dagelijkse** (`wijngaard_backup_*.zip`), **4 wekelijkse** (`wijngaard_week_<jaar>W<week>.zip`, eerste backup van de ISO-week), **12 maandelijkse** (`wijngaard_maand_<jaarmaand>.zip`, eerste backup van de maand).
- **Locatie**: `C:\Users\Gebruiker\Documents\Tappenmars\Wijngaard\Backups` + logregel per run in `backup-log.txt` daar.
- ⚠️ **Dit is dezelfde schijf als de server.** Een kapotte laptop-SSD = data én backups kwijt. Offsite is de ontbrekende stap — zie hieronder.

## Offsite-scenario's (kant-en-klaar, nog niet actief)

### A. Nu al mogelijk: Windows → externe schijf of VPS

Externe USB-schijf (bijv. `E:\TappenmarsBackups`) — voeg onderaan `backup-pocketbase.ps1` toe (of als losse taak):

```powershell
$offsite = "E:\TappenmarsBackups"
if (Test-Path $offsite) {
    robocopy $backupMap $offsite *.zip /MIR /R:1 /W:5 | Out-Null
    Log "OK  offsite-kopie naar $offsite"
} else {
    Log "WAARSCHUWING  offsite-schijf niet aangesloten"
}
```

Of naar de Hetzner-VPS zodra die weer toegankelijk is (vereist eenmalig een SSH-sleutel, `ssh-keygen` + sleutel in `~/.ssh/authorized_keys` op de VPS):

```powershell
scp "$backupMap\wijngaard_backup_*.zip" gebruiker@vps.tappenmars.nl:/srv/backups/wijngaard/
```

### B. Toekomst: Raspberry Pi (productie) → Hetzner VPS

Cron op de Pi (dagelijks 20:15, ná de lokale backup van 20:00):

```cron
15 20 * * * rsync -az --delete /home/pi/wijngaard/backups/ backupuser@vps.tappenmars.nl:/srv/backups/wijngaard/
```

Of als systemd-timer (`/etc/systemd/system/wijngaard-offsite.timer` + `.service` met hetzelfde rsync-commando; `OnCalendar=*-*-* 20:15`). rsync over SSH is voldoende — de zips zijn al gecomprimeerd.

### C. Toekomst: Hetzner → externe opslag

Hetzner biedt per VPS een gratis/goedkope "Storage Box" met rsync/sftp-ondersteuning:

```cron
30 20 * * * rsync -az /srv/backups/wijngaard/ u123456@u123456.your-storagebox.de:wijngaard/
```

Daarmee staat de keten: Pi (bron) → VPS (offsite 1) → Storage Box (offsite 2, ander datacenter).

## Herstelprocedure (getest op 6 juli 2026)

1. Stop PocketBase (`Stop-ScheduledTask -TaskName "PocketBase Tappenmars"` + `Get-Process pocketbase | Stop-Process -Force`).
2. Hernoem de huidige `pocketbase/pb_data` naar `pb_data_kapot_<datum>` (nooit direct weggooien).
3. Maak een nieuwe, lege `pocketbase/pb_data` en pak de gekozen backup-zip **erin** uit (de zip bevat de inhóud van pb_data: `data.db`, `auxiliary.db`, `storage/`, …).
4. Start PocketBase weer (`Start-ScheduledTask -TaskName "PocketBase Tappenmars"`).
5. Controleer: `http://127.0.0.1:8090/api/health` → 200, en open de app — rijen/tanks/partijen moeten er staan.

**Testverslag (6 juli 2026):** backup `wijngaard_backup_20260706_225425.zip` uitgepakt in een wegwerpmap, tweede PocketBase-instantie gestart op poort 8091 met `--dir` naar die map en een lege `--hooksDir`. Resultaat: health 200; alle kerncollecties (`rijen`, `tanks`, `tankboek`, `partijen`, `voorraad_flessen`, `inzichten`) aanwezig; de 5 echte `agent_acties`-productierecords van 3 juli exact teruggelezen. Wegwerpinstantie daarna gestopt en opgeruimd — de echte server op 8090 is nooit aangeraakt.

## Bekende valkuilen

- De Taakplanner-taak faalt stil als de laptop op accu draait als `DisallowStartIfOnBatteries` weer aan zou staan — staat bewust uit (CLAUDE.md).
- `pb_data/backups/` (PocketBase's eigen backupmap) wordt door het script direct opgeruimd na het kopiëren, anders loopt de databasemap zelf vol.
- De zip van de API-route is consistent (PocketBase pauzeert schrijfacties); de bestandskopie-terugvalroute alleen als de server uit staat.
