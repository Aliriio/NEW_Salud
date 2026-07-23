#!/usr/bin/env python3
"""Lectura mínima de XLSX clínicos sin dependencias externas.

El módulo solo interpreta la estructura Open XML necesaria para leer valores.
No modifica el libro ni intenta corregir su contenido.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator
from xml.etree import ElementTree as ET
from zipfile import ZipFile
import re


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"x": MAIN_NS, "r": DOC_REL_NS, "p": PKG_REL_NS}
CELL_REF = re.compile(r"^([A-Z]+)(\d+)$")


def column_number(reference: str) -> int:
    """Convierte la columna de una referencia A1 a un índice basado en cero."""
    match = CELL_REF.match(reference)
    if not match:
        raise ValueError(f"Referencia de celda no reconocida: {reference}")
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def _all_text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return "".join(text.text or "" for text in node.findall(".//x:t", NS))


@dataclass(frozen=True)
class Sheet:
    name: str
    path: str


class ClinicalWorkbook:
    """Acceso de solo lectura a filas y celdas del libro clínico."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._archive = ZipFile(self.path)
        self._shared_strings = self._read_shared_strings()
        self.sheets = self._read_sheets()

    def close(self) -> None:
        self._archive.close()

    def __enter__(self) -> "ClinicalWorkbook":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _xml(self, member: str) -> ET.Element:
        return ET.fromstring(self._archive.read(member))

    def _read_shared_strings(self) -> list[str]:
        try:
            root = self._xml("xl/sharedStrings.xml")
        except KeyError:
            return []
        return [_all_text(item) for item in root.findall("x:si", NS)]

    def _read_sheets(self) -> tuple[Sheet, ...]:
        workbook = self._xml("xl/workbook.xml")
        relationships = self._xml("xl/_rels/workbook.xml.rels")
        targets = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in relationships.findall("p:Relationship", NS)
        }
        sheets: list[Sheet] = []
        for node in workbook.findall("x:sheets/x:sheet", NS):
            relationship_id = node.attrib[f"{{{DOC_REL_NS}}}id"]
            target = targets[relationship_id].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            sheets.append(Sheet(node.attrib["name"], target))
        return tuple(sheets)

    def sheet(self, name: str) -> Sheet:
        try:
            return next(sheet for sheet in self.sheets if sheet.name == name)
        except StopIteration as error:
            raise KeyError(f"No existe la hoja {name!r}") from error

    def rows(self, name: str) -> Iterator[list[str]]:
        root = self._xml(self.sheet(name).path)
        for row in root.findall(".//x:sheetData/x:row", NS):
            values: dict[int, str] = {}
            for cell in row.findall("x:c", NS):
                index = column_number(cell.attrib["r"])
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    value = _all_text(cell.find("x:is", NS))
                else:
                    raw = cell.findtext("x:v", default="", namespaces=NS)
                    if cell_type == "s" and raw:
                        value = self._shared_strings[int(raw)]
                    elif cell_type == "b":
                        value = "Sí" if raw == "1" else "No"
                    else:
                        value = raw
                values[index] = value.strip()
            if not values:
                yield []
                continue
            yield [values.get(index, "") for index in range(max(values) + 1)]

    def nonempty_rows(self, name: str) -> Iterator[tuple[int, list[str]]]:
        for number, row in enumerate(self.rows(name), start=1):
            if any(value for value in row):
                yield number, row
