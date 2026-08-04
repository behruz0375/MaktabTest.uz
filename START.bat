@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MaktabTest.uz - Server
echo ==================================================
echo         MaktabTest.uz  -  ishga tushirilmoqda
echo ==================================================
echo.

REM --- Python'ni topamiz ---
set PYEXE=
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYEXE="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if "%PYEXE%"=="" ( where py >nul 2>nul && set PYEXE=py )
if "%PYEXE%"=="" ( where python >nul 2>nul && set PYEXE=python )
if "%PYEXE%"=="" (
  echo [XATO] Python topilmadi!
  echo python.org saytidan Python 3.12 ni o'rnating va qaytadan urinib ko'ring.
  echo.
  pause
  exit /b 1
)

echo Kutubxonalar tekshirilmoqda / o'rnatilmoqda...
%PYEXE% -m pip install -r requirements.txt --quiet --disable-pip-version-check

echo.
echo ==================================================
echo   TAYYOR!  Brauzerda oching:  http://localhost:5000
echo   To'xtatish uchun: shu oynada Ctrl+C bosing.
echo ==================================================
echo.
%PYEXE% app.py
pause
