@echo off
setlocal

for %%P in (5173 8000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%I /F >nul 2>&1
  )
)

echo Atlas local services stopped (ports 5173 and 8000).
endlocal
