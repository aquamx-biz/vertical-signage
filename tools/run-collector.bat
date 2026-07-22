@echo off
REM One-click run of the kiosk health collector (adb over Tailscale -> app.aquamx.biz).
REM Same script the "AquaMX Kiosk Health" scheduled task runs every 4h.
title AquaMX Kiosk Health - collector
echo Running collector... (connects to each box over Tailscale, ~30-60s)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kiosk-health.ps1"
echo.
echo Done. Refresh the Fleet Health page in Sanity Studio to see the new data.
echo Press any key to close.
pause >nul
