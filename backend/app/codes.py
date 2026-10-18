"""
Catalog codes of the MaStR bulk export (Gesamtdatenexport).

The export stores catalog fields as numeric IDs (e.g. ArtDerSolaranlage = 853), the SOAP API returns
the decoded value (e.g. "Gebaeudesolaranlage"). Every catalog below maps ID -> exactly the value the API
returns, so rows from the bulk export and rows fetched via the API end up identical in the database.
Comments give the official German label where the value alone isn't clear.

Verify against the live API (from backend/):  uv run python -m app.etl.verify_codes [solar|wind|water|storage|gas_producer|
                                               gas_storage|biomass|combustion|nuclear|geothermal|consumer|gas_consumer]
Decode a DataFrame from the export:            decode(df, SOLAR)  (or WIND, WATER, STORAGE, GAS_PRODUCER, GAS_STORAGE,
                                               BIOMASS, COMBUSTION, NUCLEAR, GEOTHERMAL, CONSUMER, GAS_CONSUMER,
                                               GRID_CONNECTION_POINT, LOCATION, GRID, GRID_OPERATOR)

Bruttoleistung = installierte Leistung: Stromertrag bei optimalem Betrieb
Nettonennleistung:  Minimum aus Bruttoleistung und Wechselrichter-Wirkleistung
"""

import logging
from dataclasses import dataclass, field
from datetime import date
from functools import cache, cached_property, partial

import pandas as pd

log = logging.getLogger(__name__)


# ============================================================ general (verified with solar, wind and storage units, 2026-09-27)

EINHEIT_SYSTEMSTATUS = {
    472: "Aktiv",
}

EINHEIT_BETRIEBSSTATUS = {
    31: "InPlanung",
    35: "InBetrieb",
    37: "VoruebergehendStillgelegt",
    38: "EndgueltigStillgelegt",
}

NETZBETREIBERPRUEFUNG_STATUS = {
    2954: "Geprueft",
    2955: "Ungeprueft",
    3075: "NichtVorgesehen",  # Balkonkraftwerke are not checked by the grid operator
}

LAND = {
    66: "Belgien",
    84: "Deutschland",
    90: "Daenemark",
    169: "Luxemburg",
    198: "Niederlande",
    206: "Oesterreich",
    215: "Polen",  # inferred, not verifiable: the only 2 units with this code were corrected to Deutschland
    230: "Schweden",  # a grid operator's (verified with GetMarktakteur, 2026-10-16)
    231: "Schweiz",
}

BUNDESLAND = {
    1400: "Brandenburg",
    1401: "Berlin",
    1402: "BadenWuerttemberg",
    1403: "Bayern",
    1404: "Bremen",
    1405: "Hessen",
    1406: "Hamburg",
    1407: "MecklenburgVorpommern",
    1408: "Niedersachsen",
    1409: "NordrheinWestfalen",
    1410: "RheinlandPfalz",
    1411: "SchleswigHolstein",
    1412: "Saarland",
    1413: "Sachsen",
    1414: "SachsenAnhalt",
    1415: "Thueringen",
    1416: "AusschliesslicheWirtschaftszone",  # offshore wind parks outside the 12-mile zone
}

ENERGIETRAEGER = {
    # geothermal, mine gas and pressure relief units (EinheitenGeothermieGrubengasDruckentspannung)
    2403: "Geothermie",
    2404: "Solarthermie",
    2405: "Klaerschlamm",
    2406: "Grubengas",
    # combustion units
    2407: "Steinkohle",
    2408: "Braunkohle",
    2409: "Mineraloelprodukte",
    2410: "Erdgas",
    2411: "AndereGase",
    2412: "NichtBiogenerAbfall",
    2413: "Waerme",
    2493: "Biomasse",
    2494: "Kernenergie",
    2495: "SolareStrahlungsenergie",
    2496: "Speicher",  # also a few combustion units
    2497: "Wind",
    2498: "Wasser",
    2957: "DruckAusGasleitungen",
    2958: "DruckAusWasserleitungen",
    3030: "Wasserstoff",  # combustion units
}

EINSPEISUNGSART = {
    688: "Volleinspeisung",
    689: "TeileinspeisungEigenverbrauch",  # Teileinspeisung (einschließlich Eigenverbrauch)
}


ART_DER_SOLARANLAGE = {
    852: "Freiflaechensolaranlage",
    853: "Gebaeudesolaranlage",  # some Balkonkraftwerke are registered here too
    2484: "SonstigeSolaranlage",
    2961: "SteckerfertigeSolaranlage",  # Balkonkraftwerk
}

LEISTUNGSBEGRENZUNG = {  # no longer relevant since 01.01.2023
    802: "Nein",
    803: "Ja70Prozent",
    804: "Ja60Prozent",
    805: "Ja50Prozent",
    1535: "JaSonstige",
}

AUSRICHTUNG = {
    695: "Nord",
    696: "NordOst",
    697: "Ost",
    698: "SuedOst",
    699: "Sued",
    700: "SuedWest",
    701: "West",
    702: "NordWest",
    703: "Nachgefuehrt",
    704: "OstWest",
}

NEIGUNGSWINKEL = {
    806: "Grad90",  # 90 Grad (vertikal)
    807: "Grad61Bis89",
    808: "Grad41Bis60",
    809: "Grad21Bis40",
    810: "Grad5Bis20",
    811: "Nachgefuehrt",
    3179: "Unter5",  # unter 5 Grad (horizontal)
}

NUTZUNGSBEREICH = {  # missing for about a quarter of all units
    713: "Haushalt",
    714: "GewerbeHandelDienstleistungen",
    715: "Industrie",
    716: "Landwirtschaft",
    717: "OeffentlichesGebaeude",
    718: "Sonstige",
}

# Freiflächenanlagen and wind units: what the area was used for before the plant was built
VORHERIGER_NUTZUNGSARTENBEREICH = {
    3220: "Vegetation",
    3221: "Siedlung",
    3222: "Verkehr",
    3223: "Gewaesser",
}

VORHERIGE_NUTZUNGSART = {
    3187: "LandwirtschaftAckerland",
    3188: "LandwirtschaftGruenland",
    3189: "LandwirtschaftGartenbauland",
    3190: "LandwirtschaftRebflaeche",
    3191: "LandwirtschaftObstUndNussplantage",
    3192: "LandwirtschaftWeihnachtsbaumkultur",
    3193: "LandwirtschaftKurzumtriebsplantage",
    3194: "LandwirtschaftBrachland",
    3195: "WaldLaubUndNadelohlz",
    3196: "Gehoelz",
    3197: "Heide",
    3198: "Moor",
    3199: "Sumpf",
    3200: "UnlandVegetationsloseFlaeche",
    3201: "Wohnbauflaeche",
    3202: "IndustrieUndGewerbeflaeche",
    3203: "Halde",
    3204: "Bergbaubetrieb",
    3205: "TagebauGrubeSteinbruch",
    3206: "FlaecheGemischterNutzung",
    3207: "FlaecheBesondererFunktionalerPraegung",
    3208: "SportFreizeitUndErholungsflaeche",
    3209: "Friedhof",
    3210: "Strassenverkehr",
    3211: "Weg",
    3212: "Platz",
    3213: "Bahnverkehr",
    3214: "Flugverkehr",
    3218: "StehendesGewaesser",
    3245: "WaldLaubholz",
    3246: "WaldNadelholz",
    3247: "WaldLaubUndNadelholz",  # replaced 3195, which the current catalog no longer has
}

