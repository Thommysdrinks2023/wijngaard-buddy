@echo off
title Wijngaard Buddy
echo.
echo  ============================================
echo   Wijngaard Buddy wordt gestart...
echo  ============================================
echo.

rem -- PocketBase starten (geminimaliseerd venster)
start "PocketBase - niet sluiten" /min "%~dp0pocketbase\pocketbase.exe" serve --http=127.0.0.1:8090 --dir "%~dp0pocketbase\pb_data"

rem -- Browser openen zodra de app klaar is (na ~10 seconden)
start "" cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:8080"

rem -- De app zelf starten (dit venster open laten!)
cd /d "%~dp0"
echo  De app start nu. Laat dit venster open staan.
echo  De browser opent vanzelf op http://localhost:8080
echo.
call npm run dev
pause
