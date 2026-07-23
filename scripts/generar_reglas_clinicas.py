#!/usr/bin/env python3
"""Genera la configuración clínica navegable desde el XLSX autorizado.

La extracción conserva literalmente el contenido clínico del libro. Las
decisiones de estructura (identificadores, tipos de control y relaciones)
quedan visibles en este archivo y se validan con el auditor y las pruebas.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import unicodedata

from clinical_workbook import ClinicalWorkbook


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = ROOT / "documents" / "Campos_Nota_Enfermeria.xlsx"
DEFAULT_OUTPUT = ROOT / "public" / "js" / "clinical-rules.js"
SOURCE_SHA256 = "6d45de79d248f9902d0db9592bb18721704cfcda2383de2213ffd0b3f8d23b47"


SCALE_META = [
    ("glasgow", "Glasgow", 3, 15, 1, "3–15"),
    ("eva-nrs", "EVA / NRS", 0, 10, 1, "0–10"),
    ("braden", "Braden", 6, 23, 1, "6–23"),
    ("norton", "Norton", 5, 20, 1, "5–20"),
    ("emina", "EMINA", 0, 15, 1, "0–15"),
    ("barthel", "Barthel", 0, 100, 1, "0–100"),
    ("morse", "Morse", 0, 125, 1, "0–125"),
    ("downton", "Downton", 0, 11, 1, "0–11"),
    ("tinetti", "Tinetti", 0, 28, 1, "0–28"),
    ("fovea-godet", "Fóvea / Godet", 0, 4, 1, "0–4+"),
    ("ramsay", "Ramsay", 1, 6, 1, "1–6"),
    ("rass", "RASS", -5, 4, 1, "−5 a +4"),
    ("silverman-anderson", "Silverman-Anderson", 0, 10, 1, "0–10"),
    ("aldrete", "Aldrete", 0, 10, 1, "0–10"),
    ("curb-65", "CURB-65", 0, 5, 1, "0–5"),
    ("nihss", "NIHSS", 0, 42, 1, "0–42"),
    ("pfeiffer", "Pfeiffer", 0, 10, 1, "0–10"),
    ("isaac", "Test de Isaac", None, None, 1, "Puntaje clínico"),
    ("wagner", "Wagner", 0, 5, 1, "0–5"),
    ("maddox", "Maddox", 0, 4, 1, "0–4"),
    ("vip", "VIP", 0, 5, 1, "0–5"),
    ("push", "PUSH", 0, 17, 1, "0–17"),
    ("daniels", "Daniels", 0, 5, 1, "0–5"),
    ("imc", "IMC", 0, None, 0.1, "kg/m²"),
    ("nrs-2002", "NRS-2002", 0, 7, 1, "0–7"),
    ("mna", "MNA", 0, 30, 0.5, "0–30"),
    ("borg", "Borg", 0, 10, 0.5, "0–10"),
    ("apgar", "APGAR", 0, 10, 1, "0–10"),
]


PARAMETER_GROUPS = {
    "Catéter venoso periférico (CVP)": ["Catéter venoso periférico (CVP)"],
    "Catéter de línea media (Midline)": ["Catéter de línea media (Midline)"],
    "CVC (yugular/subclavia/femoral) · PICC · Port-a-cath": [
        "Catéter venoso central (CVC) – yugular interna",
        "Catéter venoso central (CVC) – subclavia",
        "Catéter venoso central (CVC) – femoral",
        "PICC (catéter central de inserción periférica)",
        "Port-a-cath (reservorio subcutáneo)",
    ],
    "Catéter arterial (línea arterial)": ["Catéter arterial (línea arterial)"],
    "Catéter de Swan-Ganz (arteria pulmonar)": ["Catéter de Swan-Ganz (arteria pulmonar)"],
    "Catéter de diálisis / hemodiálisis": ["Catéter de diálisis / hemodiálisis"],
    "Tubo orotraqueal (TOT) · Tubo nasotraqueal (TNT)": [
        "Tubo orotraqueal (TOT) – intubación orotraqueal",
        "Tubo nasotraqueal (TNT) – intubación nasotraqueal",
    ],
    "Traqueostomía (TQT)": ["Traqueostomía (TQT)"],
    "Cánula de Guedel": ["Cánula de Guedel"],
    "Cánula nasal de oxígeno": ["Cánula nasal de oxígeno"],
    "Mascarilla simple de oxígeno": ["Mascarilla simple de oxígeno"],
    "Mascarilla con reservorio (no reinhalación)": ["Mascarilla con reservorio (no reinhalación)"],
    "Mascarilla Venturi": ["Mascarilla Venturi"],
    "Cánula de alto flujo (OAF/Optiflow)": ["Cánula de alto flujo (OAF/Optiflow)"],
    "Interfaz de VMNI (máscara facial/nasal CPAP/BiPAP)": [
        "Interfaz de VMNI (máscara facial/nasal CPAP/BiPAP)"
    ],
    "Balón autoinflable de reanimación manual (AMBÚ)": [
        "Balón autoinflable de reanimación manual (AMBÚ)"
    ],
    "Sonda nasogástrica (SNG) · Sonda orogástrica (SOG) · Sonda nasoenteral (SNE)": [
        "Sonda nasogástrica (SNG)",
        "Sonda orogástrica (SOG)",
        "Sonda nasoenteral (SNE) / nasoyeyunal",
    ],
    "Sonda de gastrostomía (PEG/quirúrgica) · Sonda de yeyunostomía · Gastrostomía (G-tube)": [
        "Sonda de gastrostomía (PEG / quirúrgica)",
        "Sonda de yeyunostomía",
        "Gastrostomía (G-tube)",
    ],
    "Sonda de Sengstaken-Blakemore": ["Sonda de Sengstaken-Blakemore"],
    "Sonda vesical (Foley) – sondeo permanente": ["Sonda vesical (Foley) – sondeo permanente"],
    "Catéter suprapúbico · Nefrostomía percutánea · Ureterostomía": [
        "Catéter suprapúbico",
        "Nefrostomía percutánea",
        "Ureterostomía",
    ],
    "Drenaje de Jackson-Pratt · Drenaje de Blake · Drenaje de Penrose · Drenaje abdominal": [
        "Drenaje de Jackson-Pratt",
        "Drenaje de Blake",
        "Drenaje de Penrose",
        "Drenaje abdominal (peritoneal / biliar)",
    ],
    "Drenaje torácico / toracotubo (pleural)": ["Drenaje torácico / toracotubo (pleural)"],
    "Drenaje pericárdico": ["Drenaje pericárdico"],
    "Drenaje ventricular externo (DVE)": ["Drenaje ventricular externo (DVE)"],
    "Colostomía · Ileostomía · Urostomía / nefrostomía": [
        "Colostomía",
        "Ileostomía",
        "Urostomía / nefrostomía",
    ],
    "Monitor de presión intracraneal (PIC)": ["Monitor de presión intracraneal (PIC)"],
    "Balón de contrapulsación intraaórtico (BCIA)": ["Balón de contrapulsación intraaórtico (BCIA)"],
    "Marcapasos transitorio": ["Marcapasos transitorio"],
    "Marcapasos definitivo (implantado)": ["Marcapasos definitivo (implantado)"],
    "Sistema de nutrición parenteral total (NPT)": ["Sistema de nutrición parenteral total (NPT)"],
    "Bomba de infusión de medicamentos": ["Bomba de infusión de medicamentos"],
    "Sistema de analgesia controlada por el paciente (PCA)": [
        "Sistema de analgesia controlada por el paciente (PCA)"
    ],
}


SCOPE_DEVICES = {
    "CVP": ["Catéter venoso periférico (CVP)"],
    "CVP / Midline": ["Catéter venoso periférico (CVP)", "Catéter de línea media (Midline)"],
    "CVC/PICC/Port-a-cath": PARAMETER_GROUPS["CVC (yugular/subclavia/femoral) · PICC · Port-a-cath"],
    "Catéter arterial": ["Catéter arterial (línea arterial)"],
    "Swan-Ganz": ["Catéter de Swan-Ganz (arteria pulmonar)"],
    "Catéter de diálisis": ["Catéter de diálisis / hemodiálisis"],
    "TOT/TNT": PARAMETER_GROUPS["Tubo orotraqueal (TOT) · Tubo nasotraqueal (TNT)"],
    "TQT": ["Traqueostomía (TQT)"],
    "Guedel": ["Cánula de Guedel"],
    "SNG/SOG/SNE": PARAMETER_GROUPS[
        "Sonda nasogástrica (SNG) · Sonda orogástrica (SOG) · Sonda nasoenteral (SNE)"
    ],
    "PEG/Yeyunostomía/G-tube": PARAMETER_GROUPS[
        "Sonda de gastrostomía (PEG/quirúrgica) · Sonda de yeyunostomía · Gastrostomía (G-tube)"
    ],
    "Sengstaken-Blakemore": ["Sonda de Sengstaken-Blakemore"],
    "Foley/Suprapúbico/Nefrostomía": [
        "Sonda vesical (Foley) – sondeo permanente",
        "Catéter suprapúbico",
        "Nefrostomía percutánea",
    ],
    "Foley": ["Sonda vesical (Foley) – sondeo permanente"],
    "JP/Blake/Penrose/Abdominal": PARAMETER_GROUPS[
        "Drenaje de Jackson-Pratt · Drenaje de Blake · Drenaje de Penrose · Drenaje abdominal"
    ],
    "Toracotubo": ["Drenaje torácico / toracotubo (pleural)"],
    "Drenaje pericárdico": ["Drenaje pericárdico"],
    "DVE": ["Drenaje ventricular externo (DVE)"],
    "Colostomía/Ileostomía/Urostomía": [
        "Colostomía",
        "Ileostomía",
        "Urostomía / nefrostomía",
    ],
    "PIC": ["Monitor de presión intracraneal (PIC)"],
    "BCIA": ["Balón de contrapulsación intraaórtico (BCIA)"],
    "Marcapasos": ["Marcapasos transitorio", "Marcapasos definitivo (implantado)"],
    "NPT": ["Sistema de nutrición parenteral total (NPT)"],
    "Bomba de infusión": ["Bomba de infusión de medicamentos"],
    "PCA": ["Sistema de analgesia controlada por el paciente (PCA)"],
    "Cánula/mascarilla de O₂": [
        "Cánula nasal de oxígeno",
        "Mascarilla simple de oxígeno",
        "Mascarilla con reservorio (no reinhalación)",
        "Mascarilla Venturi",
    ],
    "Mascarilla con reservorio": ["Mascarilla con reservorio (no reinhalación)"],
    "Cánula de alto flujo": ["Cánula de alto flujo (OAF/Optiflow)"],
    "Interfaz de VMNI": ["Interfaz de VMNI (máscara facial/nasal CPAP/BiPAP)"],
    "AMBÚ": ["Balón autoinflable de reanimación manual (AMBÚ)"],
}


def slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def trim_numbering(value: str) -> str:
    return re.sub(r"^\s*\d+\.\s*", "", value).strip()


def value(row: list[str], index: int) -> str:
    return row[index] if index < len(row) else ""


def extract_scales(workbook: ClinicalWorkbook) -> list[dict]:
    rows = list(workbook.nonempty_rows("Regla_Escalas-ValorSignificado"))
    headers: list[tuple[int, str]] = []
    for index, (_number, row) in enumerate(rows):
        if value(row, 1):
            continue
        next_row = rows[index + 1][1] if index + 1 < len(rows) else []
        if value(next_row, 1) and (
            value(row, 0).startswith(("Escala", "Índice", "Test"))
        ):
            headers.append((index, value(row, 0)))
    if len(headers) != len(SCALE_META):
        raise ValueError(f"Se esperaban 28 escalas y se encontraron {len(headers)}.")

    definitions: list[dict] = []
    for position, ((start, name), meta) in enumerate(zip(headers, SCALE_META)):
        end = headers[position + 1][0] if position + 1 < len(headers) else len(rows)
        mappings = []
        for _number, row in rows[start + 1:end]:
            score, meaning = value(row, 0), value(row, 1)
            if not score or not meaning:
                continue
            mappings.append({"score": score, "meaning": meaning})
        scale_id, short, minimum, maximum, step, display = meta
        definitions.append({
            "id": scale_id,
            "name": name,
            "short": short,
            "min": minimum,
            "max": maximum,
            "step": step,
            "display": display,
            "captureMode": "manual" if scale_id == "isaac" else "bidirectional",
            "mappings": mappings,
        })
    return definitions


def extract_reference_range(workbook: ClinicalWorkbook, start_heading: str, end_heading: str) -> list[str]:
    rows = list(workbook.nonempty_rows("Listas de Referencia"))
    start = next(index for index, (_number, row) in enumerate(rows) if value(row, 0) == start_heading)
    end = next(index for index, (_number, row) in enumerate(rows[start + 1:], start + 1)
               if value(row, 0) == end_heading)
    return [value(row, 0) for _number, row in rows[start + 1:end] if value(row, 0)]


def extract_statuses(workbook: ClinicalWorkbook, devices: list[str]) -> dict[str, list[dict]]:
    device_set = set(devices)
    result: dict[str, list[dict]] = {}
    for _number, row in workbook.nonempty_rows("Regla_EstadosPorDispositivo"):
        name = value(row, 0)
        if name not in device_set or not value(row, 1):
            continue
        statuses = [trim_numbering(line) for line in value(row, 1).splitlines() if trim_numbering(line)]
        result[name] = [
            {"id": f"{slug(name)}--{slug(status)}", "label": status}
            for status in statuses
        ]
    missing = device_set.difference(result)
    if missing:
        raise ValueError(f"Faltan estados específicos para: {sorted(missing)}")
    return result


def field(label: str, field_id: str, field_type: str = "text", **extra: object) -> dict:
    result = {"id": field_id, "label": label, "type": field_type, "required": True}
    result.update(extra)
    return result


def fields_for(source: str) -> list[dict]:
    templates: dict[str, list[dict]] = {
        "Catéter venoso periférico (CVP)": [
            field("Escala de flebitis", "escalaFlebitis", "select", options=["Maddox", "VIP"]),
            field("Grado de flebitis", "gradoFlebitis", "number", min=0, max=5, step=1,
                  maxBy={"field": "escalaFlebitis", "values": {"Maddox": 4, "VIP": 5}}),
            field("Fecha de inserción", "fechaInsercion", "date"),
        ],
        "Catéter de línea media (Midline)": [
            field("Escala de flebitis", "escalaFlebitis", "select", options=["Maddox", "VIP"]),
            field("Grado de flebitis", "gradoFlebitis", "number", min=0, max=5, step=1,
                  maxBy={"field": "escalaFlebitis", "values": {"Maddox": 4, "VIP": 5}}),
            field("Fecha de inserción", "fechaInsercion", "date"),
        ],
        "CVC (yugular/subclavia/femoral) · PICC · Port-a-cath": [
            field("Aspecto del sitio de inserción", "aspectoInsercion"),
            field("Fecha de inserción", "fechaInsercion", "date"),
            field("Número de lúmenes en uso", "lumenesEnUso", "number", min=0, step=1),
        ],
        "Catéter arterial (línea arterial)": [
            field("Presión sistólica invasiva", "presionSistolica", "number", unit="mmHg"),
            field("Presión diastólica invasiva", "presionDiastolica", "number", unit="mmHg"),
            field("Presión arterial media invasiva", "presionMedia", "number", unit="mmHg"),
            field("Calidad de la curva de presión", "calidadCurva"),
        ],
        "Catéter de Swan-Ganz (arteria pulmonar)": [
            field("Presión de arteria pulmonar (PAP)", "pap", "number", unit="mmHg"),
            field("Presión capilar pulmonar (PCP/wedge)", "pcp", "number", unit="mmHg"),
            field("Gasto cardíaco", "gastoCardiaco", "number", unit="L/min", allowNotApplicable=True),
        ],
        "Catéter de diálisis / hemodiálisis": [
            field("Permeabilidad de cada lumen", "permeabilidadLumenes"),
            field("Sello con anticoagulante y tipo", "selloAnticoagulante"),
        ],
        "Tubo orotraqueal (TOT) · Tubo nasotraqueal (TNT)": [
            field("Presión del balón (cuff)", "presionCuff", "number", unit="cmH₂O"),
            field("Marca de fijación", "marcaFijacion", "number", unit="cm"),
        ],
        "Traqueostomía (TQT)": [
            field("Presión del balón (cuff)", "presionCuff", "number", unit="cmH₂O", allowNotApplicable=True),
            field("Tipo y calibre de cánula", "tipoCalibre"),
            field("Aspecto del estoma", "aspectoEstoma"),
        ],
        "Cánula de Guedel": [
            field("Tamaño de la cánula", "tamanoCanula"),
            field("Tolerancia del paciente", "tolerancia"),
        ],
        "Cánula nasal de oxígeno": [field("Flujo administrado", "flujo", "select", unit="L/min", options=["1", "2", "3", "4", "5", "6"], linkedRespiratory="flujo")],
        "Mascarilla simple de oxígeno": [field("Flujo administrado", "flujo", "select", unit="L/min", options=["5", "6", "7", "8"], linkedRespiratory="flujo")],
        "Mascarilla con reservorio (no reinhalación)": [field("Flujo administrado", "flujo", "select", unit="L/min", options=["10", "11", "12", "13", "14", "15"], linkedRespiratory="flujo")],
        "Mascarilla Venturi": [field("FiO₂ programado", "fio2", "select", unit="%", options=["24", "28", "31", "35", "40", "50", "60"], linkedRespiratory="fio2")],
        "Cánula de alto flujo (OAF/Optiflow)": [
            field("FiO₂ administrado", "fio2", "number", unit="%", min=21, max=100, linkedRespiratory="fio2"),
            field("Flujo administrado", "flujo", "number", unit="L/min", min=10, max=60, linkedRespiratory="flujo"),
        ],
        "Interfaz de VMNI (máscara facial/nasal CPAP/BiPAP)": [
            field("Presión CPAP", "cpap", "number", unit="cmH₂O", min=4, max=20, allowNotApplicable=True, linkedRespiratory="cpap"),
            field("IPAP", "ipap", "number", unit="cmH₂O", allowNotApplicable=True, linkedRespiratory="ipap"),
            field("EPAP", "epap", "number", unit="cmH₂O", allowNotApplicable=True, linkedRespiratory="epap"),
            field("Tolerancia y ajuste de la interfaz", "ajusteInterfaz"),
        ],
        "Balón autoinflable de reanimación manual (AMBÚ)": [
            field("Disponibilidad y funcionamiento en cabecera", "disponibilidadFuncionamiento"),
        ],
        "Sonda nasogástrica (SNG) · Sonda orogástrica (SOG) · Sonda nasoenteral (SNE)": [
            field("Marca de fijación externa", "marcaFijacion", "number", unit="cm"),
            field("Residuo gástrico", "residuoGastrico", "number", unit="mL", allowNotApplicable=True),
        ],
        "Sonda de gastrostomía (PEG/quirúrgica) · Sonda de yeyunostomía · Gastrostomía (G-tube)": [
            field("Aspecto del estoma", "aspectoEstoma"),
            field("Volumen del balón de fijación interno", "volumenBalon", "number", unit="mL", allowNotApplicable=True),
        ],
        "Sonda de Sengstaken-Blakemore": [
            field("Presión del balón gástrico", "presionBalonGastrico", "number", unit="mmHg"),
            field("Presión del balón esofágico", "presionBalonEsofagico", "number", unit="mmHg"),
            field("Tracción aplicada", "traccion", unit="gramos o unidad de tracción"),
        ],
        "Sonda vesical (Foley) – sondeo permanente": [
            field("Diuresis horaria o por turno", "diuresis", "number", unit="mL/hora o mL/turno"),
            field("Volumen del balón de fijación", "volumenBalon", "number", unit="mL"),
        ],
        "Catéter suprapúbico · Nefrostomía percutánea · Ureterostomía": [
            field("Diuresis por turno", "diuresis", "number", unit="mL/turno"),
            field("Aspecto de la orina drenada", "aspectoOrina"),
        ],
        "Drenaje de Jackson-Pratt · Drenaje de Blake · Drenaje de Penrose · Drenaje abdominal": [
            field("Débito del drenaje", "debito", "number", unit="mL/turno"),
            field("Aspecto o características del contenido", "aspectoContenido"),
        ],
        "Drenaje torácico / toracotubo (pleural)": [
            field("Débito", "debito", "number", unit="mL/turno"),
            field("Presencia de fluctuación", "fluctuacion", "boolean"),
            field("Presencia de fuga de aire (burbujeo)", "fugaAire", "boolean"),
            field("Sello de agua o succión aplicada", "succion", "number", unit="cmH₂O", allowNotApplicable=True),
        ],
        "Drenaje pericárdico": [
            field("Débito del drenaje", "debito", "number", unit="mL/turno"),
            field("Aspecto del contenido", "aspectoContenido"),
        ],
        "Drenaje ventricular externo (DVE)": [
            field("Débito de LCR", "debitoLcr", "number", unit="mL/hora o mL/turno"),
            field("Nivel del sistema respecto al conducto auditivo externo", "nivelSistema", "number", unit="cm"),
            field("Presión de apertura", "presionApertura", "number", unit="mmHg o cmH₂O", allowNotApplicable=True),
        ],
        "Colostomía · Ileostomía · Urostomía / nefrostomía": [
            field("Débito de la ostomía", "debito", unit="mL/turno o descripción"),
            field("Características del contenido", "caracteristicasContenido"),
        ],
        "Monitor de presión intracraneal (PIC)": [
            field("Presión intracraneal (PIC)", "pic", "number", unit="mmHg"),
            field("Presión de perfusión cerebral (PPC)", "ppc", "number", unit="mmHg", allowNotApplicable=True),
        ],
        "Balón de contrapulsación intraaórtico (BCIA)": [
            field("Relación de asistencia", "relacionAsistencia"),
            field("Presión diastólica aumentada", "presionDiastolicaAumentada", "number", unit="mmHg"),
            field("Perfusión del miembro de inserción", "perfusionDistal"),
        ],
        "Marcapasos transitorio": [
            field("Frecuencia programada", "frecuencia", "number", unit="lpm"),
            field("Umbral de captura", "umbralCaptura", "number", unit="mA"),
            field("Sensibilidad", "sensibilidad", "number", unit="mV"),
            field("Modo de estimulación", "modo"),
            field("Carga de batería", "bateria", "number", unit="%", min=0, max=100),
        ],
        "Marcapasos definitivo (implantado)": [
            field("Frecuencia programada", "frecuencia", "number", unit="lpm", allowNotApplicable=True),
            field("Modo", "modo", allowNotApplicable=True),
            field("Captura verificada en ECG", "capturaEcg", "boolean"),
        ],
        "Sistema de nutrición parenteral total (NPT)": [
            field("Velocidad de infusión", "velocidad", "number", unit="mL/hora"),
            field("Volumen infundido en el turno", "volumen", "number", unit="mL/turno"),
            field("Control glicémico", "glicemia", "number", unit="mg/dL"),
        ],
        "Bomba de infusión de medicamentos": [
            field("Medicamentos o líneas en curso", "infusiones", "repeatable", fields=[
                field("Medicamento o línea", "medicamento"),
                field("Velocidad programada", "velocidad", "number", unit="mL/hora"),
                field("Volumen infundido", "volumen", "number", unit="mL"),
            ]),
        ],
        "Sistema de analgesia controlada por el paciente (PCA)": [
            field("Bolos solicitados", "bolosSolicitados", "number", min=0, step=1),
            field("Bolos entregados", "bolosEntregados", "number", min=0, step=1),
            field("Dosis de bolo programada", "dosisBolo", unit="mg o mcg"),
            field("Intervalo de bloqueo (lockout)", "lockout", "number", unit="minutos"),
        ],
    }
    if source not in templates:
        raise KeyError(f"No hay estructura de parámetros para {source}")
    return templates[source]


def extract_parameters(workbook: ClinicalWorkbook, devices: list[str]) -> dict[str, dict]:
    rows_by_source = {}
    for _number, row in workbook.nonempty_rows("Regla_ParametroPorDispositivo"):
        source = value(row, 0)
        if source in PARAMETER_GROUPS and value(row, 1):
            rows_by_source[source] = {
                "sourceParameter": value(row, 1),
                "sourceFormat": value(row, 2),
                "frequency": value(row, 3),
                "fields": fields_for(source),
            }
    result = {}
    for source, names in PARAMETER_GROUPS.items():
        if source not in rows_by_source:
            raise ValueError(f"No se encontró la fila de parámetros {source}")
        for name in names:
            result[name] = rows_by_source[source]
    missing = set(devices).difference(result)
    if missing:
        raise ValueError(f"Faltan parámetros para {sorted(missing)}")
    return result


def respiratory_rules() -> list[dict]:
    airway = [
        "Tubo orotraqueal (TOT) – intubación orotraqueal",
        "Tubo nasotraqueal (TNT) – intubación nasotraqueal",
        "Traqueostomía (TQT)",
    ]
    ventilation = [
        field("FiO₂", "fio2", "number", unit="%", min=21, max=100),
        field("PEEP", "peep", "number", unit="cmH₂O"),
        field("Volumen corriente o presión soporte (según modo)", "volumenOPresion"),
    ]
    return [
        {"state": "Ventilando espontáneamente sin soporte", "fields": []},
        {"state": "Con soporte de O₂ – cánula nasal (especificar litros/min)", "autoDevice": "Cánula nasal de oxígeno",
         "fields": [field("Litros por minuto", "flujo", "select", unit="L/min", options=["1", "2", "3", "4", "5", "6"])]},
        {"state": "Con soporte de O₂ – mascarilla simple", "autoDevice": "Mascarilla simple de oxígeno",
         "fields": [field("Litros por minuto", "flujo", "select", unit="L/min", options=["5", "6", "7", "8"])]},
        {"state": "Con soporte de O₂ – mascarilla con reservorio", "autoDevice": "Mascarilla con reservorio (no reinhalación)",
         "fields": [field("Litros por minuto", "flujo", "select", unit="L/min", options=["10", "11", "12", "13", "14", "15"])]},
        {"state": "Con soporte de O₂ – Venturi (especificar FiO₂)", "autoDevice": "Mascarilla Venturi",
         "fields": [field("FiO₂", "fio2", "select", unit="%", options=["24", "28", "31", "35", "40", "50", "60"])]},
        {"state": "Oxigenoterapia de alto flujo (OAF / Optiflow)", "autoDevice": "Cánula de alto flujo (OAF/Optiflow)",
         "fields": [field("FiO₂", "fio2", "number", unit="%", min=21, max=100),
                    field("Flujo", "flujo", "number", unit="L/min", min=10, max=60)]},
        {"state": "Ventilación mecánica no invasiva – CPAP", "autoDevice": "Interfaz de VMNI (máscara facial/nasal CPAP/BiPAP)",
         "fields": [field("Presión CPAP", "cpap", "number", unit="cmH₂O", min=4, max=20)]},
        {"state": "Ventilación mecánica no invasiva – BiPAP", "autoDevice": "Interfaz de VMNI (máscara facial/nasal CPAP/BiPAP)",
         "fields": [field("IPAP", "ipap", "number", unit="cmH₂O"), field("EPAP", "epap", "number", unit="cmH₂O")]},
        {"state": "Ventilación mecánica invasiva – modo controlado por volumen (VCV)",
         "requiresOneOf": airway, "fields": ventilation},
        {"state": "Ventilación mecánica invasiva – modo controlado por presión (PCV)",
         "requiresOneOf": airway, "fields": ventilation},
        {"state": "Ventilación mecánica invasiva – modo SIMV",
         "requiresOneOf": airway, "fields": ventilation},
        {"state": "Ventilación mecánica invasiva – modo PSV (soporte de presión)",
         "requiresOneOf": airway, "fields": ventilation},
        {"state": "Destete / weaning ventilatorio en progreso", "requiresOneOf": airway, "fields": []},
        {"state": "Traqueostomía con collar de traqueostomía", "autoDevice": "Traqueostomía (TQT)",
         "fields": [field("FiO₂", "fio2", "select", unit="%", options=["28", "35", "40", "50", "60", "100"])]},
        {"state": "Traqueostomía en VMI", "autoDevice": "Traqueostomía (TQT)", "fields": ventilation},
    ]


def tokens(value_: str) -> set[str]:
    ignored = {
        "de", "del", "la", "el", "en", "por", "un", "una", "o", "y", "con",
        "al", "los", "las", "para", "se", "sitio", "presente", "activa", "activo",
    }
    return {token for token in normalize(value_).split() if len(token) > 2 and token not in ignored}


STATUS_EQUIVALENTS = {
    "flebitis grado i ii": ("flebitis grado i", "flebitis grado ii"),
    "flebitis grado iii iv": ("flebitis grado iii", "flebitis grado iv"),
    "uno o ambos lumenes obstruidos": ("un lumen obstruido", "ambos lumenes obstruidos"),
    "salida accidental": ("salida accidental", "retirada no programada", "extubacion no programada"),
    "fuga perimeatal peri sitio": ("fuga de orina perimeatal", "fuga peri sitio"),
    "fijacion comprometida": ("fijacion comprometida", "fijacion sutura comprometida"),
    "migracion desplazamiento confirmado": ("migracion desplazamiento confirmado", "desplazamiento confirmado", "migracion del cateter"),
    "alarma activa del equipo consola": ("alarma activa", "consola con alarma activa"),
    "salida accidental desconexion no programada": ("salida accidental", "desconexion accidental", "decanulacion no programada", "extubacion no programada"),
}


def explicit_status_match(row_number: int, candidate: str) -> bool | None:
    """Resuelve abreviaturas deliberadas de la hoja a estados completos.

    El resultado queda materializado como IDs en clinical-rules.js; esta
    comparación no se ejecuta en el navegador.
    """
    text = normalize(candidate)
    if row_number == 6:
        return bool(re.search(r"\bflebitis grado (?:ii|i)\b", text))
    if row_number == 23:
        return "lumen obstruido" in text or "lumenes obstruidos" in text
    if row_number == 52:
        return "fuga de orina" in text
    if row_number == 58:
        return "salida accidental durante" in text
    if row_number == 103:
        return "sangrado" in text
    if row_number == 104:
        return (
            ("desplazamiento confirmado" in text or "migracion desplazamiento confirmado" in text
             or "migracion del cateter" in text or "desplazado migrado" in text)
            and "riesgo" not in text and "sospechado" not in text
        )
    if row_number == 105:
        return "fijacion" in text and "comprometida" in text
    if row_number == 106:
        return "alarma" in text
    if row_number == 107:
        return (
            "salida accidental" in text or "desconexion" in text
            or "decanulacion no programada" in text or "extubacion no programada" in text
        ) and "riesgo" not in text
    return None


def score_status(rule_status: str, candidate: str) -> float:
    rule_norm = normalize(rule_status)
    candidate_norm = normalize(candidate)
    if rule_norm in candidate_norm or candidate_norm in rule_norm:
        return 10 + min(len(rule_norm), len(candidate_norm)) / 1000
    aliases = STATUS_EQUIVALENTS.get(rule_norm, ())
    if any(alias in candidate_norm for alias in aliases):
        return 9
    left, right = tokens(rule_status), tokens(candidate)
    if not left or not right:
        return 0
    overlap = len(left & right)
    return overlap / len(left) + overlap / len(right)


def extract_pending_rules(workbook: ClinicalWorkbook, devices: list[str],
                          statuses: dict[str, list[dict]]) -> list[dict]:
    rules = []
    all_names = set(devices)
    for row_number, row in workbook.nonempty_rows("Regla_EstadoMalo-Pendiente"):
        scope, abnormal, pending, priority = (value(row, index) for index in range(4))
        if priority not in {"Alta", "Media"}:
            continue
        if scope == "Cualquier dispositivo":
            scoped = devices
        elif scope == "Cualquier dispositivo con alarma":
            scoped = [name for name in devices if any("alarma" in normalize(item["label"]) for item in statuses[name])]
        else:
            scoped = SCOPE_DEVICES.get(scope, [])
        if not scoped or not set(scoped).issubset(all_names):
            raise ValueError(f"Ámbito de pendiente no resuelto en fila {row_number}: {scope}")

        associations = []
        for name in scoped:
            candidates = statuses[name]
            explicit = [
                candidate for candidate in candidates
                if explicit_status_match(row_number, candidate["label"]) is True
            ]
            if explicit_status_match(row_number, "") is not None:
                associations.extend(candidate["id"] for candidate in explicit)
                continue
            ranked = sorted(
                ((score_status(abnormal, candidate["label"]), candidate) for candidate in candidates),
                key=lambda pair: pair[0],
                reverse=True,
            )
            if not ranked or ranked[0][0] <= 0:
                continue
            threshold = max(0.72, ranked[0][0] - 0.15)
            associations.extend(candidate["id"] for score, candidate in ranked if score >= threshold)

        if not associations:
            raise ValueError(f"Estado de pendiente no resuelto en fila {row_number}: {scope} / {abnormal}")
        rules.append({
            "id": f"pending-{row_number}",
            "sourceRow": row_number,
            "scope": scope,
            "abnormalState": abnormal,
            "text": pending,
            "priority": priority,
            "statusIds": sorted(set(associations)),
        })
    if len(rules) != 90:
        raise ValueError(f"Se esperaban 90 pendientes y se extrajeron {len(rules)}.")
    return rules


def extract_flat_status_aliases(workbook: ClinicalWorkbook, statuses: dict[str, list[dict]]) -> list[str]:
    rows = list(workbook.nonempty_rows("Listas de Referencia"))
    start = next(index for index, (_number, row) in enumerate(rows)
                 if value(row, 0) == "ESTADO DEL DISPOSITIVO")
    end = next(index for index, (_number, row) in enumerate(rows[start + 1:], start + 1)
               if value(row, 0) == "ESTADO DENTAL")
    flat = [value(row, 0) for _number, row in rows[start + 1:end] if value(row, 0)]
    assigned = {normalize(item["label"]) for items in statuses.values() for item in items}
    return [item for item in flat if normalize(item) not in assigned]


def build_payload(path: Path) -> dict:
    with ClinicalWorkbook(path) as workbook:
        devices = extract_reference_range(
            workbook,
            "DISPOSITIVOS PRESENTES (selección múltiple)",
            "ESTADO DEL DISPOSITIVO",
        )
        statuses = extract_statuses(workbook, devices)
        parameters = extract_parameters(workbook, devices)
        device_defs = []
        for name in devices:
            device_defs.append({
                "id": slug(name),
                "name": name,
                **parameters[name],
                "statuses": statuses[name],
            })
        pending = extract_pending_rules(workbook, devices, statuses)
        return {
            "source": {
                "file": "Campos_Nota_Enfermeria.xlsx",
                "sha256": SOURCE_SHA256,
                "sheets": [sheet.name for sheet in workbook.sheets],
            },
            "scales": extract_scales(workbook),
            "neurologicalStates": [
                "Alerta y orientado en tiempo, lugar y persona",
                "Alerta con desorientación en tiempo",
                "Alerta con desorientación en tiempo y lugar",
                "Alerta con desorientación en las 3 esferas",
                "Somnoliento pero orientable al estímulo verbal",
                "Confuso / agitado",
                "Estuporoso (responde solo a estímulos intensos)",
                "Coma superficial – Glasgow 9–12",
                "Coma moderado – Glasgow 6–8",
                "Coma profundo – Glasgow < 6",
                "Sedoanalgesiado – escala Ramsay / RASS",
                "Afásico con comprensión conservada",
                "Afásico sin comprensión",
            ],
            "respiratory": respiratory_rules(),
            "devices": device_defs,
            "pendingRules": pending,
            "unassignedFlatStatusAliases": extract_flat_status_aliases(workbook, statuses),
            "educationRecipients": [
                "Paciente",
                "Familiar directo (cónyuge / padre / madre / hijo/a)",
                "Cuidador externo",
                "Paciente y familiar",
                "No fue posible brindar educación – paciente sin condiciones",
            ],
        }


JS_RUNTIME = r"""
    const normalize = (value) => String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
    const byId = (items) => new Map(items.map((item) => [item.id, item]));
    const scalesById = byId(DATA.scales);
    const devicesById = byId(DATA.devices);
    const devicesByName = new Map(DATA.devices.map((item) => [item.name, item]));
    const respiratoryByState = new Map(DATA.respiratory.map((item) => [item.state, item]));
    const pendingByStatus = new Map();
    DATA.pendingRules.forEach((rule) => rule.statusIds.forEach((statusId) => {
        if (!pendingByStatus.has(statusId)) pendingByStatus.set(statusId, []);
        pendingByStatus.get(statusId).push(rule);
    }));

    function parseScoreExpression(expression) {
        const text = String(expression || '').trim().replace(/−/g, '-').replace(/,/g, '.').replace(/[+]/g, '')
            .replace(/\s*\([^)]*\)\s*$/, '');
        let match = text.match(/^(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)$/);
        if (match) return { min: Number(match[1]), max: Number(match[2]), minInclusive: true, maxInclusive: true, exact: false };
        match = text.match(/^≥\s*(-?\d+(?:\.\d+)?)$/);
        if (match) return { min: Number(match[1]), max: Infinity, minInclusive: true, maxInclusive: true, exact: false };
        match = text.match(/^≤\s*(-?\d+(?:\.\d+)?)$/);
        if (match) return { min: -Infinity, max: Number(match[1]), minInclusive: true, maxInclusive: true, exact: false };
        match = text.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
        if (match) return { min: -Infinity, max: Number(match[1]), minInclusive: true, maxInclusive: false, exact: false };
        match = text.match(/^>\s*(-?\d+(?:\.\d+)?)$/);
        if (match) return { min: Number(match[1]), max: Infinity, minInclusive: false, maxInclusive: true, exact: false };
        if (/^-?\d+(?:\.\d+)?$/.test(text)) {
            const score = Number(text);
            return { min: score, max: score, minInclusive: true, maxInclusive: true, exact: true };
        }
        return null;
    }

    function getScale(scaleId) {
        return scalesById.get(scaleId) || DATA.scales.find((scale) => scale.name === scaleId || scale.short === scaleId) || null;
    }

    function resolveScaleMeaning(scaleId, score) {
        const scale = getScale(scaleId);
        if (!scale || scale.captureMode === 'manual' || score === '' || score === null || score === undefined) return null;
        const numeric = Number(String(score).replace(',', '.'));
        if (!Number.isFinite(numeric)) return null;
        const mapping = scale.mappings.find((entry) => {
            const range = parseScoreExpression(entry.score);
            return range
                && (range.minInclusive ? numeric >= range.min : numeric > range.min)
                && (range.maxInclusive ? numeric <= range.max : numeric < range.max);
        });
        return mapping ? { score: mapping.score, meaning: mapping.meaning } : null;
    }

    function resolveScaleSelection(scaleId, meaning) {
        const scale = getScale(scaleId);
        if (!scale || scale.captureMode === 'manual') return null;
        const mapping = scale.mappings.find((entry) => entry.meaning === meaning);
        if (!mapping) return null;
        const range = parseScoreExpression(mapping.score);
        return { score: range?.exact ? String(range.min) : '', range: mapping.score, meaning: mapping.meaning, exact: !!range?.exact };
    }

    const GLASGOW_RANGES = new Map([
        ['Alerta y orientado en tiempo, lugar y persona', [15, 15]],
        ['Alerta con desorientación en tiempo', [14, 14]],
        ['Alerta con desorientación en tiempo y lugar', [13, 14]],
        ['Alerta con desorientación en las 3 esferas', [13, 13]],
        ['Somnoliento pero orientable al estímulo verbal', [12, 13]],
        ['Confuso / agitado', [10, 13]],
        ['Estuporoso (responde solo a estímulos intensos)', [9, 10]],
        ['Coma superficial – Glasgow 9–12', [9, 12]],
        ['Coma moderado – Glasgow 6–8', [6, 8]],
        ['Coma profundo – Glasgow < 6', [3, 5]],
    ]);
    const APHASIA = new Set(['Afásico con comprensión conservada', 'Afásico sin comprensión']);
    const SEDATED = 'Sedoanalgesiado – escala Ramsay / RASS';

    function validateGlasgowNeuro({ score, range = '', noEvaluable = false, neurologicalState = '' } = {}) {
        if (noEvaluable) {
            return {
                valid: neurologicalState === SEDATED || !neurologicalState,
                forcedState: SEDATED,
                compatibleStates: [SEDATED],
                severity: 'suggestion',
                message: 'El paciente está sedado: registre también la escala Ramsay/RASS.',
                suggestedScales: ['ramsay', 'rass'],
            };
        }
        const numeric = Number(String(score).replace(',', '.'));
        const parsedRange = !Number.isFinite(numeric) || String(score).trim() === ''
            ? parseScoreExpression(range)
            : null;
        const lower = parsedRange ? parsedRange.min : numeric;
        const upper = parsedRange ? parsedRange.max : numeric;
        if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
            return { valid: false, forcedState: '', compatibleStates: [], severity: 'error', message: 'Ingrese un puntaje de Glasgow válido.' };
        }
        if (APHASIA.has(neurologicalState)) {
            return {
                valid: lower >= 3 && upper <= 15,
                forcedState: '',
                compatibleStates: [neurologicalState],
                severity: 'information',
                message: 'La afasia puede coexistir con cualquier puntaje; verifique que el componente verbal refleje la afasia.',
            };
        }
        const compatibleStates = [...GLASGOW_RANGES]
            .filter(([, limits]) => upper >= limits[0] && lower <= limits[1])
            .map(([state]) => state);
        let forcedState = '';
        if (lower === 15 && upper === 15) forcedState = 'Alerta y orientado en tiempo, lugar y persona';
        else if ((!parsedRange && numeric >= 6 && numeric <= 8) || (parsedRange && lower === 6 && upper === 8)) {
            forcedState = 'Coma moderado – Glasgow 6–8';
        } else if ((!parsedRange && numeric >= 3 && numeric <= 5) || (parsedRange && lower === 3 && upper === 5)) {
            forcedState = 'Coma profundo – Glasgow < 6';
        }
        const valid = lower >= 3 && upper <= 15
            && (!neurologicalState || compatibleStates.includes(neurologicalState));
        return {
            valid,
            forcedState,
            compatibleStates,
            severity: valid ? (parsedRange ? 'information' : 'none') : 'error',
            message: valid ? '' : `El estado neurológico no es congruente con Glasgow ${range || score}.`,
        };
    }

    function getRespiratoryRequirement(state) {
        const rule = respiratoryByState.get(state);
        return rule ? JSON.parse(JSON.stringify(rule)) : null;
    }

    function getDevice(deviceOrName) {
        return devicesById.get(deviceOrName) || devicesByName.get(deviceOrName) || null;
    }

    function validateParameterValue(definition, value, context = {}) {
        if (!definition) return { valid: false, code: 'unknown', min: null, max: null };
        const empty = value === undefined || value === null || String(value).trim() === '';
        const conditionalMax = definition.maxBy?.values?.[context?.[definition.maxBy.field]];
        const min = definition.min ?? null;
        const max = conditionalMax ?? definition.max ?? null;
        if (value === 'No aplica') {
            return {
                valid: definition.allowNotApplicable === true,
                code: definition.allowNotApplicable === true ? '' : 'not-applicable-forbidden',
                min,
                max,
            };
        }
        if (empty) {
            return { valid: definition.required === false, code: 'required', min, max };
        }
        if (definition.type === 'repeatable') {
            const valid = Array.isArray(value) && value.length > 0
                && value.every((entry) => definition.fields.every((field) => validateParameterValue(field, entry, entry).valid));
            return { valid, code: valid ? '' : 'repeatable-incomplete', min, max };
        }
        if (definition.type === 'number') {
            const numeric = Number(String(value).replace(',', '.'));
            const valid = Number.isFinite(numeric)
                && (min === null || numeric >= min)
                && (max === null || numeric <= max);
            return { valid, code: valid ? '' : 'out-of-range', min, max };
        }
        if (definition.type === 'select') {
            const valid = (definition.options || []).includes(String(value));
            return { valid, code: valid ? '' : 'invalid-option', min, max };
        }
        if (definition.type === 'boolean') {
            const valid = ['Sí', 'No'].includes(String(value));
            return { valid, code: valid ? '' : 'invalid-boolean', min, max };
        }
        if (definition.type === 'date') {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
            let valid = false;
            if (match) {
                const year = Number(match[1]);
                const month = Number(match[2]);
                const day = Number(match[3]);
                const date = new Date(Date.UTC(year, month - 1, day));
                valid = date.getUTCFullYear() === year
                    && date.getUTCMonth() === month - 1
                    && date.getUTCDate() === day;
            }
            return { valid, code: valid ? '' : 'invalid-date', min, max };
        }
        return { valid: true, code: '', min, max };
    }

    function getGeneratedPendings(deviceOrName, statusOrId) {
        const device = getDevice(deviceOrName);
        if (!device) return [];
        const status = device.statuses.find((item) => item.id === statusOrId || item.label === statusOrId);
        if (!status) return [];
        return (pendingByStatus.get(status.id) || []).map((rule) => ({
            id: `${device.id}--${rule.id}`,
            ruleId: rule.id,
            deviceId: device.id,
            statusId: status.id,
            text: rule.text,
            priority: rule.priority,
            sourceRow: rule.sourceRow,
        }));
    }

    function validateEducation(entries = []) {
        const issues = [];
        const recipientOf = (entry) => entry.recipient ?? entry.destinatario ?? '';
        const topicOf = (entry) => entry.topic ?? entry.tema ?? '';
        const standaloneOf = (entry) => entry.standaloneNoCompanion ?? entry.sinAcompananteAutonomo ?? false;
        const noCompanionOf = (entry) => entry.noCompanion ?? entry.sinAcompanante ?? false;
        const positivePatient = entries.some((entry) => recipientOf(entry) === 'Paciente' && String(topicOf(entry)).trim());
        const withoutConditions = entries.some((entry) => recipientOf(entry) === 'No fue posible brindar educación – paciente sin condiciones');
        const standaloneNoCompanion = entries.some(standaloneOf);
        if (positivePatient && withoutConditions) {
            issues.push({ type: 'error', code: 'patient-condition-conflict', message: 'No puede registrarse educación al paciente y “paciente sin condiciones” en la misma nota.' });
        }
        if (standaloneNoCompanion && entries.some((entry) => !standaloneOf(entry))) {
            issues.push({ type: 'error', code: 'standalone-no-companion-conflict', message: '“Sin acompañante” usado de forma autónoma no puede combinarse con otros registros de educación.' });
        }
        entries.filter(noCompanionOf).forEach((entry) => {
            if (recipientOf(entry) !== 'Paciente') {
                issues.push({ type: 'error', code: 'no-companion-recipient', entryId: entry.id, message: 'El atributo “Sin acompañante” solo puede marcarse en una entrada de Paciente.' });
            }
        });
        const combined = entries.filter((entry) => recipientOf(entry) === 'Paciente y familiar' && topicOf(entry));
        combined.forEach((entry) => {
            const duplicate = entries.find((other) => other.id !== entry.id
                && ['Paciente', 'Familiar directo (cónyuge / padre / madre / hijo/a)'].includes(recipientOf(other))
                && normalize(topicOf(other)) === normalize(topicOf(entry)));
            if (duplicate) {
                issues.push({ type: 'warning', code: 'duplicate-combined-topic', entryId: entry.id, message: 'El mismo tema aparece en “Paciente y familiar” y en una entrada individual.' });
            }
        });
        return issues;
    }

    return Object.freeze({
        source: DATA.source,
        scales: DATA.scales,
        devices: DATA.devices,
        respiratory: DATA.respiratory,
        pendingRules: DATA.pendingRules,
        neurologicalStates: DATA.neurologicalStates,
        educationRecipients: DATA.educationRecipients,
        unassignedFlatStatusAliases: DATA.unassignedFlatStatusAliases,
        getScale,
        getDevice,
        resolveScaleMeaning,
        resolveScaleSelection,
        validateGlasgowNeuro,
        getRespiratoryRequirement,
        validateParameterValue,
        getGeneratedPendings,
        validateEducation,
    });
"""


def render_javascript(payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"""/* Archivo generado desde documents/Campos_Nota_Enfermeria.xlsx.
   Fuente clínica vigente: SHA-256 {SOURCE_SHA256}.
   No editar contenido clínico aquí: ejecute scripts/generar_reglas_clinicas.py. */
(function (root, factory) {{
    'use strict';
    const api = factory();
    if (root) root.CareFlowClinical = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
}})(typeof window !== 'undefined' ? window : globalThis, function () {{
    'use strict';
    const DATA = {data};
{JS_RUNTIME}
}});
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", nargs="?", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    payload = build_payload(args.xlsx)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_javascript(payload), encoding="utf-8")
    print(f"Configuración clínica generada: {args.output}")
    print(f"- Escalas: {len(payload['scales'])}")
    print(f"- Dispositivos: {len(payload['devices'])}")
    print(f"- Asociaciones dispositivo-estado: {sum(len(item['statuses']) for item in payload['devices'])}")
    print(f"- Reglas de pendientes: {len(payload['pendingRules'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