# Several per unit, comma-separated in the export ("813, 3186")
FLAECHENMERKMALE = {
    709: "Konversionsflaeche",
    710: "RandstreifenLaengsVonAutobahnenOderSchienenwegen",
    711: "FlaecheLandwirtschaftlich",  # Fläche wird landwirtschaftlich genutzt
    712: "VersiegelteFlaeche",
    812: "BebauungsplanVorJanuar2010AlsGewerbeOderIndustriegebietAusgewiesen",
    813: "BebauungsplanVorSeptember2003UndNichtGeaendert",
    815: "EigentumOderBesitzOderVerwaltungDesBundesamtes",  # Eigentum des Bundes oder Besitz/Verwaltung des Bundesamtes für Immobilienaufgaben
    2965: "EinheitAufEinerSonstigenBaulichenAnlage",
    3057: "FlaecheWiedervernaessterMoorboden",
    3180: "FlaecheParkplatz",
    3181: "BesondereSolaranlage",  # erfüllt die Festlegung der BNetzA nach § 85c EEG
    3182: "Planfeststellungsverfahren",  # oder sonstiges Verfahren nach § 38 BauGB
    3183: "BenachteiligtesGebiet",
    3184: "EinheitAnEinerLaermschutzwand",
    3185: "EinheitAnEinemZaun",
    3186: "KeinZusaetzlichesMerkmal",
}


# ============================================================ wind

WIND_LAGE = {
    888: "WindAnLand",
    889: "WindAufSee",
}

SEELAGE = {
    639: "Ostsee",
    640: "Nordsee",
}

# Offshore areas of the Flächenentwicklungsplan (BSH)
FLAECHENENTWICKLUNGSPLAN_NORDSEE = {
    1546: "N-1",
    1547: "N-2",
    1548: "N-3",
    1549: "N-4",
    1550: "N-5",
    1551: "N-6",
    1552: "N-7",
    1553: "N-8",
    2963: "KeinGebietNachDemFlaechenentwicklungsplan",
}

FLAECHENENTWICKLUNGSPLAN_OSTSEE = {
    1540: "O-1",
    1541: "O-2",
    1542: "O-3",
    1543: "O-4",
}

WIND_TECHNOLOGIE = {
    691: "Horizontallaeufer",
    692: "Vertikallaeufer",
    3102: "Flugwindenergieanlage",  # airborne wind energy (kites)
}

# The API returns the manufacturer's name, not an enum value. Only manufacturers that appear in the data.
HERSTELLER = {
    1571: "ABB Power-One Italy SpA",
    1572: "Adwen GmbH",
    1573: "Alpha projekt GmbH",
    1574: "ALPHACON GmbH",
    1575: "Amperax Energie GmbH",
    1576: "Anhui Hummer Dynamo Co.,Ltd.",
    1577: "AN-Maschinenbau- und Umweltschutzanlagen GmbH",
    1578: "AREVA GmbH",
    1581: "BARD Holding GmbH",
    1582: "BRAUN Windturbinen GmbH",
    1584: "DeWind GmbH",
    1585: "Easywind GmbH",
    1586: "ENERCON GmbH",
    1587: "eno energy GmbH",
    1588: "Eovent GmbH",
    1589: "ESPV-TEC GmbH & Co. KG",
    1590: "EUSAG AG",
    1591: "EVIAG AG",
    1592: "Frisia Windkraftanlagen Service GmbH",
    1593: "Fuhrländer AG",
    1594: "FuSystems SkyWind GmbH",
    1595: "FWT energy GmbH",
    1596: "Gamesa Corporación Tecnológica S.A.",
    1597: "GE Wind Energy GmbH",
    1598: "General Electric Deutschland Holding GmbH",
    1599: "Gödecke Energie- und Antriebstechnik GmbH",
    1601: "Heyde Windtechnik GmbH",
    1602: "Honeywell Windtronics",
    1603: "Husumer Dock und Reparatur GmbH & Co. KG",
    1604: "Hyden",
    1605: "InVentus Energie GmbH",
    1606: "JAMP GmbH",
    1608: "K.D.-Stahl- und Maschinenbau GmbH",
    1609: "Kähler Maschinenbau GmbH",
    1610: "Kenersys Europe GmbH",
    1611: "Kessler Energy GmbH",
    1612: "Kleinwind GmbH",
    1613: "Krogmann GmbH & Co. KG",
    1614: "Lagerwey GmbH",
    1615: "Lely Aircon B.V. Niederlassung Leer",
    1619: "LuvSide GmbH",
    1620: "LWS systems GmbH & Co. KG.",
    1621: "Mischtechnik Hoffmann & Partner GmbH",
    1623: "myLEDsun",
    1624: "MyWind",
    1625: "NEG Micon Deutschland GmbH",
    1626: "Norddeutsche H-Rotoren GmbH & Co. KG",
    1627: "Nordex Energy GmbH",
    1628: "Nordex SE",
    1629: "Octopus Systems GmbH",
    1630: "Pfleiderer Deutschland GmbH",
    1631: "Pfleiderer Wind Energy GmbH",
    1633: "PowerWind GmbH",
    1634: "PSW-Energiesysteme GmbH",
    1635: "QREON GmbH",
    1637: "ROPATEC SRL",
    1639: "S & W ENERGIESYSTEME UG (haftungsbeschränkt)",
    1640: "SB Energy UK Ltd.",
    1641: "Schuler Aktiengesellschaft",
    1642: "Schütz GmbH & Co. KGaA",
    1643: "SeeBA Energiesysteme GmbH",
    1644: "SEEWIND Windenergiesysteme GmbH",
    1645: "Senvion Deutschland GmbH",
    1646: "Siemens Wind Power GmbH & Co. KG",
    1647: "SMA Solar Technology AG",
    1649: "SOLAR-WIND-TEAM GmbH",
    1651: "STM Montage GmbH",
    1652: "Südwind Borsig Energy GmbH",
    1653: "Svit Vitru",
    1654: "Tacke GmbH & Co. KG",
    1655: "TOZZI NORD S.R.L.",
    1656: "Uni Wind GmbH",
    1657: "VENSYS Energy AG",
    1658: "VENTEGO AG",
    1659: "VENTIS WIND SERVICE S.L",
    1660: "Vestas Deutschland GmbH",
    1661: "VWA-Deutschland GmbH Freude am Strom",
    1664: "Werner Eberle GmbH",
    1665: "WES IBS GmbH",
    1666: "Wind Technik Nord GmbH",
    1667: "Wind+Wing Technologies",
    1670: "windradshop",
    1671: "WindTec GmbH",
    1672: "Wittenbauer Technik & Consulting GmbH",
    1674: "WSD - Windsysteme",
    1675: "WTT GmbH",
    2554: "Sonstige",
    2873: "GE Renewable Germany GmbH",
    2874: "Home Energy International",
    2876: "Sonkyo Energy",
    2884: "Enron Wind GmbH",
    2885: "Jacobs Energie GmbH",
    2886: "bwu Brandenburgische Wind- und Umwelttechnologien GmbH",
    2887: "HSW Husumer Schiffswerft GmbH & Co. KG",
    2888: "REpower Systems SE",
    2889: "AN Windenergie GmbH",
    2890: "Bonus Energy A/S",
    2891: "Nordtank Energy Group",
    2892: "Wind World A/S",
    2893: "Ventis Energietechnik GmbH",
    2894: "Hanseatische AG",
    2896: "Wincon West Wind A/S",
    2898: "Aeolos Windkraftanlagen",
    2899: "Fortis Wind Energy",
    2900: "Nova-Wind GmbH",
    2901: "PreVent GmbH",
    2902: "SkyWind GmbH",
    2903: "Smart Power Electronics GmbH",
    2904: "Weinack Windenergie Anlagen GmbH",
    2929: "MHI Vestas Offshore Wind",
    1001671: "AN Windanlagen GmbH",
    1001678: "E.A.Z. Wind GmbH",
    1001679: "Siemens Gamesa Renewable Energy GmbH & Co. KG",
    1001681: "MAX-wyn GmbH",
    1001682: "Nordex Germany GmbH",
    1001683: "Zentrum für Sonnenenergie- und Wasserstoff-Forschung Baden-Württemberg (ZSW)",
    1001684: "eno energy systems GmbH",
    1001688: "EnerKíte GmbH",
    1001691: "AIRCON GmbH ＆ Co. KG",
    1001692: "AN Bonus",
    1001701: "windwise GmbH",
}


