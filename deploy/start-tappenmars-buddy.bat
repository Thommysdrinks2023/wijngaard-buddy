@echo off
REM Desktop-snelkoppeling voor De Tappenmars Buddy.
REM Start (indien nodig) de lokale dev-server op poort 5173 en opent de app
REM als een eigen appvenster (geen adresbalk/tabs) in Chrome of Edge.
REM
REM PocketBase draait al altijd via de Taakplanner-taak "PocketBase
REM Tappenmars" (zie CLAUDE.md) -- dit script raakt alleen de frontend aan.

setlocal

set "PROJECTMAP=%~dp0.."
set "POORT=5173"
set "URL=http://localhost:%POORT%/"

REM npm i.p.v. bun: bun staat niet gegarandeerd in het PATH van elke sessie
REM (o.a. deze snelkoppeling draait buiten een interactieve devshell om),
REM npm/node zijn wel altijd beschikbaar. Zelfde package.json-scripts.
cd /d "%PROJECTMAP%"

REM Al een server op deze poort? Dan niet opnieuw starten (voorkomt een
REM tweede, conflicterende dev-server bij een dubbele klik).
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %POORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %ERRORLEVEL% EQU 0 goto servergereed

REM Verborgen venster: het zwarte devserver-consolevenster hoeft niet
REM zichtbaar te zijn voor dagelijks gebruik. Bij problemen: draai
REM "npm run dev" handmatig in een terminal om de output te zien.
start "" /min cmd /c "npm run dev -- --port %POORT% --strictPort"

REM Wachten tot de server echt reageert (max ~30s), anders opent de browser
REM op een leeg/foutscherm vlak vóór de server klaar is. Labels/goto's staan
REM hier BEWUST buiten elk if-(...)-blok: cmd.exe parseert zo'n blok in één
REM keer, en een goto naar een label binnen datzelfde blok breekt de batch
REM (eerder geconstateerd: het script bleef hangen zonder ooit verder te
REM komen, geen foutmelding). call :wachtopserver is de nette manier.
call :wachtopserver
goto servergereed

:wachtopserver
set "WACHT=0"
:wachtlus
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 1) | Out-Null; exit 0 } catch { exit 1 }"
if %ERRORLEVEL% EQU 0 exit /b 0
set /a WACHT+=1
if %WACHT% GEQ 30 exit /b 1
timeout /t 1 /nobreak >nul
goto wachtlus

:servergereed
REM --app= geeft een kaal venster (geen adresbalk, geen tabs) -- voelt aan
REM als een eigen programma i.p.v. een browsertab. Een apart --user-data-dir
REM houdt dit los van Thomas' normale Chrome-profiel/tabbladen.
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "APPDATAMAP=%LOCALAPPDATA%\TappenmarsBuddyApp"

if exist "%CHROME%" (
    start "" "%CHROME%" --app=%URL% --user-data-dir="%APPDATAMAP%"
) else if exist "%EDGE%" (
    start "" "%EDGE%" --app=%URL% --user-data-dir="%APPDATAMAP%"
) else (
    REM Geen Chrome/Edge gevonden: val terug op de standaardbrowser.
    start "" "%URL%"
)

endlocal
