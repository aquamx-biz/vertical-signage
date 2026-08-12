@echo off
REM ล้างผล audit 39BS ฝั่งข้อมูล + deploy studio (แก้วันที่รอบข้อมูลใน Unit Boards)
cd /d "%~dp0"
echo [1/2] Fix 39BS data in Sanity...
call npx sanity exec scripts/fix-39bs-data.ts --with-user-token || goto :err
echo.
echo [2/2] Studio deploy...
call npx sanity deploy || goto :err
echo.
echo ============================================
echo   DONE
echo ============================================
pause
exit /b 0
:err
echo *** FAILED ***
pause
exit /b 1
