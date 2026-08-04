@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MaktabTest.uz - Ommaviy havola (tunnel)
echo ==================================================
echo   OMMAVIY HAVOLA ochilmoqda...
echo.
echo   DIQQAT: avval START.bat ishlab turgan bo'lishi
echo   kerak (sayt localhost:5000 da ishlashi shart).
echo ==================================================
echo.
echo   Pastda  https://....trycloudflare.com  havolasi
echo   chiqadi. O'sha havolani odamlarga yuboring.
echo   Bu oyna YOPILMASIN - yopilsa havola o'chadi.
echo.

REM cloudflared ni topamiz
set "CF="
for /f "delims=" %%i in ('where cloudflared 2^>nul') do set "CF=%%i"
if not defined CF if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe"
if not defined CF (
  for /f "delims=" %%i in ('dir /b /s "%LOCALAPPDATA%\Microsoft\WinGet\Packages\cloudflared.exe" 2^>nul') do set "CF=%%i"
)
if not defined CF (
  echo [XATO] cloudflared topilmadi.
  echo O'rnatish uchun:  winget install Cloudflare.cloudflared
  echo.
  pause
  exit /b 1
)

"%CF%" tunnel --url http://localhost:5000
pause
