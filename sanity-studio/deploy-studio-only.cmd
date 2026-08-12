@echo off
REM steps 5-6 เท่านั้น (data import สำเร็จไปแล้วรอบก่อน)
cd /d "%~dp0"
echo [5/6] Schema deploy...
call npx sanity schema deploy || goto :err
echo.
echo [6/6] Studio deploy...
call npx sanity deploy || goto :err
echo.
echo ============================================
echo   DONE — schema + studio deploy สำเร็จ
echo ============================================
pause
exit /b 0
:err
echo.
echo *** FAILED — ดู error ด้านบน ***
pause
exit /b 1