# ============================================================ hydropower

ART_DER_WASSERKRAFTANLAGE = {
    890: "Laufwasseranlage",
    891: "Speicherwasseranlage",
    894: "WasserkraftanlageInTrinkwassersystem",
    895: "WasserkraftanlageInBrauchwassersystem",
    896: "Abwasserkraftanlage",
    897: "Meeresenergie",
}

ART_DES_ZUFLUSSES = {
    724: "Flusskraftwerk",
    725: "Restwasserkraftwerk",
    726: "Ausleitungskraftwerk",
}


# ============================================================ storage

SPEICHER_TECHNOLOGIE = {
    524: "Batterie",
    525: "Druckluft",
    526: "Schwungrad",
    1537: "Pumpspeicher",
    3067: "Wasserstoffspeicher",
}

BATTERIETECHNOLOGIE = {
    727: "LithiumBatterie",
    728: "BleiBatterie",
    729: "RedoxFlowBatterie",
    730: "Hochtemperaturbatterie",
    731: "NickelCadmiumOrNickelMetallhydridbatterie",
    732: "SonstigeBatterie",
}

PUMPSPEICHERTECHNOLOGIE = {
    2920: "PumpspeicheranlageOhneNatuerlichemZufluss",
    2921: "PumpspeicheranlageMitNatuerlichemZufluss",
}

AC_DC_KOPPELUNG = {
    693: "ACgekoppeltesSystem",
    694: "DCgekoppeltesSystem",
}

EINSATZORT = {  # storage units (only a few dozen) and combustion units (about 1,700, mostly emergency generators)
    733: "Flughafen",
    734: "Krankenhaus",
    735: "Veranstaltungsgebaeude",
    736: "Rechenzentrum",
    737: "Industrie",
    738: "Bahn",
    739: "Bank",
    741: "Hochhaus",
    742: "Kaufhaus",
    743: "Kraftwerke",
    744: "KulturMesse",  # Kultur und Messe
    746: "MilitaerPolizeiJustiz",  # Militär, Polizei und Justiz
    748: "WasserKlaerwerke",  # Wasser- und Klärwerke
    750: "Versicherungen",
    751: "Verlagshaeuser",
    753: "Telekommunikationsbranche",
    754: "Sportstaetten",
    755: "Sendeanstalten",
    1531: "AltenPflegeheime",  # Alten-/Pflegeheime
    1532: "Bergbau",
    1533: "Logistikzentren",  # Logistikzentren (z.B. Kühlhäuser)
    2399: "Haushalt",
    2400: "Sonstige",
}

EEGANLAGENTYP = {
    8: "Stromspeichereinheit",
}


# ============================================================ gas (verified with gas producer and storage units, 2026-09-30)

GAS_TECHNOLOGIE = {  # TechnologieGasErzeugung
    824: "FoerderungFossilenErdgases",
    825: "BiomethanErzeugung",
    826: "PowerToGasWasserstoff",
    827: "PowerToGasMethan",
    829: "LiquifidNaturalGas",  # sic, the API's spelling (Liquefied Natural Gas: LNG terminals and liquefaction plants)
}

GASSPEICHERART = {
    658: "Kavernenspeicher",
    659: "Porenspeicher",
    660: "Aquiferspeicher",
}


# ============================================================ biomass, combustion, nuclear, geothermal (verified with their units, 2026-10-16)

BIOMASSEART = {
    719: "FluessigeBiomasse",
    720: "FesteBiomasse",
    721: "GasfoermigeBiomasse",
}

