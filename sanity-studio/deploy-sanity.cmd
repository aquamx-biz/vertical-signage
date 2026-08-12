@echo off
REM ============================================================
REM  deploy-sanity.cmd — full market-data deploy (2026-08-08)
REM  1. purge unitProfile/unitSource เก่า (ข้อมูล bug ก่อน clean)
REM  2. import ndjson ชุดใหม่จาก Downloads (profiles/snapshots/sources)
REM  3. schema deploy (contactLog + rent/sale listings split)
REM  4. deploy hosted studio
REM ============================================================
cd /d "%~dp0"
echo.
echo [1/6] Purge old unit docs...
call npx sanity exec scripts/purge-market-docs.ts --with-user-token || goto :err
echo.
echo [2/6] Import unit-profiles.ndjson - production...
call npx sanity dataset import "C:\Users\Lenovo\Downloads\unit-profiles.ndjson" production --replace || goto :err
echo.
echo [3/6] Import market-snapshots.ndjson - production...
call npx sanity dataset import "C:\Users\Lenovo\Downloads\market-snapshots.ndjson" production --replace || goto :err
echo.
echo [4/6] Import unit-sources.ndjson - internal...
call npx sanity dataset import "C:\Users\Lenovo\Downloads\unit-sources.ndjson" internal --replace || goto :err
echo.
echo [5/6] Schema deploy...
call npx sanity schema deploy || goto :err
echo.
echo [6/6] Studio deploy...
call npx sanity deploy || goto :err
echo.
echo ============================================
echo   DONE — deploy สำเร็จทั้งหมด
echo ============================================
pause
exit /b 0
:err
echo.
echo *** FAILED — ดู error ด้านบน ***
pause
exit /b 1
