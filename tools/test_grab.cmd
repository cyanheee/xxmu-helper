@echo off
REM Offline behaviour test for WebActivity.buildGrabJs output.
REM Keep this file ASCII-only: cmd.exe reads .cmd as ANSI/GBK, so Chinese
REM comments here turn into mojibake and break the script itself.
setlocal
cd /d "%~dp0.."

set AJ=D:\android-sdk\platforms\android-33\android.jar
set LIB=android\libs\zxing-core-3.5.3.jar
set CLS=android\build\classes
if not exist build_test mkdir build_test

echo [1/3] javac TestGrab
javac -source 8 -target 8 -encoding UTF-8 -bootclasspath "%AJ%" -cp "%CLS%;%AJ%" -d build_test tools\TestGrab.java
if errorlevel 1 exit /b 1

echo [2/3] write grab.js as UTF-8
java "-Dfile.encoding=UTF-8" -cp "build_test;%CLS%;%AJ%;%LIB%" com.xxmu.helper.TestGrab build_test\grab.js
if errorlevel 1 exit /b 1

echo [3/3] run DOM shim
node tools\test_grab.js build_test\grab.js
exit /b %errorlevel%
