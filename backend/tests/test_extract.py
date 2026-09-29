"""extract.to_chunks: an export file becomes CSV for COPY."""

import csv
import io

from app.etl.extract import to_chunks

EXPORT_FILE = """<?xml version="1.0" encoding="UTF-16"?><EinheitenWind>\
<EinheitWind><EinheitMastrNummer>SEE1</EinheitMastrNummer><DatumLetzteAktualisierung>2026-09-26T00:29:04.6945768</DatumLetzteAktualisierung>\
<Gemeindeschluessel>01001000</Gemeindeschluessel></EinheitWind>\
<EinheitWind><EinheitMastrNummer>SEE2</EinheitMastrNummer><DatumLetzteAktualisierung>2022-12-01T07:52:10.18</DatumLetzteAktualisierung>\
<Adresszusatz>Zeile 1&#13;&#10;Zeile 2</Adresszusatz></EinheitWind>\
</EinheitenWind>"""


def test_export_file_to_csv(tmp_path):
    xml_file = tmp_path / "EinheitenWind.xml"
    xml_file.write_bytes(EXPORT_FILE.encode("utf-16"))

    chunks = to_chunks(xml_file)
    rows = [dict(zip(chunk.columns, row)) for chunk in chunks for row in csv.reader(io.StringIO(chunk.csv.decode()))]

    assert [row["EinheitMastrNummer"] for row in rows] == ["SEE1", "SEE2"]
    # 7 fractional digits are cut to 6, the way the API does it (Postgres would round)
    assert rows[0]["DatumLetzteAktualisierung"] == "2026-09-26T00:29:04.694576"
    assert rows[1]["DatumLetzteAktualisierung"] == "2022-12-01T07:52:10.18"
    assert rows[0]["Gemeindeschluessel"] == "01001000"  # stays text, leading zero included
    assert rows[1]["Adresszusatz"] == "Zeile 1\r\nZeile 2"
    assert chunks[-1].columns[-1] == "Adresszusatz"  # a new field extends the columns
