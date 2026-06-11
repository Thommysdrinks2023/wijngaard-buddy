# Dagelijkse backup van de Wijngaard Buddy PocketBase-database.
# - Server draait:  vraagt PocketBase zelf om een consistente backup-zip
#                   (admin-login uit pocketbase\backup-credentials.txt)
# - Server uit:     pakt de pb_data-map rechtstreeks in
# Bewaart de laatste 14 backups in de Backups-map.
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

# Laatste 14 backups bewaren, oudere verwijderen
Get-ChildItem $backupMap -Filter "wijngaard_backup_*.zip" |
    Sort-Object Name -Descending |
    Select-Object -Skip 14 |
    ForEach-Object {
        Remove-Item $_.FullName -Force
        Log "Opgeruimd: $($_.Name)"
    }
