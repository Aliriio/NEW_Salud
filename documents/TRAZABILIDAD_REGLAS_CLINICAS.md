# Trazabilidad de reglas clínicas de la Nota de Entrega

## Fuente vigente

- Archivo: `Campos_Nota_Enfermeria.xlsx`
- SHA-256: `6d45de79d248f9902d0db9592bb18721704cfcda2383de2213ffd0b3f8d23b47`
- Autorización funcional: versión vigente entregada por el equipo de enfermería.
- Generación: `python3 scripts/generar_reglas_clinicas.py`
- Auditoría: `python3 scripts/auditar_reglas_clinicas.py`

La redacción clínica se extrae sin correcciones del Excel. Los identificadores,
tipos de control y relaciones técnicas se definen en el generador para conservar
datos estructurados y permitir que una futura corrección del libro sea auditable.

## Hojas utilizadas

| Hoja | Uso |
|---|---|
| `Campos Nota Enfermería` | Referencia funcional general del formulario. |
| `Listas de Referencia` | Catálogos de escalas, dispositivos y valores existentes. |
| `Regla_Escalas-ValorSignificado` | Puntaje/rango, significado y captura bidireccional de 28 escalas. |
| `Regla_Glasgow-Neurologico` | Congruencia y excepciones entre Glasgow y estado neurológico. |
| `Regla_Respiratorio-Dispositivo` | Parámetros respiratorios y vía/dispositivo requerido. |
| `Regla_ParametroPorDispositivo` | Campos, unidades, obligatoriedad y frecuencia por dispositivo. |
| `Regla_EstadosPorDispositivo` | Estados específicos de los 49 dispositivos. |
| `Regla_EstadoMalo-Pendiente` | 90 pendientes automáticos y prioridad. |
| `Regla_Educacion-Incongruencias` | Entradas repetibles, atributos e incompatibilidades. |

## Interpretaciones provisionales aplicadas

1. En Glasgow `9–13` se respeta el solapamiento documentado: se limita el
   estado a opciones compatibles, pero no se impone uno cuando hay varias.
2. MNA admite `0–30`; solo `0–14` completa significado porque el Excel no
   define categorías para el resto de la versión completa.
3. Los estados de la lista plana que no están asignados en la hoja de estados
   específicos se conservan como alias de auditoría y no aparecen en menús.
4. Los estados que parecen copiados entre dispositivos se conservan cuando la
   hoja los asigna expresamente.
5. Cada dispositivo conserva un único estado principal, coherente con el campo
   singular del Excel.
6. Una entrada de Paciente con el atributo `Sin acompañante` puede coexistir
   con otras entradas, según el ejemplo del libro. El uso autónomo de
   `Sin acompañante` es excluyente.
7. Los textos abreviados de la hoja de pendientes se resuelven durante la
   generación a identificadores explícitos de estados. En el navegador no se
   realizan coincidencias difusas.
8. Test de Isaac conserva puntaje y significado manuales; no se inventan
   límites ni categorías.

## Alcance técnico

La configuración no implementa backend, persistencia, búsqueda de pacientes,
autenticación, bloqueo concurrente ni sincronización. El estado clínico continúa
exclusivamente en memoria y participa en la versión confirmada local de la nota.
