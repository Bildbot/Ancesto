@echo off
title Compile Native Windows EXE
echo ========================================================
echo   Creating Rodoslovnaya.exe using Windows Built-in Tools
echo ========================================================
echo.

REM 1. Locate built-in Windows C# compiler
set CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
    set CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe
)

if not exist "%CSC%" (
    echo [ERROR] .NET Framework compiler not found at %CSC%
    pause
    exit /b 1
)

REM 2. Compile launcher.cs to native executable (winexe = no black console window)
echo Compiling launcher.cs into Rodoslovnaya.exe...
"%CSC%" /nologo /target:winexe /reference:System.Windows.Forms.dll /out:Rodoslovnaya.exe launcher.cs

if %errorlevel% neq 0 (
    echo [ERROR] Compilation failed.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   SUCCESS! Rodoslovnaya.exe has been created!
echo   Size: approx 25 KB. Zero external dependencies.
echo ========================================================
echo.
echo You can now double-click Rodoslovnaya.exe to run the app.
echo.
pause
