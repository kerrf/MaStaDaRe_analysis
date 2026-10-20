"""
The catalogs of the MaStR bulk export: into codes.py, and as JSON onto the website.

The export writes the values of many fields as numbers: EinheitBetriebsstatus 35, ArtDerSolaranlage 853. Katalogwerte.xml
says what each number means ("In Betrieb", "Gebäudesolaranlage") and Katalogkategorien.xml which catalog it belongs to,
but which column uses which catalog the export says nowhere: codes.py knows it, matched column by column against the
SOAP API, whose answers carry the meaning instead of the number (verify_codes.py). A few columns count by lists of their
own files (Einheitentypen, Lokationstypen, Marktfunktionen, Marktrollen).

This copies all of them into codes.py, between its markers (KATALOG and the lists), and writes them with the columns
that use them as frontend/public/daten/mastr-katalogwerte.json, which the website offers for download (Datenqualität,
Allgemein). For a new export: set db_migrate.EXPORT_DIR to it, then (no arguments)

    cd backend
    uv run python -m app.etl.katalog

and check the changes of codes.py with git diff: a catalog value that changed its text changes the raw tables' texts
too (decode_codes.py turns only codes into texts, not old texts into new ones).
"""

import json
import re
from logging import getLogger
from pathlib import Path

from app import codes
from app.etl.db_migrate import EXPORT_DIR, EXPORT_FILES
from app.etl.extract import read_units
from app.services.logger import setup_logging

logger = getLogger(__name__)

CODES_PY = Path(codes.__file__)
WEBSITE_JSON = Path(__file__).resolve().parents[3] / "frontend" / "public" / "daten" / "mastr-katalogwerte.json"
BEGIN = "# ------------------------------------------------ catalogs of the export: written by app/etl/katalog.py, not by hand"
END = "# ------------------------------------------------ end of the catalogs of the export"
# The lists of their own files: the name of their constant in codes.py
LISTS = {
    "Einheitentypen": "EINHEITENTYPEN",
    "Lokationstypen": "LOKATIONSTYPEN",
    "Marktfunktionen": "MARKTFUNKTIONEN",
    "Marktrollen": "MARKTROLLEN",
}


def read_entries(file: Path, text_field: str = "Wert") -> list[tuple[int, str, dict[str, str]]]:
    """(Id, text, the entry's other fields) of every entry of one of the export's catalog files (UTF-16 XML)."""
    entries = []
    for fields in read_units(file):
        # Six texts of Katalogwerte.xml end in a space ("Windkraft an Land "): without it
        entries.append((int(fields.pop("Id")), (fields.pop(text_field) or "").strip(), fields))
    return sorted(entries)


def read_catalogs(export: Path) -> tuple[dict[int, tuple[str, dict[int, str]]], dict[str, dict[int, str]]]:
    """KATALOG (catalog -> its name and {code: text}) and the lists of their own files ({file: {code: text}})."""
    names = {code: name for code, name, _ in read_entries(export / "Katalogkategorien.xml", "Name")}
    katalog = {code: (name, {}) for code, name in names.items()}
    for code, text, fields in read_entries(export / "Katalogwerte.xml"):
        katalog[int(fields["KatalogKategorieId"])][1][code] = text
    lists = {file: {code: text for code, text, _ in read_entries(export / f"{file}.xml")} for file in LISTS}
    return katalog, lists


def quoted(text: str) -> str:
    """A Python string literal in double quotes, like the rest of the code (JSON's escapes are Python's too)."""
    return json.dumps(text, ensure_ascii=False)


def python_block(export: str, katalog: dict[int, tuple[str, dict[int, str]]], lists: dict[str, dict[int, str]]) -> str:
    """The catalogs as the code between the markers of codes.py."""
    lines = [
        BEGIN,
        f"# From {export}: Katalogkategorien.xml and Katalogwerte.xml as KATALOG (catalog -> its name and",
        "# its values, {code: text}; a code is unique across all catalogs), and the lists of their own files.",
        "# fmt: off",
        f'KATALOG_EXPORT = "{export}"',
        "",
        "KATALOG = {",
    ]
    for kategorie, (name, values) in katalog.items():
        if not values:  # five catalogs without values (Bilanzierungsgebiet, WindTyp, …)
            lines.append(f"    {kategorie}: ({quoted(name)}, {{}}),")
            continue
        lines.append(f"    {kategorie}: ({quoted(name)}, {{")
        lines += [f"        {code}: {quoted(text)}," for code, text in values.items()]
        lines.append("    }),")
    lines.append("}")
    for file, constant in LISTS.items():
        lines += ["", f"# {file}.xml", f"{constant} = {{"]
        lines += [f"    {code}: {quoted(text)}," for code, text in lists[file].items()]
        lines.append("}")
    lines += ["# fmt: on", END]
    return "\n".join(lines) + "\n"


