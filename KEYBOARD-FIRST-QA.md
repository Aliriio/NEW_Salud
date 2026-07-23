# Validación keyboard-first de CareFlow

Este documento completa la verificación automatizada con las pruebas humanas y de tecnologías asistivas que no deben simularse como si fueran evidencia clínica. Todos los casos usan datos sintéticos.

## Puertas automatizadas

```sh
npm install
npx playwright install chromium firefox webkit
npm run test:all
```

La suite valida los tres motores, las cuatro huellas de la nota clínica, la paridad `public/`/`docs/`, el modo Estándar inicial, el modo Ágil opcional, persistencia de la preferencia, escalas con pasos enteros y decimales, navegación direccional en confirmaciones, entrada inteligente, escritura directa global, comboboxes, fechas, PAE, transacciones, undo, revisión, portapapeles y 25 ciclos de componentes dinámicos.

El escenario experto mínimo se ejecuta sobre la UI real, sin inyector QA y sin mouse. Su línea base reproducible está en `tests/fixtures/keyboard-expert-baseline.json`: el refinamiento redujo de 5 a 0 las pulsaciones de `Tab` y de 7 a 5 las acciones de navegación (`Tab` + flechas), sin modificar las huellas clínicas.

El botón de escenarios solo existe con `?qa=1`. Es una herramienta para revisar la nota generada: hidrata estado sintético y no sustituye un recorrido real del formulario.

## Matriz manual obligatoria

Primaria:

- Windows hospitalario; Edge y Chrome actuales; teclado español.
- NVDA con Edge y Chrome; Firefox como compatibilidad adicional.
- Alto contraste de Windows y zoom real al 100 %, 125 %, 150 % y 200 %.
- 19″ 1280×1024, 21,5″/24″ 1920×1080 y 27″ 2560×1440, incluyendo escalado de Windows al 125 % y 150 %.
- Viewports CSS de laboratorio: 1280×900, 1920×940, 1536×752, 2560×1300, 2048×1056, 1707×880, 1280×627 y 960×470.

Secundaria:

- Safari y Chrome en macOS con VoiceOver y Full Keyboard Access activado.
- JAWS con Edge, si la institución dispone de licencia.
- iOS con VoiceOver y Android con TalkBack.
- 390×844 y 360×800, con teclado virtual abierto.
- Pegado real en el EHR, Word o sistema institucional de destino.

En cada combinación se comprueba: nombre y estado anunciados, foco visible, ausencia de estados dependientes solo del color, fondo inaccesible durante diálogos, retorno exacto de foco, flechas simples confinadas al campo, navegación secuencial y Shift + flechas nativo en Estándar, navegación espacial y Tab de dos niveles en Ágil, escritura directa con teclado español/AltGraph/composición y ausencia de apertura inesperada del teclado virtual al usar touch.

## Recorrido de usuario nuevo

Con máximo cinco minutos de introducción:

1. Completar un caso mínimo en el modo Estándar inicial mediante Tab, Shift + Tab, flechas internas, Enter y Escape, sin conocer `/` ni depender del modo Ágil.
2. Encontrar una opción, resolver una búsqueda sin resultados y corregir un borrador inválido.
3. Hacer una selección múltiple, quitarla, usar Deshacer y confirmarla.
4. Corregir una decisión previa que tenga dependencias; cancelar primero y confirmar después.
5. Revisar y copiar; editar posteriormente y reconocer que la copia quedó obsoleta.
6. Repetir con un caso típico y una tercera nota para medir aprendizaje.

Registrar mediana y P75 de tiempo, acciones no textuales, Tab, teclas sin efecto, retrocesos, pérdidas de foco, ayuda solicitada y SEQ por tarea.

## Recorrido de usuario experto

Después de diez notas de práctica o una prueba de competencia:

1. Completar casos mínimo, típico y denso sin mouse.
2. Activar el modo Ágil desde la ayuda y usar escritura directa, `/`, Shift + flechas, `Shift+Enter` y revisión con `Ctrl/⌘+Enter`.
3. Completar multiselecciones, eliminación segura y undo.
4. Ejecutar PAE directo con y sin EP, y la ruta inversa con cero, uno y varios resultados.
5. Crear, cancelar, editar y quitar NOC, NIC y B6 personalizados.
6. Corregir área, diagnóstico, NOC y ruta; regresar al punto de trabajo en un máximo de cuatro acciones.
7. Simular una interrupción, cambiar de etapa y regresar al control recordado.

## Medición sin información clínica

Antes de cada recorrido se ejecuta:

```js
window.CareFlowMetrics.reset();
```

Al finalizar se exporta únicamente en el laboratorio:

```js
window.CareFlowMetrics.snapshot();
```

El resultado permanece en memoria y solo contiene IDs de controles/etapas, modalidad, acción, resultado, transiciones, conteos y tiempos relativos. No se copian valores de campos ni se persisten métricas. La única entrada permitida en `localStorage` es `cf_keyboard_navigation_mode`, que guarda exclusivamente `standard` o `agile` como preferencia no clínica del dispositivo.

Objetivos:

| Métrica | Objetivo |
|---|---:|
| Éxito experto sin mouse | 100 % |
| Éxito nuevo al primer intento | ≥90 % sin ayuda |
| Tiempo experto frente al baseline | ≥30 % menor |
| Ventaja frente a mouse-only | ≥25 % |
| Acciones no textuales | ≥25 % menos |
| Pulsaciones de Tab | ≥40 % menos |
| Acciones obligatorias de mouse | 0 |
| Pérdidas de foco/contexto | 0 experto; P75 ≤1 nuevo |
| Recuperación de combo inválido | 1 Escape |
| Pérdida silenciosa o divergencia | 0 |
| Mejora entre primera y tercera nota | ≥20 % sin más errores |
| SEQ y confianza | Mediana ≥6/7 |

## Salida a producción

Se autoriza solo cuando no haya defectos P0/P1; todas las puertas automatizadas estén verdes; NVDA y VoiceOver completen los recorridos críticos; no existan fallos serios/críticos de accesibilidad; responsive, zoom, alto contraste y touch superen la matriz; la copia se valide en el destino institucional; y un piloto controlado de al menos una semana finalice sin pérdida de datos, errores clínicos atribuibles a interacción ni regresiones de foco.
