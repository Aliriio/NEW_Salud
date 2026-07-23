#!/usr/bin/env python3
"""Audita que la configuración clínica versionada corresponda al XLSX vigente."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

from clinical_workbook import ClinicalWorkbook
from generar_reglas_clinicas import build_payload, render_javascript


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = ROOT / "documents" / "Campos_Nota_Enfermeria.xlsx"
EXPECTED_SHA256 = "6d45de79d248f9902d0db9592bb18721704cfcda2383de2213ffd0b3f8d23b47"
EXPECTED_SHEETS = (
    "Campos Nota Enfermería",
    "Listas de Referencia",
    "Regla_Escalas-ValorSignificado",
    "Regla_Glasgow-Neurologico",
    "Regla_Respiratorio-Dispositivo",
    "Regla_ParametroPorDispositivo",
    "Regla_EstadosPorDispositivo",
    "Regla_EstadoMalo-Pendiente",
    "Regla_Educacion-Incongruencias",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def dump_workbook(path: Path) -> None:
    with ClinicalWorkbook(path) as workbook:
        payload = {
            sheet.name: [
                {"row": number, "values": row}
                for number, row in workbook.nonempty_rows(sheet.name)
            ]
            for sheet in workbook.sheets
        }
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def audit(path: Path) -> int:
    errors: list[str] = []
    actual_hash = sha256(path)
    if actual_hash != EXPECTED_SHA256:
        errors.append(f"Hash inesperado: {actual_hash}")

    with ClinicalWorkbook(path) as workbook:
        names = tuple(sheet.name for sheet in workbook.sheets)
        if names != EXPECTED_SHEETS:
            errors.append("Las hojas o su orden no corresponden a la fuente vigente.")
        counts = {
            sheet.name: sum(1 for _ in workbook.nonempty_rows(sheet.name))
            for sheet in workbook.sheets
        }

    try:
        payload = build_payload(path)
        extracted_counts = {
            "escalas": len(payload["scales"]),
            "dispositivos": len(payload["devices"]),
            "estados": sum(len(device["statuses"]) for device in payload["devices"]),
            "pendientes": len(payload["pendingRules"]),
            "alias_sin_asignar": len(payload["unassignedFlatStatusAliases"]),
        }
        expected_counts = {
            "escalas": 28,
            "dispositivos": 49,
            "estados": 382,
            "pendientes": 90,
            "alias_sin_asignar": 11,
        }
        if extracted_counts != expected_counts:
            errors.append(
                f"Inventario extraído inesperado: {extracted_counts}; esperado: {expected_counts}"
            )
        generated = render_javascript(payload)
        for shipped in (ROOT / "public/js/clinical-rules.js", ROOT / "docs/js/clinical-rules.js"):
            if not shipped.exists():
                errors.append(f"Falta la configuración generada: {shipped.relative_to(ROOT)}")
            elif shipped.read_text(encoding="utf-8") != generated:
                errors.append(
                    f"{shipped.relative_to(ROOT)} no corresponde exactamente al XLSX; regenere la configuración."
                )
    except (KeyError, ValueError) as error:
        errors.append(f"No fue posible extraer la configuración clínica: {error}")

    if errors:
        print("Auditoría clínica: ERROR")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Auditoría clínica: fuente XLSX vigente verificada")
    print(f"- SHA-256: {actual_hash}")
    print(f"- Hojas: {len(EXPECTED_SHEETS)}")
    print(
        "- Inventario: "
        f"{extracted_counts['escalas']} escalas, "
        f"{extracted_counts['dispositivos']} dispositivos, "
        f"{extracted_counts['estados']} estados, "
        f"{extracted_counts['pendientes']} pendientes"
    )
    for name in EXPECTED_SHEETS:
        print(f"- {name}: {counts[name]} filas con contenido")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", nargs="?", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--dump", action="store_true", help="Imprime todas las celdas con contenido como JSON.")
    args = parser.parse_args()
    if args.dump:
        dump_workbook(args.xlsx)
        return 0
    return audit(args.xlsx)


if __name__ == "__main__":
    raise SystemExit(main())
