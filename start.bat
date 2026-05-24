@echo off
echo Iniciando TCL 40 SE Optimizer...
npm install
start "" node server.js
timeout /t 2 /nobreak >nul
start http://localhost:3000