# The fuels: Hauptbrennstoff of biomass and combustion units, WeitererHauptbrennstoff and WeitereBrennstoffe (several
# per unit) of combustion units. The API has an enum for each, with the same value for the same code.
BRENNSTOFF = {
    # feste Biomasse
    2414: "FesteBiogeneStoffeUndAbfaelleOhneHolz",
    2415: "AltholzGebrauchtholzHolzmuell",  # Altholz, Gebrauchtholz, Holz(sperr)müll
    2416: "TierUndBlutmehl",
    2418: "BrennlaugeSchwarzlaugeSulfitablauge",
    2419: "FesteBiogeneStoffe",
    2421: "WaldHolzhackschnitzelWaldScheitholzWaldKronenholz",
    2422: "Holzreste",  # z.B. aus Schreinereien, auch Spanholz
    2423: "HolzspaeneSaegemehl",
    2424: "RindeLandschaftspflegeholz",
    2425: "PelletsHolz",  # Holz-Pellets, Holz-Briketts
    2431: "StrohStrohpellets",
    2433: "Tierfett",
    3031: "EnergiepflanzenZurVerbrennung",  # z.B. Kurzumtriebs-Holz
    3034: "WaldStammholzRundholz",
    # flüssige Biomasse
    2436: "FluessigeBiogeneStoffeUndAbfaelle",
    2437: "Biodiesel",
    2438: "Biomethanol",
    2440: "Harzoel",
    2442: "PalmoelPflanzenoel",  # Palmöl u.a. Pflanzenöle
    2444: "Terpentin",
    # gasförmige Biomasse
    2445: "Biogas",
    2446: "BiomethanBioerdgas",
    2447: "Deponiegas",
    2448: "Klaergas",
    3032: "HolzgasGasBiomasse",
    # coal
    2457: "Steinkohlen",
    2460: "Braunkohlenbriketts",
    2461: "Braunkohlenkoks",
    2462: "Hartbraunkohlen",
    2463: "Rohbraunkohlen",
    2464: "StaubUndTrockenkohle",
    2465: "Wirbelschichtkohle",
    # Mineralölprodukte
    2466: "Dieselkraftstoff",
    2467: "HeizoelLeicht",
    2468: "HeizoelSchwer",
    2469: "Fluessiggas",
    2470: "Petrolkoks",
    2471: "Raffineriegas",
    2472: "AndereMineraloelprodukte",
    # gases
    2473: "ErdgasErdoelgas",
    2474: "GrubengasVerbrennung",  # Grubengas
    2475: "HochofengasKonvertergas",
    2476: "Kokereigas",
    2477: "AndereGase",
    2478: "SonstigeHergestellteGase",
    3035: "Wasserstoff",
    # nicht biogener Abfall, Wärme
    2479: "Industrieabfall",
    2480: "AbfallHausmuellSiedlungsabfaelle",  # Abfall (Hausmüll, Siedlungsabfälle)
    2481: "Dampf",  # zum Beispiel Prozesswärme
    2483: "Waerme",
}

# Technologie of combustion, biomass and geothermal units
VERBRENNUNG_TECHNOLOGIE = {
    542: "Verbrennungsmotor",
    543: "Brennstoffzelle",
    544: "Stirlingmotor",
    545: "Dampfmotor",
    546: "ORCOrganicRankineCycleAnlage",
    833: "GegendruckmaschinemitEntnahme",
    834: "GegendruckmaschineohneEntnahme",
    835: "GasturbinenohneAbhitzekessel",
    836: "GasturbinenmitAbhitzekessel",
    837: "GasturbinenmitnachgeschalteterDampfturbine",
    838: "KondensationsmaschinemitEntnahme",
    839: "KondensationsmaschineohneEntnahme",
    840: "Sonstige",
    1538: "KalinaCycle",
}

KERNKRAFT_TECHNOLOGIE = {
    1444: "Druckwasserreaktor",  # the six units in the export, all finally decommissioned
}


# ============================================================ grid connections, grids and their operators (2026-10-16)
# Verified with the Lokationen of a few Netzanschlusspunkte per code (GetLokationStromErzeuger, -StromVerbraucher,
# -GasErzeuger, -GasVerbraucher) and with the grid operators (GetMarktakteur), unless a comment says otherwise.

# Lokationstypen.xml; the API's LokationTypEnum (it has a call per type, the answers don't name it)
LOKATIONTYP = {
    1: "Stromerzeugungslokation",
    2: "Stromverbrauchslokation",
    3: "Gaserzeugungslokation",
    4: "Gasverbrauchslokation",
}

# The Netzebenen 1-7: each voltage and the transformation to the one below
SPANNUNGSEBENE = {
    348: "Hoechstspannung",
    349: "UmspannungZurHochspannung",  # Umspannebene Höchstspannung/Hochspannung
    350: "Hochspannung",
    351: "UmspannungZurMittelspannung",  # Umspannebene Hochspannung/Mittelspannung
    352: "Mittelspannung",
    353: "UmspannungZurNiederspannung",  # Umspannebene Mittelspannung/Niederspannung
    354: "Niederspannung",  # Hausanschluss, Haushaltsstrom
}

# The API's RegelzoneEnum, by its labels: the answers of the Lokationen don't name a point's Regelzone
REGELZONE = {
    1000001: "FuenfzigHertz",  # 50Hertz
    1000010: "Amprion",
    1001564: "Tennet",  # TenneT
    1001572: "TransnetBW",
}

GASQUALITAET = {
    766: "LGas",
    767: "HGas",
}

# A grid's Sparte and Marktgebiet: not in the API's answers, the values of its enum (SparteEnum) and the export's names
SPARTE = {
    20: "Strom",
    21: "Gas",
}

MARKTGEBIET = {
    1536: "Beide",
    1001666: "NetConnect Germany",
    1001667: "Trading Hub Europe",
}

PERSONENART = {
    517: "Organisation",  # Unternehmen, Personengesellschaft, juristische Person, Behörde, Verband
    518: "NatuerlichePersonOderOrganisationMitPersonenbezug",  # z. B. Eheleute, Erbengemeinschaft; by the API's enum
}

# Marktfunktionen.xml; the grid operators are 1 and 8, the others by the order of the API's MarktfunktionEnum
MARKTFUNKTION = {
    1: "Stromnetzbetreiber",
    2: "Anlagenbetreiber",
    3: "AkteurImStrommarkt",
    4: "OrganisierteMarktplaetze",  # Organisierter Marktplatz
    5: "Behoerden",  # Behörde, Verband, Institution
    6: "SonstigeMarktakteure",
    7: "Bundesnetzagentur",
    8: "Gasnetzbetreiber",
    9: "AkteurImGasmarkt",
    10: "Supportpartner",
}

# The Länder of market actors and grids: other codes than the units' (BUNDESLAND), the same values
BUNDESLAND_MARKTAKTEUR = {
    332: "Brandenburg",
    333: "Berlin",
    334: "BadenWuerttemberg",
    335: "Bayern",
    336: "Bremen",
    337: "Hessen",
    338: "Hamburg",
    339: "MecklenburgVorpommern",
    340: "Niedersachsen",
    341: "NordrheinWestfalen",
    342: "RheinlandPfalz",
    343: "SchleswigHolstein",
    344: "Saarland",
    345: "Sachsen",
    346: "SachsenAnhalt",
    347: "Thueringen",
}

# PR, VR and GsR (Partnerschafts-, Vereins-, Gesellschaftsregister) by the API's enum, not in the data
REGISTERNUMMER_PRAEFIX = {
    1003: "HRA",
    1004: "HRB",
    1005: "GnR",
    1006: "PR",
    1007: "VR",
    3101: "GsR",
}

