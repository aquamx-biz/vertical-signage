@echo off
REM รอบ 2: snap ราคา listing + recompute aggregates + แก้ firstSeenAt วันตรวจ
cd /d "%~dp0"
call npx sanity exec scripts/fix-39bs-round2.ts --with-user-token || goto :err
echo.
echo ============ DONE ============
pause
exit /b 0
:err
echo *** FAILED ***
pause
exit /b 1
