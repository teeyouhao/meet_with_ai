@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   MeetWithAI Verification Suite (scripts/verify.bat)
echo   Governing Rules: BUG-002, BUG-003, BUG-004
echo ============================================================

:: 1. BUG-003 Verification: Git Identity Invariant
echo [1/4] Checking Git Author Identity (BUG-003)...
for /f "delims=" %%i in ('git config user.name') do set GIT_USER=%%i
for /f "delims=" %%i in ('git config user.email') do set GIT_EMAIL=%%i

if not "!GIT_USER!"=="teeyouhao" (
    echo [ERROR] Git user.name is "!GIT_USER!", expected "teeyouhao"!
    exit /b 1
)

if not "!GIT_EMAIL!"=="yhtee2007@gmail.com" (
    echo [ERROR] Git user.email is "!GIT_EMAIL!", expected "yhtee2007@gmail.com"!
    exit /b 1
)
echo [PASS] Git identity verified: !GIT_USER! ^<!GIT_EMAIL!^>

:: 2. BUG-002 Verification: Viewport Overflow Guard
echo [2/4] Checking Viewport Zero-Overflow Rule in CSS (BUG-002)...
findstr /i "overflow-x: hidden" src\index.css >nul
if errorlevel 1 (
    echo [ERROR] src\index.css missing "overflow-x: hidden" guard!
    exit /b 1
)
echo [PASS] Viewport horizontal overflow protection verified in CSS.

:: 3. Server Compilation Verification
echo [3/4] Compiling Server TypeScript...
call npm --prefix server run build
if errorlevel 1 (
    echo [ERROR] Server TypeScript compilation failed!
    exit /b 1
)
echo [PASS] Server build succeeded.

:: 4. Client Bundle & Typecheck Verification
echo [4/4] Building Client Production Bundle (tsc + vite)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Client build failed!
    exit /b 1
)
echo [PASS] Client build succeeded.

echo ============================================================
echo   VERIFICATION COMPLETE: ALL GATES PASSED (exit code 0)
echo ============================================================
exit /b 0