def write_codes_py(block: str) -> None:
    """Replace the catalogs between the markers of codes.py (or add them at its end)."""
    source = CODES_PY.read_text(encoding="utf-8")
    between = re.compile(rf"^{re.escape(BEGIN)}\n.*?^{re.escape(END)}\n", flags=re.DOTALL | re.MULTILINE)
    found = between.search(source)
    source = between.sub(lambda _: block, source) if found else source.rstrip("\n") + "\n\n\n" + block
    CODES_PY.write_text(source, encoding="utf-8")


def columns_of(katalog: dict[int, tuple[str, dict[int, str]]]) -> dict[str, dict[str, dict]]:
    """Per file of the export, the columns that hold codes: the catalogs their codes come from (or the list of their
    own file), and whether a cell holds several of them."""
    catalog_of = {code: kategorie for kategorie, (_, values) in katalog.items() for code in values}
    files = {}
    for table, spec in codes.TABLE_SPECS.items():
        columns = {}
        for column, api_values in spec.columns.items():
            if column in spec.texts:
                use = {"liste": spec.texts[column]}
            else:
                use = {"kataloge": sorted({catalog_of[code] for code in api_values if code in catalog_of})}
            if column in spec.multi:
                use["mehrere"] = True
            columns[column] = use
        files[EXPORT_FILES[table]] = columns
    return dict(sorted(files.items()))


def website_json(export: str, katalog: dict[int, tuple[str, dict[int, str]]], lists: dict[str, dict[int, str]]) -> dict:
    return {
        "quelle": (
            f"Marktstammdatenregister der Bundesnetzagentur, Gesamtdatenexport {export}: Katalogkategorien.xml, "
            f"Katalogwerte.xml, {', '.join(f'{file}.xml' for file in LISTS)}"
        ),
        "lizenz": "Datenlizenz Deutschland – Namensnennung – 2.0 (https://www.govdata.de/dl-de/by-2-0)",
        "aufbereitet": "mastr-data.de",
        "hinweise": [
            "Der Gesamtdatenexport führt viele Felder als Zahl (EinheitBetriebsstatus 35). Was die Zahl bedeutet, steht in "
            "„kataloge“ (aus Katalogwerte.xml) oder in „listen“ (aus den Dateien gleichen Namens).",
            "Welche Spalte welchen Katalog nutzt, sagt der Export nicht. „spalten“ nennt es je Datei: abgeglichen mit dem "
            "Webdienst des Registers (SOAP-API), der statt der Zahl ihre Bedeutung liefert.",
            "„mehrere“: die Zelle führt mehrere Zahlen, durch Kommas getrennt (z. B. „813, 3186“).",
            "Sechs Texte enden in Katalogwerte.xml mit einem Leerzeichen; hier ohne.",
        ],
        "spalten": columns_of(katalog),
        "kataloge": [
            {"id": kategorie, "name": name, "werte": {str(code): text for code, text in values.items()}}
            for kategorie, (name, values) in katalog.items()
        ],
        "listen": {file: {str(code): text for code, text in values.items()} for file, values in lists.items()},
    }


if __name__ == "__main__":
    setup_logging()
    katalog, lists = read_catalogs(EXPORT_DIR)
    export = EXPORT_DIR.name
    write_codes_py(python_block(export, katalog, lists))
    WEBSITE_JSON.parent.mkdir(parents=True, exist_ok=True)
    WEBSITE_JSON.write_text(
        json.dumps(website_json(export, katalog, lists), ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    values = sum(len(v) for _, v in katalog.values())
    logger.info(
        f"{len(katalog)} catalogs with {values:,} values and {len(lists)} lists of {export} written into {CODES_PY.name} "
        f"and {WEBSITE_JSON.relative_to(WEBSITE_JSON.parents[2])}"
    )