# The API returns the name, not an enum value (like the Hersteller). Only those that appear in the data.
RECHTSFORM = {
    408: "AB",
    409: "AG",
    411: "Anstalt des öffentlichen Rechts",
    423: "eG",
    424: "e.K.",
    426: "Eigenbetrieb",
    427: "Einzelunternehmen",
    429: "GmbH",
    430: "GmbH & Co. KG",
    432: "GmbH & Co. oHG",
    438: "KG",
    440: "Körperschaft des öffentlichen Rechts",
    443: "oHG",
    465: "Sonstige",
}

# The court of the commercial register; like the Rechtsform the API returns its name. Only those in the data.
REGISTERGERICHT = {
    1008: "Freiburg im Breisgau",
    1009: "Mannheim",
    1010: "Stuttgart",
    1011: "Ulm",
    1012: "Amberg",
    1013: "Ansbach",
    1014: "Aschaffenburg",
    1015: "Augsburg",
    1016: "Bamberg",
    1017: "Bayreuth",
    1018: "Coburg",
    1019: "Deggendorf",
    1020: "Fürth",
    1021: "Hof",
    1022: "Ingolstadt",
    1023: "Kempten (Allgäu)",
    1024: "Landshut",
    1025: "Memmingen",
    1026: "München",
    1027: "Nürnberg",
    1028: "Passau",
    1029: "Regensburg",
    1030: "Schweinfurt",
    1031: "Straubing",
    1032: "Traunstein",
    1033: "Weiden in der Oberpfalz",
    1034: "Würzburg",
    1035: "Berlin (Charlottenburg)",
    1036: "Cottbus",
    1037: "Frankfurt/Oder",
    1038: "Neuruppin",
    1039: "Potsdam",
    1040: "Bremen",
    1041: "Hamburg",
    1042: "Bad Hersfeld",
    1043: "Bad Homburg vor der Höhe",
    1044: "Darmstadt",
    1045: "Eschwege",
    1046: "Frankfurt am Main",
    1047: "Friedberg (Hessen)",
    1048: "Fritzlar",
    1049: "Fulda",
    1050: "Gießen",
    1051: "Hanau",
    1052: "Kassel",
    1054: "Korbach",
    1055: "Limburg",
    1056: "Marburg",
    1057: "Offenbach am Main",
    1058: "Wetzlar",
    1059: "Wiesbaden",
    1060: "Neubrandenburg",
    1061: "Rostock",
    1062: "Schwerin",
    1063: "Stralsund",
    1064: "Aurich",
    1065: "Braunschweig",
    1066: "Göttingen",
    1067: "Hannover",
    1068: "Hildesheim",
    1069: "Lüneburg",
    1070: "Oldenburg",
    1071: "Osnabrück",
    1072: "Stadthagen",
    1073: "Tostedt",
    1074: "Walsrode",
    1075: "Aachen",
    1076: "Arnsberg",
    1077: "Bad Oeynhausen",
    1078: "Bielefeld",
    1079: "Bochum",
    1080: "Bonn",
    1081: "Coesfeld",
    1082: "Dortmund",
    1083: "Düren",
    1084: "Düsseldorf",
    1085: "Duisburg",
    1086: "Essen",
    1087: "Gelsenkirchen",
    1088: "Gütersloh",
    1089: "Hagen",
    1090: "Hamm",
    1091: "Iserlohn",
    1092: "Kleve",
    1093: "Köln",
    1094: "Krefeld",
    1095: "Lemgo",
    1097: "Münster",
    1098: "Neuss",
    1099: "Paderborn",
    1100: "Recklinghausen",
    1101: "Siegburg",
    1102: "Siegen",
    1103: "Steinfurt",
    1104: "Wuppertal",
    1105: "Bad Kreuznach",
    1106: "Kaiserslautern",
    1107: "Koblenz",
    1108: "Landau",
    1109: "Ludwigshafen am Rhein",
    1110: "Mainz",
    1111: "Montabaur",
    1112: "Wittlich",
    1113: "Zweibrücken",
    1114: "Saarbrücken",
    1115: "Chemnitz",
    1116: "Dresden",
    1117: "Leipzig",
    1118: "Stendal",
    1119: "Flensburg",
    1120: "Kiel",
    1121: "Lübeck",
    1122: "Pinneberg",
    1123: "Jena",
    1355: "Erfurt",
    1356: "Gera",
}


# ============================================================ which column uses which catalog


@dataclass(frozen=True)
class CodeSpec:
    """How the bulk export and the API differ for one unit type."""

    columns: dict[str, dict[int, str]]  # export column -> catalog
    multi: frozenset[str] = frozenset()  # columns holding comma-separated codes
    booleans: tuple[str, ...] = ()  # 0/1 in the export, True/False in the API
    api_names: dict[str, str] = field(default_factory=dict)  # export column -> API field, where the names differ
    not_in_api: tuple[str, ...] = ()  # export columns the API returns empty
    dates_with_time: tuple[str, ...] = ()  # dates the export writes as 2026-04-01T00:00:00, the API as 2026-04-01
    # The export's flag column of a field that can be "nicht vorhanden", where it isn't <field>_nv (Hausnummer_nv)
    not_available: dict[str, str] = field(default_factory=dict)

    def api_name(self, column: str) -> str:
        return self.api_names.get(column, column)

    def not_available_flag(self, column: str) -> str:
        return self.not_available.get(column, f"{column}_nv")

    def export_name(self, api_field: str) -> str:
        return self._export_names.get(api_field, api_field)

    @cached_property
    def _export_names(self) -> dict[str, str]:
        return {api_field: column for column, api_field in self.api_names.items()}

    @cached_property
    def _codes(self) -> dict[str, dict[str, int]]:
        """export column -> {API value: code}. If a value has several codes (old and new), the newest (highest) wins."""
        return {
            column: {value: code for code, value in sorted(catalog.items())} for column, catalog in self.columns.items()
        }


GENERAL = {
    "EinheitSystemstatus": EINHEIT_SYSTEMSTATUS,
    "EinheitBetriebsstatus": EINHEIT_BETRIEBSSTATUS,
    "NetzbetreiberpruefungStatus": NETZBETREIBERPRUEFUNG_STATUS,
    "Land": LAND,
    "Bundesland": BUNDESLAND,
    "Energietraeger": ENERGIETRAEGER,
    "Einspeisungsart": EINSPEISUNGSART,
}
GENERAL_BOOLEANS = (
    "NichtVorhandenInMigriertenEinheiten",
    "FernsteuerbarkeitNb",
    "FernsteuerbarkeitDv",
    "StrasseNichtGefunden",
    "HausnummerNichtGefunden",
)
GENERAL_API_NAMES = {
    "LokationMaStRNummer": "LokationMastrNummer",
    "EegMaStRNummer": "EegMastrNummer",
    "InbetriebnahmedatumAmAktuellenStandort": "InbetriebnahmedatumAmAktuellenOrt",
}
GENERAL_NOT_IN_API = ("NichtVorhandenInMigriertenEinheiten",)
GENERAL_DATES_WITH_TIME = ("InbetriebnahmedatumAmAktuellenStandort",)

