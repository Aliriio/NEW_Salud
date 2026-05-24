@echo off
echo Servidor local: http://localhost:8080
echo Abra index.html en el navegador desde esa direccion.
cd /d "%~dp0"
python -m http.server 8080
