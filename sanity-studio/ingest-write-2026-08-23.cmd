@echo off
REM ============================================================
REM  ingest-write-2026-08-23.cmd — เขียนจริงรอบ 2026-08-23 (--write)
REM  รันหลัง dry-run ผ่านแล้วเท่านั้น
REM  log: vertical-signage\_rounds\_ingest-write-2026-08-23.txt
REM ============================================================
cd /d "%~dp0.."
title AquaMX ingest WRITE 2026-08-23
echo === write start %date% %time% > "_rounds\_ingest-write-2026-08-23.txt"
call node --env-file=.env tools\ingest-units.mjs --round "C:\Users\Lenovo\Downloads\round-2026-08-23.json" --date 2026-08-23 --write >> "_rounds\_ingest-write-2026-08-23.txt" 2>&1
echo === done >> "_rounds\_ingest-write-2026-08-23.txt"
echo.
echo   WRITE DONE - see _rounds\_ingest-write-2026-08-23.txt
pause
