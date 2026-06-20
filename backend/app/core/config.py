"""Constants"""

import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

RAW_DATA_PATH = Path(os.environ["RAW_DATA_PATH"])

RELEVANT_COLUMNS = [
    "EinheitMastrNummer",
    "DatumLetzteAktualisierung",
    "LokationMaStRNummer",
    "AnlagenbetreiberMastrNummer",
    "Land",
    "Bundesland",
    "Landkreis",
    "Gemeinde",
    "Postleitzahl",
    "Ort",
    "Registrierungsdatum",
    "Inbetriebnahmedatum",
    "EinheitBetriebsstatus",
    "NameStromerzeugungseinheit",
    "Energietraeger",
    "Bruttoleistung",
    "Nettonennleistung",
    "FernsteuerbarkeitNb",
    "Einspeisungsart",
    "AnzahlModule",
    "ArtDerSolaranlage",
    "Hauptausrichtung",
    "HauptausrichtungNeigungswinkel",
    "EegMaStRNummer",
]

top_cities = {
    'Berlin': (13.404954, 52.520008), 
    'Köln': (6.953101, 50.935173),
    'Düsseldorf': (6.782048, 51.227144),
    'Frankfurt am Main': (8.682127, 50.110924),
    'Hamburg': (9.993682, 53.551086),
    'Leipzig': (12.387772, 51.343479),
    'München': (11.576124, 48.137154),
    'Dortmund': (7.468554, 51.513400),
    'Stuttgart': (9.181332, 48.777128),
    'Nürnberg': (11.077438, 49.449820),
    'Hannover': (9.73322, 52.37052)
}