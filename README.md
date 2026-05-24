# Automatizador de Notas de Enfermería

Aplicación web para automatizar la generación de notas de enfermería según el Plan de Atención Integral (PAI) de la Fundación Clínica Santa Fe de Bogotá.

## 🏗️ Estructura del Proyecto

```
Demo_Fcsb/
├── public/                          # Archivos estáticos
│   ├── index.html                   # Página principal
│   ├── styles.css                   # Estilos CSS
│   └── assets/
│       ├── logo-fcsb.png           # Logo principal
│       └── logo.png                 # Logo alterno
├── src/                             # Código fuente
│   ├── app.js                       # Lógica principal de la aplicación
│   └── app-data.js                  # Datos del PAI (áreas, diagnósticos, NICs, NOCs)
├── data/                            # Archivos de datos
│   └── plan-cuidados_enfermeria.xlsx # Plan de cuidados Excel
├── scripts/                         # Scripts auxiliares
│   ├── actualizar-datos.bat         # Script para actualizar datos (Windows)
│   ├── iniciar.bat                  # Script para iniciar la aplicación (Windows)
│   └── exportar_excel.py            # Script Python para exportar datos
├── .gitignore                       # Archivos a ignorar en git
├── README.md                        # Este archivo
└── .git/                            # Repositorio git
```

## 🚀 Inicio Rápido

### En Windows
```bash
# Ejecutar desde scripts/
scripts\iniciar.bat
```

### En navegador
- Abre `public/index.html` en tu navegador web preferido
- O sirve los archivos con un servidor local

```bash
# Con Python 3
python -m http.server --directory public

# Con Node.js
npx http-server public
```

## 📋 Características

- ✅ Selección de área clínica (12 áreas disponibles)
- ✅ Diagnósticos de enfermería (NANDA)
- ✅ Intervenciones NIC (múltiple selección)
- ✅ Resultados esperados (NOC)
- ✅ Evaluación con escala B6
- ✅ Intervenciones transversales automáticas
- ✅ Generación automática de nota de enfermería
- ✅ Copiar nota al portapapeles

## 🔧 Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (ES5+)
- **Backend**: Python (para exportación de datos)
- **Datos**: JSON (embebido en app-data.js), Excel

## 📝 Uso

1. Selecciona el **área clínica** del paciente
2. Busca y selecciona el **diagnóstico de enfermería**
3. Selecciona una o varias **intervenciones NIC**
4. Elige el **resultado esperado (NOC)**
5. Indica el **nivel de evaluación B6**
6. Completa los datos del paciente (sexo, edad, servicio)
7. Copia la nota generada

## 🛠️ Scripts Disponibles

- `scripts/actualizar-datos.bat` - Actualiza los datos del PAI
- `scripts/iniciar.bat` - Abre la aplicación en el navegador por defecto
- `scripts/exportar_excel.py` - Exporta datos a Excel

## 📊 Datos

El archivo `data/plan-cuidados_enfermeria.xlsx` contiene:
- Áreas clínicas
- Diagnósticos NANDA
- Intervenciones NIC
- Resultados NOC
- Escalas B6 por NOC
- Intervenciones transversales

## 📄 Licencia

Uso interno - Fundación Clínica Santa Fe de Bogotá

## 👤 Autor

Desarrollado para la Fundación Clínica Santa Fe de Bogotá

---

**Última actualización**: 2026
