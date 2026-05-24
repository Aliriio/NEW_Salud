@echo off
echo Actualizando datos-pai.js desde data.js...
cd /d "%~dp0"
python -c "from pathlib import Path; import re; t=Path('data.js').read_text(encoding='utf-8'); t2=re.sub(r'^export const datosProPai\s*=\s*', 'window.datosProPai = ', t); Path('datos-pai.js').write_text(t2, encoding='utf-8'); print('Listo.')"
pause