SOLAR = CodeSpec(
    columns={
        **GENERAL,
        "ArtDerSolaranlage": ART_DER_SOLARANLAGE,
        "Leistungsbegrenzung": LEISTUNGSBEGRENZUNG,
        "Hauptausrichtung": AUSRICHTUNG,
        "Nebenausrichtung": AUSRICHTUNG,
        "HauptausrichtungNeigungswinkel": NEIGUNGSWINKEL,
        "NebenausrichtungNeigungswinkel": NEIGUNGSWINKEL,
        "Nutzungsbereich": NUTZUNGSBEREICH,
        "VorherigerNutzungsartenbereichDerFlaeche": VORHERIGER_NUTZUNGSARTENBEREICH,
        "UeberwiegendeNutzungsartDerFlaecheVorErrichtung": VORHERIGE_NUTZUNGSART,  # "...DerSolaranlage" until export 26.1
        "ZusaetzlicheMerkmaleDerFlaecheUndDerAktuellenFlaechennutzung": FLAECHENMERKMALE,
    },
    multi=frozenset({"ZusaetzlicheMerkmaleDerFlaecheUndDerAktuellenFlaechennutzung"}),
    booleans=(
        *GENERAL_BOOLEANS,
        "EinheitlicheAusrichtungUndNeigungswinkel",
        "SpeicherAmGleichenOrt",
        "Buergerenergie",
    ),
    api_names={
        **GENERAL_API_NAMES,
        "ZusaetzlicheMerkmaleDerFlaecheUndDerAktuellenFlaechennutzung": "ZusaetzlicheMerkmaleDerFlaecheUndAktuellenFlaechennutzung",
        "ZugeordneteWirkleistungWechselrichter": "zugeordneteWirkleistungWechselrichter",
        "GroesseDerInAnspruchGenommenenFlaecheInHektar": "GroesseDerInAnspruchGenommenenFlaeche",
    },
    not_in_api=GENERAL_NOT_IN_API,
    dates_with_time=GENERAL_DATES_WITH_TIME,
)

WIND = CodeSpec(
    columns={
        **GENERAL,
        "WindAnLandOderAufSee": WIND_LAGE,
        "Seelage": SEELAGE,
        "GebietNachDemFlaechenentwicklungsplanNordsee": FLAECHENENTWICKLUNGSPLAN_NORDSEE,
        "GebietNachDemFlaechenentwicklungsplanOstsee": FLAECHENENTWICKLUNGSPLAN_OSTSEE,
        "Technologie": WIND_TECHNOLOGIE,
        "Hersteller": HERSTELLER,
        "VorherigerNutzungsartenbereichDerFlaeche": VORHERIGER_NUTZUNGSARTENBEREICH,
        "UeberwiegendeNutzungsartDerFlaecheVorErrichtung": VORHERIGE_NUTZUNGSART,
    },
    booleans=(
        *GENERAL_BOOLEANS,
        "Buergerenergie",
        "Rotorblattenteisungssystem",
        "Nachtkennzeichnung",
        "AuflageAbschaltungLeistungsbegrenzung",
        "AuflagenAbschaltungSchallimmissionsschutzNachts",
        "AuflagenAbschaltungSchallimmissionsschutzTagsueber",
        "AuflagenAbschaltungSchattenwurf",
        "AuflagenAbschaltungTierschutz",
        "AuflagenAbschaltungEiswurf",
        "AuflagenAbschaltungSonstige",
    ),
    api_names={
        **GENERAL_API_NAMES,
        "WindAnLandOderAufSee": "WindAnLandOderSee",
        "Nachtkennzeichnung": "Nachtkennzeichen",
    },
    not_in_api=(*GENERAL_NOT_IN_API, "Rotorblattenteisungssystem"),
    dates_with_time=GENERAL_DATES_WITH_TIME,
)

WATER = CodeSpec(
    columns={
        **GENERAL,
        "ArtDerWasserkraftanlage": ART_DER_WASSERKRAFTANLAGE,
        "ArtDesZuflusses": ART_DES_ZUFLUSSES,
    },
    booleans=(
        *GENERAL_BOOLEANS,
        "MinderungStromerzeugung",
        "BestandteilGrenzkraftwerk",
        "NetzreserveZugeordnet",
        "KapazitaetsreserveZugeordnet",
    ),
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERAL_NOT_IN_API,
    dates_with_time=(*GENERAL_DATES_WITH_TIME, "DatumKapazitaetsreserve"),
)

STORAGE = CodeSpec(
    columns={
        **GENERAL,
        "Technologie": SPEICHER_TECHNOLOGIE,
        "Batterietechnologie": BATTERIETECHNOLOGIE,
        "Pumpspeichertechnologie": PUMPSPEICHERTECHNOLOGIE,
        "AcDcKoppelung": AC_DC_KOPPELUNG,
        "Einsatzort": EINSATZORT,
        "EegAnlagentyp": EEGANLAGENTYP,
    },
    booleans=(
        *GENERAL_BOOLEANS,
        "Notstromaggregat",
        "BestandteilGrenzkraftwerk",
        "PumpbetriebKontinuierlichRegelbar",
        "NetzreserveZugeordnet",
        "KapazitaetsreserveZugeordnet",
    ),
    api_names={
        **GENERAL_API_NAMES,
        "ZugeordnenteWirkleistungWechselrichter": "ZugeordneteWirkleistungWechselrichter",  # sic, the export's typo
        "PumpbetriebLeistungsaufnahme": "LeistungsaufnahmeBeimEinspeichern",
    },
    not_in_api=(*GENERAL_NOT_IN_API, "EegAnlagentyp"),  # EegAnlagentyp: only sometimes
    dates_with_time=(*GENERAL_DATES_WITH_TIME, "DatumKapazitaetsreserve"),
)


# The storage plant (Speicheranlage, AnlagenStromSpeicher): holds the usable capacity of its units
STORAGE_PLANT = CodeSpec(
    columns={"AnlageBetriebsstatus": EINHEIT_BETRIEBSSTATUS},
    multi=frozenset({"VerknuepfteEinheitenMaStRNummern"}),  # unit numbers, not codes: "SEE…, SEE…"
    api_names={"MaStRNummer": "SpeMastrNummer"},
)

# Gas units have the general fields of the power units, except those about electricity
GAS_GENERAL = {
    column: catalog for column, catalog in GENERAL.items() if column not in ("Energietraeger", "Einspeisungsart")
}
GAS_BOOLEANS = ("NichtVorhandenInMigriertenEinheiten", "StrasseNichtGefunden", "HausnummerNichtGefunden")

