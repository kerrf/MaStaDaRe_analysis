"""Constants"""

from dotenv import load_dotenv
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)

load_dotenv()


class Settings(BaseSettings):
    DATABASE_URL: str

    PRECALC_QUERIES: list[str] = [
        "aggregate_by_plz.sql",
        "aggregate_by_month.sql",
        "aggregate_by_operator_type.sql",
        "build_stf_solar.sql",
        "calculate_growth_rates.sql",
    ]

    API_PREFIX: str
    DEBUG: bool

    # Which settings of the website get used (app.routers.usage, DEPLOY.md "Nutzungszahlen"): counts without cookies or
    # any id, in a database of its own, written by a role that may only add rows (app.etl.usage_setup). Without the
    # database URL the endpoint answers 503 and the website sends nothing; USAGE_ENABLED=false switches it off at once.
    USAGE_ENABLED: bool = True
    USAGE_DATABASE_URL: str | None = None
    # Only for app.etl.usage_setup, which gives the role this password
    USAGE_DB_PASSWORD: str | None = None
    # The sites whose pages may send counts, comma-separated
    USAGE_ORIGINS: str = "https://www.mastr-data.de,https://mastr-data.de,http://localhost:5173,http://localhost:5174,http://localhost:4173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")


settings = Settings()

# Every connection looks up names in "geo", where PostGIS lives (ST_Centroid & co.). Set here, not on the database role:
# a role setting doesn't travel with a dump (deploy/push_db.sh), and the server's database never had it.
DB_CONNECT_ARGS = {"options": "-c search_path=geo"}

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
    "Berlin": (13.404954, 52.520008),
    "Köln": (6.953101, 50.935173),
    "Düsseldorf": (6.782048, 51.227144),
    "Frankfurt am Main": (8.682127, 50.110924),
    "Hamburg": (9.993682, 53.551086),
    "Leipzig": (12.387772, 51.343479),
    "München": (11.576124, 48.137154),
    "Dortmund": (7.468554, 51.513400),
    "Stuttgart": (9.181332, 48.777128),
    "Nürnberg": (11.077438, 49.449820),
    "Hannover": (9.73322, 52.37052),
}
