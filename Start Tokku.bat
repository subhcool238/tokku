@echo off
rem Double click to start Tokku on the desktop. Close him from the tray icon near the clock: "Turn Tokku off".
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
