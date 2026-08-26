@echo off
REM ============================================================
REM  ingest-dryrun-2026-08-23.cmd — dry-run ingest รอบ 2026-08-23
REM  (ไม่มี --write — ดู ROUND_WARNINGS ก่อนเสมอ)
REM  log: vertical-signage\_rounds\_ingest-dryrun-2026-08-23.txt
REM ============================================================
cd /d "%~dp0.."
title AquaMX ingest dry-run 2026-08-23
echo === dry-run start %date% %time% > "_rounds\_ingest-dryrun-2026-08-23.txt"
call node --env-file=.env tools\ingest-units.mjs --round "C:\Users\Lenovo\Downloads\round-2026-08-23.json" --date 2026-08-23 >> "_rounds\_ingest-dryrun-2026-08-23.txt" 2>&1
echo === done >> "_rounds\_ingest-dryrun-2026-08-23.txt"
echo.
echo   dry-run DONE - see _rounds\_ingest-dryrun-2026-08-23.txt
pause
