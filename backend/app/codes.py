"""
Decoding von verschiedener Codes, die in Register vorkommen. Leider habe ich dazu keine Quelle
gefunden und diese "reverse-engineered" in dem ich geschaut habe, was in den Einträgen der
Schnellsuche steht ("https://www.marktstammdatenregister.de/MaStR/Einheit/Einheiten/OeffentlicheEinheitenuebersicht")

Bruttoleistung = installierte Leistung: Stromertrag bei optimalem Betrieb
Nettonennleistung:  Minimum aus Bruttoleistung und Wechselrichter-Wirkleistung
"""


# codes.py

EINPREISUNGSART = {
    688: "Volleinpreisung",
    689: "Teileinpreisung",
}

ENERGIETRAEGER = {
    2495: "Solar/PV",
}

ART_DER_SOLARANLAGE = {
    852: "Freiflaeche",  # manchmal ist BKW auch unter 853 zu finden
    853: "Bauliche Anlage (Hausdach, Gebaeude, Fassade)",  # hieß vorher "Lage"
    # 875: "Gebäudesolaranlage", inzwischen 853
    2484: "Bauliche Anlage (Sonstige)",
    2961: "Balkonkraftwerk",
    3002: "Gewaesser",
    3058: "Grossparkplatz",
}

# Fehlt zu oft
NUTZUNGSBEREICH = {
    713: "Haushalt",
    714: "Gewerbe, Handel, Dienstleis.",
    715: "Industrie",
    716: "Landwirtschaft",
    717: "Oeffentliches Gebaeude",
    718: "Sonstige",
}

AUSRICHTUNG = {
    695: "Nord",
    696: "Nord-Ost",
    697: "Ost",
    698: "Sued-Ost",
    699: "Sued",
    700: "Sued-West",
    701: "West",
    702: "Nord-West",
    703: "nachgefuehrt",
    704: "Ost-West",
}

WINKEL = {
    806: "nachgefuehrt",
    807: "> 60",
    808: "40 - 60",
    809: "20 - 40",
    810: "< 20",
    811: "nachgefuehrt",
}

BETRIEBSSTATUS = {
    35: "in Betrieb",
    31: "in Planung",
    37: "voruebergehend stillgelegt",
    38: "endgueltig stillgelegt",
}

BUNDESLAENDER = {
    1400: "Brandenburg",
    1401: "Berlin",
    1402: "Baden-Wuerttemberg",
    1403: "Bayern",
    1404: "Bremen",
    1405: "Hessen",
    1406: "Hamburg",
    1407: "Mecklenburg-Vorpommern",
    1408: "Niedersachsen",
    1409: "Nordrhein-Westfalen",
    1410: "Rheinland-Pfalz",
    1411: "Schleswig-Holstein",
    1412: "Saarland",
    1413: "Sachsen",
    1414: "Sachsen-Anhalt",
    1415: "Thueringen",
}

BATTERIETECHNOLOGIE = {
    727: "Lithium",
    728: "Blei",
    729: "Redox-Flow-Batterie",
    730: "Hochtemperaturbatterie",
    731: "Nickel-Cadmium-/Nickel-Metallhydridbatterie",
    732: "Sonstige",
}

AC_DC_KOPPELUNG = {
    693: "AC gekoppelt",
    694: "DC gekoppelt",
}

TECHNOLOGIE = {
    524: "Batterie",
    525: "Druckluft",
    526: "Schwungrad",
    3067: "Wasserstoffspeicher",
}

LEISTUNGSBEGRENZUNG = { # seit 01.01.2023 nicht mehr relevant
    802: "Nein",
    803: "70%",
    804: "60%",
    805: "50%",
    1535: "Ja, sonstige"
}