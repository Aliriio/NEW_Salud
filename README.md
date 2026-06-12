# CareFlow — Plataforma de documentación asistida de enfermería

Plataforma web (SaaS clínico) para automatizar y agilizar la creación de notas de enfermería.
La enfermera ingresa información estructurada en campos guiados y CareFlow genera una nota
clínica organizada y lista para revisar, corregir y aprobar. Adaptación clínica y validación
operativa para la Fundación Santa Fe de Bogotá.

> CareFlow **no** reemplaza el criterio clínico ni toma decisiones médicas: la enfermera
> siempre revisa y aprueba la nota antes de usarla.

## 🧭 Flujo del producto

`index.html` (landing) → `login.html` → `dashboard.html` → módulo **Entrega** (`entrega.html`).

- **Entrega** — disponible (note app completo de entrega de turno).
- **Recibo de turno** y **Valoración** — “Próximamente”.

Acceso de demostración: usuario `demo@santafe.com` · contraseña `careflow2026`.
El dominio del correo activa el co-branding del cliente (ej. `@santafe.com` carga el logo de la institución en el header).

## 🏗️ Estructura del Proyecto

```
Demo_Fcsb/
├── public/                          # Archivos estáticos (fuente de desarrollo)
│   ├── index.html                   # Landing pública (hero + partículas + typewriter)
│   ├── login.html                   # Inicio de sesión institucional (demo)
│   ├── dashboard.html               # Home interno: selector de módulos + secciones
│   ├── entrega.html                 # Módulo Entrega = note app dentro del shell
│   ├── styles.css                   # Estilos del note app (intactos)
│   ├── css/
│   │   ├── tokens.css               # Design tokens de marca (compartidos)
│   │   └── careflow.css             # Shell, landing, login, dashboard + integración
│   ├── js/
│   │   ├── app.js                   # Lógica del note app (sin cambios)
│   │   ├── app-data.js              # Datos del PAI (áreas, diagnósticos, NIC, NOC, B6)
│   │   ├── particles.js             # Red de partículas interactiva (canvas)
│   │   ├── typewriter.js            # Efecto typewriter del eslogan
│   │   ├── landing.js               # Nav sticky, scroll-reveal, anclas
│   │   ├── auth.js                  # Login demo, sesión y guard de páginas
│   │   └── shell.js                 # Sidebar, cambio de vistas, logout
│   └── assets/                      # Logos (logo_fix.png, logo.png, logo-fcsb.png)
├── docs/                            # Copia desplegada por GitHub Pages (/docs)
├── data/                            # plan_cuidados_enfermeria.xlsx
├── scripts/                         # Scripts auxiliares (.bat / exportar_excel.py)
├── README.md
└── .git/
```

> **Despliegue:** GitHub Pages sirve la carpeta `docs/`. Editar siempre en `public/` y copiar a `docs/` antes de commitear.

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
