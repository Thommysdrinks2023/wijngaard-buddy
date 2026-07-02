@echo off
REM Start PocketBase voor Tappenmars Buddy.
REM
REM Werkmap moet de map "pocketbase" zijn, niet de projectroot: PocketBase
REM zoekt pb_data en pb_hooks relatief aan de working directory, en beide
REM staan in die submap. %~dp0 is de map van dit bat-bestand zelf
REM (projectroot\deploy\), dus ..\pocketbase is projectroot\pocketbase\.
REM Dit werkt ongeacht vanuit welke map het bestand wordt aangeroepen,
REM dus ook via de Taakplanner.
REM
REM Let op: ".\" voor pocketbase.exe is verplicht. Op deze machine staat
REM NoDefaultCurrentDirectoryInExePath aan (Windows-hardening, vaak door
REM beveiligingssoftware gezet), waardoor cmd.exe een kale bestandsnaam
REM NIET meer in de werkmap zoekt - alleen nog op het PATH. Zonder ".\"
REM geeft dit "pocketbase.exe is not recognized" ondanks dat het bestand
REM er wel degelijk staat.
cd /d "%~dp0..\pocketbase"
.\pocketbase.exe serve --http=127.0.0.1:8090
