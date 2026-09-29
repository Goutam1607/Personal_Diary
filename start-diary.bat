@echo off
rem Opens "my little corner" in your browser. Keep this window open while you write.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing for the first time, one moment...
  call npm install
)
start "" http://localhost:5173/
call npx vite
