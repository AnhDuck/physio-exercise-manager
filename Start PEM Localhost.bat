@echo off
setlocal

set "PEM_PORT=8891"
set "PEM_URL=http://127.0.0.1:%PEM_PORT%/index.html"

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found on PATH.
  echo Install Python or start a static server another way, then open:
  echo %PEM_URL%
  pause
  exit /b 1
)

echo Starting PEM on %PEM_URL%
echo Leave the server window open while using PEM.
echo If the port is already in use, your existing PEM server may already be running.

start "PEM localhost server" /min python -m http.server %PEM_PORT% --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "%PEM_URL%"

endlocal
