"""
Extract: read the MaStR bulk export (Gesamtdatenexport).

Every unit type comes as UTF-16 XML files (EinheitenSolar_1.xml, EinheitenSolar_2.xml, ... or just EinheitenWind.xml).
Each unit is one element, its fields are the children, and empty fields are simply left out.

The files are streamed with lxml and turned into CSV, the input format of Postgres COPY. Several files are parsed
in parallel, and memory stays flat no matter how big a file is.
"""

import csv
import io
import multiprocessing
import re
from collections.abc import Iterator
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from dataclasses import dataclass
from itertools import islice
from pathlib import Path

from lxml import etree

# Reading the export from a USB stick (~145 MB/s) keeps 3-4 parsers busy, more don't make it faster.
WORKERS = 4
# USB sticks are slow at small reads: a 16 MB buffer took the parsers from 93 to 127 MB/s.
READ_BUFFER = 16 * 1024 * 1024
# Timestamps come with 7 fractional digits. Python and Postgres keep 6, but Postgres rounds the 7th away where the
# API cuts it off, so a third of the units would be 1 µs off. Cut it here too: export and API then agree exactly.
TIMESTAMPS = ("DatumLetzteAktualisierung",)
MICROSECONDS = len("2026-09-26T00:29:04.694576")


@dataclass(frozen=True)
class Chunk:
    """Units with the same fields: CSV rows in the order of `columns`."""

    columns: tuple[str, ...]
    csv: bytes
    rows: int


def _extract_number(string: str):
    """Extracts number at the end of a string - needed for natural sorting"""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", string)]


def find_export_files(directory_path: Path, prefix: str) -> list[Path]:
    """All files of one unit type in natural order: EinheitenSolar_1.xml, _2, ..., _10 (or just EinheitenWind.xml)."""
    pattern = re.compile(rf"{re.escape(prefix)}(_\d+)?\.xml")
    files = [file for file in directory_path.iterdir() if pattern.fullmatch(file.name)]
    return sorted(files, key=lambda file: _extract_number(file.name))


def read_units(xml_file: Path) -> Iterator[dict[str, str | None]]:
    """Stream the units of one export file as {field: value}."""
    unit_tag = _unit_tag(xml_file)
    if unit_tag is None:  # a file without units
        return
    with open(xml_file, "rb", buffering=READ_BUFFER) as source:
        for _, unit in etree.iterparse(source, tag=unit_tag):
            yield {field.tag: field.text for field in unit}
            unit.clear()
            while unit.getprevious() is not None:  # free the units already read, or the tree keeps growing
                del unit.getparent()[0]


def _unit_tag(xml_file: Path) -> str | None:
    """Tag of the unit elements, i.e. the root's first child: EinheitSolar in <EinheitenSolar><EinheitSolar>..."""
    starts = etree.iterparse(xml_file, events=("start",))
    next(starts)  # the root
    first_unit = next(starts, None)
    return first_unit[1].tag if first_unit else None


class _ChunkWriter:
    """Writes units as CSV.

    Units only carry their non-empty fields. When a unit brings a field the current chunk has no column for,
    the chunk is closed and the next one gets the extended column list. That happens a few dozen times at the
    start of a file, then practically never.
    """

    def __init__(self):
        self.chunks: list[Chunk] = []
        self.columns: dict[str, None] = {}  # an ordered set
        self._start_chunk()

    def add(self, unit: dict[str, str | None]) -> None:
        if not unit.keys() <= self.columns.keys():
            self._close_chunk()
            self.columns |= dict.fromkeys(unit)
        self.writer.writerow([unit.get(column) for column in self.columns])  # missing field -> empty -> NULL
        self.rows += 1

    def finish(self) -> list[Chunk]:
        self._close_chunk()
        return self.chunks

    def _start_chunk(self) -> None:
        self.buffer = io.StringIO()
        self.writer = csv.writer(self.buffer, lineterminator="\n")
        self.rows = 0

    def _close_chunk(self) -> None:
        if self.rows:
            self.chunks.append(Chunk(tuple(self.columns), self.buffer.getvalue().encode(), self.rows))
            self._start_chunk()


def to_chunks(xml_file: Path) -> list[Chunk]:
    """One export file as CSV chunks, ready for COPY."""
    writer = _ChunkWriter()
    for unit in read_units(xml_file):
        for field in TIMESTAMPS:
            if field in unit:
                unit[field] = unit[field][:MICROSECONDS]
        writer.add(unit)
    return writer.finish()


def parse_files(xml_files: list[Path]) -> Iterator[tuple[Path, list[Chunk]]]:
    """Parse the files in parallel and yield (file, chunks) as soon as each one is done.

    Twice as many files as workers are in flight: every worker finds its next file waiting, and memory stays
    bounded even if the consumer is the slow part.
    The worker processes start fresh ("forkserver") instead of copying the caller, who holds an open database connection.
    """
    remaining = iter(xml_files)
    with ProcessPoolExecutor(WORKERS, mp_context=multiprocessing.get_context("forkserver")) as pool:
        running = {pool.submit(to_chunks, file): file for file in islice(remaining, 2 * WORKERS)}
        while running:
            done, _ = wait(running, return_when=FIRST_COMPLETED)
            for future in done:
                xml_file = running.pop(future)
                next_file = next(remaining, None)
                if next_file:
                    running[pool.submit(to_chunks, next_file)] = next_file
                yield xml_file, future.result()