# Gas producers (EinheitenGasErzeuger, GetEinheitGasErzeuger). The API's MastrNummer only repeats the unit's own number,
# it is not the export's SpeicherMaStRNummer (which only the gas storage units listed there have).
GAS_PRODUCER = CodeSpec(
    columns={**GAS_GENERAL, "Technologie": GAS_TECHNOLOGIE},
    booleans=GAS_BOOLEANS,
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERAL_NOT_IN_API,
    dates_with_time=GENERAL_DATES_WITH_TIME,
)

# Gas storage units (EinheitenGasSpeicher, GetEinheitGasSpeicher), each part of a gas storage (SpeicherMaStRNummer)
GAS_STORAGE = CodeSpec(
    columns={**GAS_GENERAL, "Speicherart": GASSPEICHERART},
    booleans=GAS_BOOLEANS,
    api_names={**GENERAL_API_NAMES, "SpeicherMaStRNummer": "SpeMastrNummer"},
    not_in_api=GENERAL_NOT_IN_API,
    dates_with_time=GENERAL_DATES_WITH_TIME,
    not_available={"Weic": "Weic_Na"},  # Weic = {"Wert": ..., "NichtVorhanden": ...}, like Hausnummer
)

# The gas storage (Gasspeicheranlage, AnlagenGasSpeicher, GetGasSpeicher): its name and units
GAS_STORAGE_PLANT = CodeSpec(
    columns={"AnlageBetriebsstatus": EINHEIT_BETRIEBSSTATUS},
    multi=frozenset({"VerknuepfteEinheitenMaStRNummern"}),  # unit numbers, not codes: "GEE…, GEE…"
    api_names={"MaStRNummer": "SpeMastrNummer"},
)


# The other power units, which place the Netzanschlusspunkte of their Lokationen. Biomass, combustion and geothermal
# units share the technologies of combustion plants. The export's AnschlussAnHoechstOderHochSpannung is not in the API's
# answers.
GENERATION_NOT_IN_API = (*GENERAL_NOT_IN_API, "AnschlussAnHoechstOderHochSpannung")

BIOMASS = CodeSpec(
    columns={
        **GENERAL,
        "Hauptbrennstoff": BRENNSTOFF,
        "Biomasseart": BIOMASSEART,
        "Technologie": VERBRENNUNG_TECHNOLOGIE,
    },
    booleans=(
        *GENERAL_BOOLEANS,
        "AnschlussAnHoechstOderHochSpannung",
        "NetzreserveZugeordnet",
        "KapazitaetsreserveZugeordnet",
    ),
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERATION_NOT_IN_API,
    dates_with_time=GENERAL_DATES_WITH_TIME,
)

COMBUSTION = CodeSpec(
    columns={
        **GENERAL,
        "Hauptbrennstoff": BRENNSTOFF,
        "WeitererHauptbrennstoff": BRENNSTOFF,
        "WeitereBrennstoffe": BRENNSTOFF,
        "Technologie": VERBRENNUNG_TECHNOLOGIE,
        "Einsatzort": EINSATZORT,
    },
    multi=frozenset({"WeitereBrennstoffe"}),
    booleans=(
        *GENERAL_BOOLEANS,
        "AnschlussAnHoechstOderHochSpannung",
        "AnlageIstImKombibetrieb",
        "AusschliesslicheVerwendungImKombibetrieb",
        "BestandteilGrenzkraftwerk",
        "Notstromaggregat",
        "NetzreserveZugeordnet",
        "KapazitaetsreserveZugeordnet",
    ),
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERATION_NOT_IN_API,
    dates_with_time=(*GENERAL_DATES_WITH_TIME, "DatumNetzreserve", "DatumKapazitaetsreserve"),
)

NUCLEAR = CodeSpec(
    columns={**GENERAL, "Technologie": KERNKRAFT_TECHNOLOGIE},
    booleans=(*GENERAL_BOOLEANS, "AnschlussAnHoechstOderHochSpannung"),
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERATION_NOT_IN_API,
    dates_with_time=GENERAL_DATES_WITH_TIME,
)

# Geothermie, Solarthermie, Grubengas, Klärschlamm and Druckentspannung (EinheitenGeothermieGrubengasDruckentspannung)
GEOTHERMAL = CodeSpec(
    columns={**GENERAL, "Technologie": VERBRENNUNG_TECHNOLOGIE},
    booleans=(
        *GENERAL_BOOLEANS,
        "AnschlussAnHoechstOderHochSpannung",
        "NetzreserveZugeordnet",
        "KapazitaetsreserveZugeordnet",
    ),
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERATION_NOT_IN_API,
    dates_with_time=GENERAL_DATES_WITH_TIME,
)

# The large consumers of power and of gas: the general fields, without those about generation
CONSUMER = CodeSpec(
    columns=GAS_GENERAL,
    booleans=GAS_BOOLEANS,
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERAL_NOT_IN_API,
)

GAS_CONSUMER = CodeSpec(
    columns=GAS_GENERAL,
    booleans=(*GAS_BOOLEANS, "EinheitDientDerStromerzeugung"),
    api_names=GENERAL_API_NAMES,
    not_in_api=GENERAL_NOT_IN_API,
)

# The Netzanschlusspunkte (Netzanschlusspunkte.xml): in the API a list in the answer of their Lokation, without its type,
# grid and Regelzone
GRID_CONNECTION_POINT = CodeSpec(
    columns={
        "Lokationtyp": LOKATIONTYP,
        "Spannungsebene": SPANNUNGSEBENE,
        "RegelzoneNetzanschlusspunkt": REGELZONE,
        "Gasqualitaet": GASQUALITAET,
    },
    booleans=("NochInPlanung",),
    api_names={
        "NochInPlanung": "GeplanterNetzanschlusspunkt",
        "LetzteAenderung": "letzteAenderung",
        "NetzbetreiberMaStRNummer": "NetzbetreiberMastrNummer",
        "BilanzierungsgebietNetzanschlusspunktId": "BilanzierungsgebietNetzanschlusspunkt",
    },
    not_in_api=("Lokationtyp", "RegelzoneNetzanschlusspunkt", "NetzMaStRNummer", "LokationMaStRNummer"),
)

# The same as GetListeAlleNetzanschlusspunkte lists them (the nightly update): with their Lokation and its type, without
# the grid. Their Bilanzierungsgebiet comes as an object with its Id and Regelzone, which mastr_api.changed_points takes
# apart into the export's two columns.
GRID_CONNECTION_POINT_LIST = CodeSpec(
    columns=GRID_CONNECTION_POINT.columns,
    booleans=GRID_CONNECTION_POINT.booleans,
    api_names={
        "NochInPlanung": "GeplanterNetzanschlusspunkt",
        "NetzbetreiberMaStRNummer": "NetzbetreiberMastrNummer",
        "LokationMaStRNummer": "LokationMastrNummer",
    },
    not_in_api=("NetzMaStRNummer",),
)

