# Dagelijkse backup van de Wijngaard Buddy PocketBase-database.
# - Server draait:  vraagt PocketBase zelf om een consistente backup-zip
#                   (admin-login uit pocketbase\backup-credentials.txt)
# - Server uit:     pakt de pb_data-map rechtstreeks in
# Rotatie (Eindsprint Blok C, zie docs/backup.md):
#   - dagelijks:   laatste 7  (wijngaard_backup_*.zip)
#   - wekelijks:   laatste 4  (wijngaard_week_*.zip — eerste backup van de ISO-week)
#   - maandelijks: laatste 12 (wijngaard_maand_*.zip — eerste backup van de maand)
# Wordt dagelijks om 20:00 gedraaid via Windows Taakplanner
# (taak: "Wijngaard PocketBase Backup").

$ErrorActionPreference = "Stop"

$projectMap = Split-Path -Parent $PSScriptRoot
$pbDataMap = Join-Path $projectMap "pocketbase\pb_data"
$credBestand = Join-Path $projectMap "pocketbase\backup-credentials.txt"
$backupMap = "C:\Users\Gebruiker\Documents\Tappenmars\Wijngaard\Backups"
$logBestand = Join-Path $backupMap "backup-log.txt"
$pbUrl = "http://127.0.0.1:8090"

New-Item -ItemType Directory -Force $backupMap | Out-Null

function Log($tekst) {
    $regel = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $tekst"
    Add-Content -Path $logBestand -Value $regel
    Write-Output $regel
}

$stempel = Get-Date -Format "yyyyMMdd_HHmmss"
$doelZip = Join-Path $backupMap "wijngaard_backup_$stempel.zip"

$serverDraait = $false
try {
    Invoke-RestMethod "$pbUrl/api/health" -TimeoutSec 5 | Out-Null
    $serverDraait = $true
} catch {}

$gelukt = $false

if ($serverDraait -and (Test-Path $credBestand)) {
    # Nette route: PocketBase maakt zelf een consistente backup
    try {
        $regels = Get-Content $credBestand
        $auth = Invoke-RestMethod -Method Post -Uri "$pbUrl/api/collections/_superusers/auth-with-password" `
            -ContentType "application/json" `
            -Body (ConvertTo-Json @{ identity = $regels[0].Trim(); password = $regels[1].Trim() })
        $headers = @{ Authorization = $auth.token }
        $backupNaam = "auto_$stempel.zip"
        Invoke-RestMethod -Method Post -Uri "$pbUrl/api/backups" -Headers $headers `
            -ContentType "application/json" -Body (ConvertTo-Json @{ name = $backupNaam }) | Out-Null
        $bron = Join-Path $pbDataMap "backups\$backupNaam"
        if (Test-Path $bron) {
            Copy-Item $bron $doelZip -Force
            # opruimen in pb_data zelf zodat die map niet volloopt
            Remove-Item $bron -Force
            $gelukt = $true
            Log "OK  backup via PocketBase API -> $doelZip"
        }
    } catch {
        Log "WAARSCHUWING  API-backup mislukt ($($_.Exception.Message)), val terug op bestandskopie"
    }
}

if (-not $gelukt) {
    # Terugvalroute: map direct inpakken (betrouwbaar wanneer de server uit staat)
    if (-not (Test-Path $pbDataMap)) {
        Log "FOUT  pb_data niet gevonden op $pbDataMap"
        exit 1
    }
    Compress-Archive -Path "$pbDataMap\*" -DestinationPath $doelZip -Force
    $gelukt = $true
    Log "OK  backup via bestandskopie -> $doelZip"
}

# --- Monitoring (Fase 7 Blok A) ---
# Externe healthcheck-ping (optioneel): zet een ping-URL (bijv. healthchecks.io)
# in scripts\healthcheck-url.txt. Leeg of afwezig = alleen lokaal loggen.
$healthBestand = Join-Path $PSScriptRoot "healthcheck-url.txt"
if (Test-Path $healthBestand) {
    $healthUrl = (Get-Content $healthBestand -TotalCount 1)
    if ($healthUrl) { $healthUrl = $healthUrl.Trim() }
    if ($healthUrl) {
        try {
            $pingUrl = if ($gelukt) { $healthUrl } else { "$healthUrl/fail" }
            Invoke-RestMethod $pingUrl -TimeoutSec 10 | Out-Null
            Log "OK  healthcheck-ping verstuurd"
        } catch {
            Log "WAARSCHUWING  healthcheck-ping mislukt ($($_.Exception.Message))"
        }
    }
}

# Statusrecord in PocketBase zodat de app "laatste geslaagde backup" kan tonen
# (regelgeving_instellingen, sleutel 'laatste_backup'). Alleen mogelijk als de
# server draait en we een API-token hebben; anders is de app toch ook offline.
if ($gelukt -and $serverDraait -and $headers) {
    try {
        $filter = [uri]::EscapeDataString("sleutel='laatste_backup'")
        $bestaand = Invoke-RestMethod -Uri "$pbUrl/api/collections/regelgeving_instellingen/records?filter=$filter" -Headers $headers
        $statusBody = ConvertTo-Json @{
            sleutel             = "laatste_backup"
            laatst_gecontroleerd = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            bron                = (Split-Path $doelZip -Leaf)
        }
        if ($bestaand.totalItems -gt 0) {
            Invoke-RestMethod -Method Patch -Uri "$pbUrl/api/collections/regelgeving_instellingen/records/$($bestaand.items[0].id)" `
                -Headers $headers -ContentType "application/json" -Body $statusBody | Out-Null
        } else {
            Invoke-RestMethod -Method Post -Uri "$pbUrl/api/collections/regelgeving_instellingen/records" `
                -Headers $headers -ContentType "application/json" -Body $statusBody | Out-Null
        }
        Log "OK  backup-status naar PocketBase geschreven"
    } catch {
        Log "WAARSCHUWING  backup-status schrijven mislukt ($($_.Exception.Message))"
    }
}

# --- Rotatie: 7 dagelijks / 4 wekelijks / 12 maandelijks ---
# Wekelijkse kopie: eerste geslaagde backup van deze ISO-week
$cal = [System.Globalization.CultureInfo]::InvariantCulture.Calendar
$weekNr = $cal.GetWeekOfYear((Get-Date), [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [DayOfWeek]::Monday)
$weekStempel = "{0}W{1:d2}" -f (Get-Date -Format "yyyy"), $weekNr
$weekDoel = Join-Path $backupMap "wijngaard_week_$weekStempel.zip"
if ($gelukt -and -not (Test-Path $weekDoel)) {
    Copy-Item $doelZip $weekDoel -Force
    Log "OK  wekelijkse kopie -> $weekDoel"
}

# Maandelijkse kopie: eerste geslaagde backup van deze maand
$maandStempel = Get-Date -Format "yyyyMM"
$maandDoel = Join-Path $backupMap "wijngaard_maand_$maandStempel.zip"
if ($gelukt -and -not (Test-Path $maandDoel)) {
    Copy-Item $doelZip $maandDoel -Force
    Log "OK  maandelijkse kopie -> $maandDoel"
}

function Ruim-Op($filter, $bewaar) {
    Get-ChildItem $backupMap -Filter $filter |
        Sort-Object Name -Descending |
        Select-Object -Skip $bewaar |
        ForEach-Object {
            Remove-Item $_.FullName -Force
            Log "Opgeruimd: $($_.Name)"
        }
}
Ruim-Op "wijngaard_backup_*.zip" 7
Ruim-Op "wijngaard_week_*.zip" 4
Ruim-Op "wijngaard_maand_*.zip" 12
