@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install || goto :fail
)
echo Starting GestureVoice AI at http://localhost:5173
call npm run dev -- --open
goto :eof
:fail
echo Install failed. Check that Node.js 18+ is installed.
pause