# The Lokationen (Lokationen.xml): their units and Netzanschlusspunkte as numbers, not codes ("SEE…, SEE…")
LOCATION = CodeSpec(columns={"Lokationtyp": LOKATIONTYP}, not_in_api=("Lokationtyp",))

# The grids (Netze.xml): in the API the "Netz" of their operator (GetMarktakteur), with its Länder as a list
GRID = CodeSpec(
    columns={"Sparte": SPARTE, "Bundesland": BUNDESLAND_MARKTAKTEUR, "Marktgebiet": MARKTGEBIET},
    multi=frozenset({"Bundesland"}),
    booleans=("KundenAngeschlossen", "GeschlossenesVerteilnetz"),
    api_names={
        "Bundesland": "Bundeslaender",
        "KundenAngeschlossen": "MehrAls100000Kunden",
        "GeschlossenesVerteilnetz": "GeschlossenesVerteilernetz",
    },
    not_in_api=("Sparte", "Marktgebiet"),
)

# The grid operators (Marktakteure.xml, only Marktfunktion 1 and 8: db_migrate.ROW_FILTERS). The API gives their market
# roles and grid as objects, mastr_api.grid_operator turns them into the export's numbers.
GRID_OPERATOR = CodeSpec(
    columns={
        "Personenart": PERSONENART,
        "Marktfunktion": MARKTFUNKTION,
        "Rechtsform": RECHTSFORM,
        "Land": LAND,
        "Bundesland": BUNDESLAND_MARKTAKTEUR,
        "Registergericht": REGISTERGERICHT,
        "RegisternummerPraefix": REGISTERNUMMER_PRAEFIX,
        "LandAnZustelladresse": LAND,
    },
    api_names={
        "LandAnZustelladresse": "ZustellLand",
        "PostleitzahlAnZustelladresse": "ZustellPostleitzahl",
        "OrtAnZustelladresse": "ZustellOrt",
        "StrasseAnZustelladresse": "ZustellStrasse",
        "HausnummerAnZustelladresse": "ZustellHausnummer",
        "AdresszusatzAnZustelladresse": "ZustellAdresszusatz",
    },
    # The export's is a timestamp, the API's only a date, and another one (Amprion: 22.05.2017 11:30 / 04.05.2017)
    not_in_api=("RegistrierungsdatumMarktakteur",),
)


# ============================================================ decoding


def decode(df: pd.DataFrame, spec: CodeSpec = SOLAR) -> pd.DataFrame:
    """Copy of df with export codes replaced by API values. Unknown codes become NA and are logged.

    Multi-code columns become a comma-separated string of API values ("FlaecheParkplatz, BenachteiligtesGebiet").
    """
    out = df.copy()
    for column, catalog in spec.columns.items():
        if column not in out:
            continue
        if column in spec.multi:
            out[column] = out[column].map(partial(_decode_list, catalog=catalog, column=column), na_action="ignore")
            continue
        codes = pd.to_numeric(out[column], errors="coerce").astype("Int64")
        out[column] = codes.map(catalog)
        unknown = codes[codes.notna() & out[column].isna()]
        if len(unknown):
            log.warning("%s: %d rows with unknown codes %s", column, len(unknown), sorted(unknown.unique()))
    for column in spec.booleans:
        if column in out:
            out[column] = pd.to_numeric(out[column], errors="coerce").map({0: False, 1: True}).astype("boolean")
    return out


def _decode_list(raw, catalog: dict[int, str], column: str) -> str | None:
    values = []
    for part in str(raw).split(","):
        if not part.strip():  # a few lists end with a comma in the export (the Länder of a grid: "332, …, 345, ")
            continue
        code = int(float(part))
        if code in catalog:
            values.append(catalog[code])
        else:
            log.warning("%s: unknown code %s", column, code)
    return ", ".join(values) or None


# ============================================================ encoding (the other way round)

# The export only says whether street and house number were found for units with a public location (coordinates)
ADDRESS_FLAGS = ("StrasseNichtGefunden", "HausnummerNichtGefunden", "Hausnummer_nv")


def encode(unit: dict, spec: CodeSpec) -> dict[str, str | None]:
    """One unit from the API (the answer of a detail call) as a row in the export's format.

    The inverse of decode: values become codes again, True/False become 1/0, dates become ISO strings, and every
    field gets the export's column name. Fields without an export column (e.g. Netzbetreiberzuordnungen) stay in,
    whoever stores the row picks the columns it has.
    """
    row = {}
    for api_field, value in unit.items():
        column = spec.export_name(api_field)
        if column in spec.not_in_api:
            continue
        # Hausnummer = {"Wert": "12a", "NichtVorhanden": False}; the further fuels of combustion units come so too, their
        # value a catalog's ("ErdgasErdoelgas", "None" for none) or a list of them: it goes on like any other value
        if isinstance(value, dict) and "NichtVorhanden" in value:
            row[spec.not_available_flag(column)] = _to_text(value["NichtVorhanden"])
            value = None if value["Wert"] == "None" else value["Wert"]
        if isinstance(value, dict):  # catalog entry, e.g. Hersteller = {"Id": 1586, "Wert": "ENERCON GmbH"}
            row[column] = str(value["Id"]) if value["Wert"] is not None else None
        elif column in spec.multi and isinstance(value, list):
            codes = [_to_code(column, v, spec) for v in value]
            row[column] = ", ".join(code for code in codes if code) or None
        elif column in spec.columns:
            row[column] = _to_code(column, value, spec)
        elif column in spec.dates_with_time and value is not None:
            row[column] = f"{value.isoformat()}T00:00:00"
        else:
            row[column] = _to_text(value)

    if "Laengengrad" in unit and row.get("Laengengrad") is None:  # units, not grid operators or points
        row.update(dict.fromkeys(ADDRESS_FLAGS))
    return row


def _to_code(column: str, value: str | None, spec: CodeSpec) -> str | None:
    if value is None:
        return None
    code = spec._codes[column].get(value)
    if code is None:
        _warn_unknown(column, value)
        return None
    return str(code)


def _to_text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, date):  # datetime too
        return value.isoformat()
    if isinstance(value, list):  # e.g. Netzbetreiberzuordnungen, no export column
        return None
    return str(value)


@cache
def _warn_unknown(column: str, value: str) -> None:
    """Once per value: a new catalog entry, add it to codes.py (uv run python -m app.etl.verify_codes --suggest)."""
    log.warning("%s: unknown API value %r, stored as NULL", column, value)
