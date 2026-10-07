@echo off
rem =====================================================================
rem  SAGARDRISHTI development startup (Windows) - single-instance launcher
rem  Backend : 127.0.0.1:8000  (FastAPI/Uvicorn)
rem  Frontend: localhost:5173  (Vite, API base http://localhost:8000)
rem  Safe to re-run: healthy instances are reused, never duplicated.
rem  Convenience launcher only - modifies no code, env, CORS, or data.
rem =====================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 'py' not found on PATH. Install Python 3.11+ and retry.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 'npm' not found on PATH. Install Node.js 20+ and retry.
  exit /b 1
)
where curl.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 'curl.exe' not found. It ships with Windows 10+ - check PATH and retry.
  exit /b 1
)
if not exist "%~dp0backend\app\main.py" (
  echo [ERROR] backend\app\main.py not found. Run this script from the repo root.
  exit /b 1
)
if not exist "%~dp0frontend\package.json" (
  echo [ERROR] frontend\package.json not found. Run this script from the repo root.
  exit /b 1
)

set "BACKEND_OK=0"
set "FRONTEND_OK=0"

call :ensure_backend
call :ensure_frontend

echo.
echo [SAGARDRISHTI] Summary: backend ^(8000^) [!BACKEND_OK! = 1 healthy] / frontend ^(5173^) [!FRONTEND_OK! = 1 healthy].
echo [SAGARDRISHTI] Close the titled console windows to stop the services.
endlocal
exit /b 0

rem ................................................................
:port_pid
rem  %1 = port, sets PIDVAR to the LISTENING PID (empty if free).
set "PIDVAR="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%~1 "') do set "PIDVAR=%%a"
goto :eof

rem ................................................................
:ensure_backend
echo [SAGARDRISHTI] Checking backend on 127.0.0.1:8000 ...
call :probe_health http://127.0.0.1:8000/api/v1/health
if "!HCODE!"=="200" (
  if "!HSAGAR!"=="1" (
    echo [SAGARDRISHTI] Backend already running and healthy on 127.0.0.1:8000.
    echo [SAGARDRISHTI] Reusing existing backend instance.
    set "BACKEND_OK=1"
    goto :eof
  )
)
call :port_pid 8000
if "!PIDVAR!"=="" goto :backend_launch
echo [SAGARDRISHTI] Port 8000 is occupied by PID !PIDVAR!. Inspecting process ...
tasklist /FI "PID eq !PIDVAR!" 2>nul | findstr /I "python.exe" >nul
if errorlevel 1 goto :backend_unknown
wmic process where "ProcessId=!PIDVAR!" get CommandLine /value 2>nul | findstr /I "uvicorn" | findstr /I "app.main" >nul
if errorlevel 1 goto :backend_unknown
echo [SAGARDRISHTI] Stale SAGARDRISHTI backend detected ^(PID !PIDVAR!, unhealthy^). Terminating that PID only ...
taskkill /PID !PIDVAR! /F >nul 2>nul
set "FREED=0"
for /L %%i in (1,1,10) do (
  call :port_pid 8000
  if "!PIDVAR!"=="" (
    set "FREED=1"
    goto :backend_freed
  )
  timeout /t 1 /nobreak >nul
)
:backend_freed
if "!FREED!"=="0" (
  echo [SAGARDRISHTI] ERROR: PID still holds port 8000 after termination. Aborting backend startup.
  goto :eof
)
echo [SAGARDRISHTI] Port 8000 is free again. Starting a fresh backend ...
goto :backend_launch

:backend_unknown
echo [SAGARDRISHTI] ERROR: Port 8000 is occupied by another application.
echo [SAGARDRISHTI] Existing process was NOT terminated.
echo [SAGARDRISHTI] Close that application and run start-dev.bat again.
goto :eof

:backend_launch
echo [SAGARDRISHTI] Starting backend ^(FastAPI http://127.0.0.1:8000^) ...
start "SAGARDRISHTI backend :8000" /D .\backend cmd /k py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
for /L %%i in (1,1,15) do (
  call :probe_health http://127.0.0.1:8000/api/v1/health
  if "!HCODE!"=="200" (
    if "!HSAGAR!"=="1" (
      echo [SAGARDRISHTI] Backend healthy: http://127.0.0.1:8000/api/v1/health
      set "BACKEND_OK=1"
      goto :eof
    )
  )
  timeout /t 2 /nobreak >nul
)
echo [SAGARDRISHTI] ERROR: Backend did not become healthy - see the 'SAGARDRISHTI backend :8000' window for the traceback.
goto :eof

rem ................................................................
:ensure_frontend
echo [SAGARDRISHTI] Checking frontend on localhost:5173 ...
set "FCODE=000"
for /f %%c in ('curl.exe -s -o "%TEMP%\sagar_front.html" -w "%%{http_code}" http://localhost:5173/ 2^>nul') do set "FCODE=%%c"
set "FOURS=0"
if "!FCODE!"=="200" (
  findstr /C:"SAGARDRISHTI" "%TEMP%\sagar_front.html" >nul 2>nul
  if not errorlevel 1 set "FOURS=1"
)
del "%TEMP%\sagar_front.html" >nul 2>nul
if "!FOURS!"=="1" (
  echo [SAGARDRISHTI] Frontend already running and healthy on localhost:5173.
  echo [SAGARDRISHTI] Reusing existing frontend instance.
  set "FRONTEND_OK=1"
  goto :eof
)
call :port_pid 5173
if not "!PIDVAR!"=="" (
  echo [SAGARDRISHTI] ERROR: Port 5173 is occupied by another application.
  echo [SAGARDRISHTI] Existing process was NOT terminated.
  echo [SAGARDRISHTI] Close that application and run start-dev.bat again.
  goto :eof
)
echo [SAGARDRISHTI] Starting frontend ^(Vite http://localhost:5173^) ...
start "SAGARDRISHTI frontend :5173" /D .\frontend cmd /k npm run dev
for /L %%i in (1,1,15) do (
  set "WCODE=000"
  for /f %%c in ('curl.exe -s -o nul -w "%%{http_code}" http://localhost:5173/ 2^>nul') do set "WCODE=%%c"
  if "!WCODE!"=="200" (
    echo [SAGARDRISHTI] Frontend available: http://localhost:5173/
    set "FRONTEND_OK=1"
    goto :eof
  )
  timeout /t 2 /nobreak >nul
)
echo [SAGARDRISHTI] ERROR: Frontend did not become available - see the 'SAGARDRISHTI frontend :5173' window for output.
goto :eof

rem ................................................................
:probe_health
rem  %1 = health URL. Sets HCODE (http code) and HSAGAR (1 if SAGARDRISHTI body).
set "HCODE=000"
set "HSAGAR=0"
for /f %%c in ('curl.exe -s -o "%TEMP%\sagar_probe.json" -w "%%{http_code}" %~1 2^>nul') do set "HCODE=%%c"
if "!HCODE!"=="200" (
  findstr /C:"\"service\":\"SAGARDRISHTI\"" "%TEMP%\sagar_probe.json" >nul 2>nul
  if not errorlevel 1 set "HSAGAR=1"
)
del "%TEMP%\sagar_probe.json" >nul 2>nul
goto :eof
