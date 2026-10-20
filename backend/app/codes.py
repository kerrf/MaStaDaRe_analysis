"""
Catalog codes of the MaStR bulk export (Gesamtdatenexport).

The export stores catalog fields as numeric IDs (e.g. ArtDerSolaranlage = 853), the SOAP API returns an enum value
instead (e.g. "Gebaeudesolaranlage"). The raw tables hold neither: they hold the code's text from the export's
Katalogwerte.xml ("Gebäudesolaranlage"), copied at the end of this file as KATALOG (app/etl/katalog.py). The catalogs
below map ID -> exactly the value the API returns: the nightly update turns the API's values into codes with them, and
the codes into their texts, so rows from the bulk export and rows fetched via the API end up identical in the database.
Which column uses which catalog the export says nowhere: the specs below (CodeSpec) know it, matched against the API.

Verify against the live API (from backend/):  uv run python -m app.etl.verify_codes [solar|wind|water|storage|gas_producer|
                                               gas_storage|biomass|combustion|nuclear|geothermal|consumer|gas_consumer]
Decode a DataFrame from the export:            decode(df, SOLAR)  (or any spec of TABLE_SPECS)

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
    # Columns whose codes count by a list of its own file instead of Katalogwerte.xml: column -> that file (LISTEN)
    texts: dict[str, str] = field(default_factory=dict)

    def api_name(self, column: str) -> str:
        return self.api_names.get(column, column)

    def texts_of(self, column: str) -> dict[int, str]:
        """code -> text, for a column with codes."""
        return LISTEN[self.texts[column]] if column in self.texts else KATALOGWERTE

    def text_of(self, column: str, code: int) -> str | None:
        return self.texts_of(column).get(code)

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
    texts={"EegAnlagentyp": "Einheitentypen"},
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
    texts={"Lokationtyp": "Lokationstypen"},
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
    texts=GRID_CONNECTION_POINT.texts,
)

# The Lokationen (Lokationen.xml): their units and Netzanschlusspunkte as numbers, not codes ("SEE…, SEE…")
LOCATION = CodeSpec(
    columns={"Lokationtyp": LOKATIONTYP}, not_in_api=("Lokationtyp",), texts={"Lokationtyp": "Lokationstypen"}
)

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
    texts={"Marktfunktion": "Marktfunktionen"},
)

# The plants (Anlagen) of the EEG and of the KWK (Kraft-Wärme-Kopplung): what the law counts per plant, e.g. the installed
# power of all its units, or its heat. Each names its units as numbers ("SEE…, SEE…"), not codes; a unit names its plants
# (EegMaStRNummer, KwkMaStRNummer).
EEG_PLANT_API_NAMES = {"EegMaStRNummer": "EegMastrNummer"}

# AnlagenEegBiomasse, GetAnlageEegBiomasse
BIOMASS_EEG_PLANT = CodeSpec(
    columns={"AnlageBetriebsstatus": EINHEIT_BETRIEBSSTATUS},
    multi=frozenset({"VerknuepfteEinheitenMaStRNummern"}),
    booleans=(
        "AusschliesslicheVerwendungBiomasse",
        "AusschreibungZuschlag",
        "BiogasInanspruchnahmeFlexiPraemie",
        "BiogasLeistungserhoehung",
    ),
    api_names={**EEG_PLANT_API_NAMES, "BiogasHoechstbemessungsleistung": "Hoechstbemessungsleistung"},
)

# AnlagenEegGeothermieGrubengasDruckentspannung, GetAnlageEegGeothermieGrubengasDruckentspannung
GEOTHERMAL_EEG_PLANT = CodeSpec(
    columns={"AnlageBetriebsstatus": EINHEIT_BETRIEBSSTATUS},
    multi=frozenset({"VerknuepfteEinheitenMaStRNummern"}),
    api_names=EEG_PLANT_API_NAMES,
)

# AnlagenKwk, GetAnlageKwk: electrical and thermal power of the plant, in kW. Its units are biomass, combustion and
# geothermal units.
KWK_PLANT = CodeSpec(
    columns={"AnlageBetriebsstatus": EINHEIT_BETRIEBSSTATUS},
    multi=frozenset({"VerknuepfteEinheitenMaStRNummern"}),
    booleans=("AusschreibungZuschlag",),
)

# raw table -> how its export file and the API differ (db_migrate.EXPORT_FILES names the file)
TABLE_SPECS = {
    "solar_units": SOLAR,
    "wind_units": WIND,
    "water_units": WATER,
    "storage_units": STORAGE,
    "storage_plants": STORAGE_PLANT,
    "gas_producer_units": GAS_PRODUCER,
    "gas_storage_units": GAS_STORAGE,
    "gas_storage_plants": GAS_STORAGE_PLANT,
    "biomass_units": BIOMASS,
    "biomass_eeg_plants": BIOMASS_EEG_PLANT,
    "combustion_units": COMBUSTION,
    "nuclear_units": NUCLEAR,
    "geothermal_units": GEOTHERMAL,
    "geothermal_eeg_plants": GEOTHERMAL_EEG_PLANT,
    "kwk_plants": KWK_PLANT,
    "consumer_units": CONSUMER,
    "gas_consumer_units": GAS_CONSUMER,
    "grids": GRID,
    "grid_operators": GRID_OPERATOR,
    "locations": LOCATION,
    "grid_connection_points": GRID_CONNECTION_POINT,
}


# ============================================================ decoding: the export's codes into their texts

# What separates the texts of a column with several codes (the export: "813, 3186"): many texts have commas themselves
SEPARATOR = "; "


def to_texts(row: dict[str, str | None], spec: CodeSpec) -> dict[str, str | None]:
    """A row of the export (db_migrate) with the codes of its catalog columns as their texts, in place. A code without
    a text stays as it is (logged once)."""
    for column in spec.columns:
        raw = row.get(column)
        if raw is not None:
            row[column] = _texts(raw, column, spec)
    return row


def decode(df: pd.DataFrame, spec: CodeSpec = SOLAR) -> pd.DataFrame:
    """Copy of df (rows of the export) with the codes of its catalog columns as their texts, and 0/1 as False/True."""
    out = df.copy()
    for column in spec.columns:
        if column in out:
            out[column] = out[column].map(partial(_texts, column=column, spec=spec), na_action="ignore")
    for column in spec.booleans:
        if column in out:
            out[column] = pd.to_numeric(out[column], errors="coerce").map({0: False, 1: True}).astype("boolean")
    return out


def _texts(raw, column: str, spec: CodeSpec) -> str | None:
    """The text of a cell's code, or (a column with several) the texts of its codes."""
    if column not in spec.multi:
        return _text(str(raw).strip(), column, spec)
    # A few lists end with a comma in the export (the Länder of a grid: "332, …, 345, ")
    parts = [part.strip() for part in str(raw).split(",") if part.strip()]
    return SEPARATOR.join(_text(part, column, spec) for part in parts) or None


def _text(code: str, column: str, spec: CodeSpec) -> str:
    if code.endswith(".0"):  # a code that went through a float (pandas)
        code = code[:-2]
    if not code.isdigit():  # a text already
        return code
    text = spec.text_of(column, int(code))
    if text is None:
        _warn_unknown_code(column, code)
        return code
    return text


# ============================================================ encoding: the API's values into the same texts

# The export only says whether street and house number were found for units with a public location (coordinates)
ADDRESS_FLAGS = ("StrasseNichtGefunden", "HausnummerNichtGefunden", "Hausnummer_nv")


def encode(unit: dict, spec: CodeSpec) -> dict[str, str | None]:
    """One unit from the API (the answer of a detail call) as a row of the raw tables: the export's row, with the
    texts of its codes.

    The API's values become codes again (the catalogs above) and the codes their texts (KATALOG), True/False become 1/0,
    dates ISO strings, and every field gets the export's column name. Fields without an export column (e.g.
    Netzbetreiberzuordnungen) stay in, whoever stores the row picks the columns it has.
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
            # A code newer than the catalogs here: its text as the API has it
            row[column] = (spec.text_of(column, value["Id"]) or value["Wert"]) if value["Wert"] is not None else None
        elif column in spec.multi and isinstance(value, list):
            texts = [_api_text(column, v, spec) for v in value]
            row[column] = SEPARATOR.join(text for text in texts if text) or None
        elif column in spec.columns:
            row[column] = _api_text(column, value, spec)
        elif column in spec.dates_with_time and value is not None:
            row[column] = f"{value.isoformat()}T00:00:00"
        else:
            row[column] = _to_text(value)

    if "Laengengrad" in unit and row.get("Laengengrad") is None:  # units, not grid operators or points
        row.update(dict.fromkeys(ADDRESS_FLAGS))
    return row


def _api_text(column: str, value: str | None, spec: CodeSpec) -> str | None:
    """The text of the API's value of a catalog column: its code's."""
    if value is None:
        return None
    code = spec._codes[column].get(value)
    if code is None:
        _warn_unknown(column, value)
        return None
    return _text(str(code), column, spec)


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


@cache
def _warn_unknown_code(column: str, code: str) -> None:
    """Once per code: one the catalogs of the export don't have (a newer export: uv run python -m app.etl.katalog)."""
    log.warning("%s: code %s has no text in KATALOG, stored as it is", column, code)


# ------------------------------------------------ catalogs of the export: written by app/etl/katalog.py, not by hand
# From Gesamtdatenexport_20260926_26.1: Katalogkategorien.xml and Katalogwerte.xml as KATALOG (catalog -> its name and
# its values, {code: text}; a code is unique across all catalogs), and the lists of their own files.
# fmt: off
KATALOG_EXPORT = "Gesamtdatenexport_20260926_26.1"

KATALOG = {
    1: ("Energieträger", {
        1: "andere Gase",
        2: "Biomasse",
        3: "Braunkohle",
        5: "Erdgas",
        6: "Geothermie",
        7: "Grubengas",
        8: "Kernenergie",
        9: "Klärschlamm",
        12: "Mineralölprodukte",
        13: "nicht biogener Abfall",
        14: "Solare Strahlungsenergie",
        15: "Solarthermie",
        16: "Speicher",
        17: "Steinkohle",
        18: "Wärme",
        19: "Wind",
        1539: "Wasser",
        2959: "Druck aus Gasleitungen",
        2960: "Druck aus Wasserleitungen",
    }),
    2: ("Sparte", {
        20: "Strom",
        21: "Gas",
    }),
    3: ("Anlagenart", {
        22: "Gasanlage",
        23: "Netzersatzanlage",
        24: "Stromspeicher ohne Wasserkraft",
        25: "Stromverbrauchsanlage",
        26: "Solaranlage",
        27: "Sonstige Anlage",
        28: "Verbrennungsanlage",
        29: "Wasserkraftanlage",
        30: "Windanlage",
        520: "Gasverbrauchsanlage",
    }),
    4: ("Betriebsstatus", {
        31: "In Planung",
        35: "In Betrieb",
        37: "Vorübergehend stillgelegt",
        38: "Endgültig stillgelegt",
    }),
    5: ("Genehmigungsart", {
        39: "nach BImSchG i.V.m 17. BImSchV",
        40: "Sonstige",
        41: "nach Baurecht",
        845: "nach BImSchG andere",
        846: "nach BImSchG i.V.m 4. BImSchV",
        847: "nach BImSchG i.V.m 1. BImSchV",
        848: "nach BImSchG i.V.m 13. BImSchV",
        2555: "nach Wasserhaushaltsgesetz",
        2556: "nach Windenergie-auf-See-Gesetz",
    }),
    6: ("Land", {
        42: "Afghanistan",
        43: "Ägypten",
        45: "Albanien",
        46: "Algerien",
        48: "Amerikanisch-Samoa",
        49: "Andorra",
        50: "Angola",
        51: "Anguilla",
        53: "Antigua und Barbuda",
        54: "Äquatorialguinea",
        55: "Argentinien",
        56: "Armenien",
        57: "Aruba",
        58: "Aserbaidschan",
        59: "Äthiopien",
        60: "Australien",
        61: "Bahamas",
        62: "Bahrain",
        63: "Bangladesch",
        64: "Barbados",
        65: "Belarus",
        66: "Belgien",
        67: "Belize",
        68: "Benin",
        69: "Bermuda",
        70: "Bhutan",
        71: "Bolivien",
        72: "Bonaire, Saba und St. Eustatius",
        73: "Bosnien und Herzegowina",
        74: "Botsuana",
        76: "Brasilien",
        77: "Britische Jungferninseln",
        79: "Brunei Darussalam",
        80: "Bulgarien",
        81: "Burkina Faso",
        82: "Burundi",
        83: "Cabo Verde",
        84: "Deutschland",
        85: "China",
        86: "Cookinseln",
        87: "Costa Rica",
        88: "Côte D'Ivoire",
        89: "Curacao",
        90: "Dänemark",
        91: "Nepal",
        92: "Demokratische Republik Kongo",
        93: "Demokratische Volksrepublik Korea",
        94: "Chile",
        95: "Dominica",
        96: "Dominikanische Republik",
        97: "Dschibuti",
        98: "Ecuador",
        99: "El Salvador",
        100: "Eritrea",
        101: "Estland",
        102: "Falklandinseln",
        104: "Fidschi",
        105: "Finnland",
        106: "Frankreich",
        108: "Französisch-Guayana",
        109: "Französisch-Polynesien",
        110: "Gabun",
        111: "Gambia",
        112: "Georgien",
        113: "Ghana",
        114: "Gibraltar",
        115: "Grenada",
        116: "Griechenland",
        118: "Guadeloupe",
        120: "Guatemala",
        121: "Guyana",
        123: "Guinea",
        124: "Guinea-Bissau",
        125: "Haiti",
        128: "Honduras",
        129: "Hongkong",
        130: "Indien",
        131: "Indonesien",
        133: "Irak",
        134: "Iran",
        135: "Irland",
        136: "Island",
        137: "Israel",
        138: "Italien",
        139: "Jamaika",
        140: "Japan",
        141: "Jemen",
        143: "Jordanien",
        144: "Kaimaninseln",
        145: "Kambodscha",
        146: "Kamerun",
        147: "Kanada",
        148: "Kasachstan",
        149: "Katar",
        150: "Kenia",
        151: "Kirgisistan",
        152: "Kiribati",
        155: "Kolumbien",
        156: "Komoren",
        157: "Kosovo",
        158: "Kroatien",
        159: "Kuba",
        160: "Kuwait",
        161: "Laos",
        162: "Lesotho",
        163: "Lettland",
        164: "Libanon",
        165: "Liberia",
        166: "Libyen",
        167: "Liechtenstein",
        168: "Litauen",
        169: "Luxemburg",
        170: "Macau",
        171: "Madagaskar",
        172: "Malawi",
        173: "Malaysia",
        174: "Malediven",
        175: "Mali",
        176: "Malta",
        177: "Marokko",
        178: "Marshallinseln",
        179: "Martinique",
        180: "Mauretanien",
        181: "Mauritius",
        182: "Mayotte",
        183: "Nordmazedonien",
        184: "Mexiko",
        185: "Mikronesien",
        186: "Moldau",
        187: "Monaco",
        188: "Mongolei",
        189: "Montenegro",
        190: "Montserrat",
        191: "Mosambik",
        192: "Myanmar",
        193: "Namibia",
        194: "Nauru",
        195: "Neukaledonien",
        196: "Neuseeland",
        197: "Nicaragua",
        198: "Niederlande",
        199: "Niger",
        200: "Nigeria",
        203: "Norfolkinsel",
        204: "Norwegen",
        205: "Oman",
        206: "Österreich",
        207: "Pakistan",
        208: "Palau",
        209: "Panama",
        210: "Papua-Neuguinea",
        211: "Paraguay",
        212: "Peru",
        213: "Philippinen",
        214: "Pitcairninseln",
        215: "Polen",
        216: "Portugal",
        218: "Republik Kongo",
        219: "Republik Korea",
        220: "Réunion",
        221: "Ruanda",
        222: "Rumänien",
        223: "Russische Föderation",
        224: "Salomonen",
        225: "Sambia",
        226: "Samoa",
        227: "San Marino",
        228: "São Tomè und Principe",
        229: "Saudi-Arabien",
        230: "Schweden",
        231: "Schweiz",
        232: "Senegal",
        233: "Serbien",
        234: "Seychellen",
        235: "Sierra Leone",
        236: "Simbabwe",
        237: "Singapur",
        238: "Slowakei",
        239: "Slowenien",
        240: "Somalia",
        241: "Spanien",
        242: "Sri Lanka",
        243: "St. Barthélemy",
        244: "St. Helena, Ascension und Tristan da Cunha",
        245: "St. Kitts Und Nevis",
        246: "St. Lucia",
        247: "Saint-Martin",
        248: "Sint Maarten",
        249: "St. Pierre und Miquelon",
        250: "St. Vincent und die Grenadinen",
        251: "Südafrika",
        252: "Sudan",
        253: "Südgeorgien+Südl. Sandwichinseln",
        254: "Südsudan",
        255: "Suriname",
        257: "Eswatini",
        258: "Syrien",
        259: "Tadschikistan",
        261: "Tansania",
        262: "Thailand",
        263: "Timor-Leste",
        264: "Togo",
        266: "Tonga",
        267: "Trinidad und Tobago",
        268: "Tschad",
        269: "Tschechische Republik",
        270: "Tunesien",
        271: "Türkei",
        272: "Turkmenistan",
        273: "Turks- und Caicosinseln",
        274: "Tuvalu",
        275: "Uganda",
        276: "Ukraine",
        277: "Ungarn",
        278: "Uruguay",
        279: "Usbekistan",
        1273: "Vanuatu",
        1274: "Vatikanstadt",
        1275: "Venezuela",
        1276: "Vereinigte Arabische Emirate",
        1277: "Vereinigte Staaten von Amerika",
        1278: "Vereinigtes Königreich",
        1279: "Vietnam",
        1280: "Wallis und Futuna",
        1283: "Zentralafrikanische Republik",
        1284: "Zypern",
    }),
    7: ("Anrede", {
        280: "Familie",
        2966: "Eheleute",
        2983: "Erbengemeinschaft",
        2984: "Andere Organisation mit Personenbezug",
        3251: "Natürliche Person",
        3252: "Lebensgemeinschaft",
    }),
    14: ("Bundesland", {
        332: "Brandenburg",
        333: "Berlin",
        334: "Baden-Württemberg",
        335: "Bayern",
        336: "Bremen",
        337: "Hessen",
        338: "Hamburg",
        339: "Mecklenburg-Vorpommern",
        340: "Niedersachsen",
        341: "Nordrhein-Westfalen",
        342: "Rheinland-Pfalz",
        343: "Schleswig-Holstein",
        344: "Saarland",
        345: "Sachsen",
        346: "Sachsen-Anhalt",
        347: "Thüringen",
    }),
    15: ("Spannungsebene", {
        348: "Höchstspannung",
        349: "Umspannebene Höchstspannung/Hochspannung",
        350: "Hochspannung",
        351: "Umspannebene Hochspannung/Mittelspannung",
        352: "Mittelspannung",
        353: "Umspannebene Mittelspannung/Niederspannung",
        354: "Niederspannung (= Hausanschluss/Haushaltsstrom)",
    }),
    16: ("Rechtsform", {
        407: "a.s.",
        408: "AB",
        409: "AG",
        410: "AG & Co. KGaA",
        411: "Anstalt des öffentlichen Rechts",
        412: "ApS",
        413: "AS",
        414: "BV",
        415: "BVBA",
        416: "d.n.o.",
        423: "eG",
        424: "e.K.",
        425: "e.V.",
        426: "Eigenbetrieb",
        427: "Einzelunternehmen",
        428: "GbR",
        429: "GmbH",
        430: "GmbH & Co. KG",
        431: "GmbH & Co. KGaA",
        432: "GmbH & Co. oHG",
        433: "HB",
        434: "I/S",
        435: "InvAG",
        436: "k.s.",
        437: "KB",
        438: "KG",
        439: "KGaA",
        440: "Körperschaft des öffentlichen Rechts",
        441: "Ltd.",
        442: "N.V.",
        443: "oHG",
        444: "OY",
        445: "Partnergesellschaft",
        446: "plc",
        447: "S.A.",
        448: "S.p.A.",
        449: "s.r.l.",
        450: "s.r.o.",
        451: "SARL",
        452: "SE",
        453: "SLNE",
        454: "sp. z.o.o.",
        455: "Sp.k.",
        456: "SPRL",
        457: "Stiftung  des öffentlichen Rechts",
        458: "Stiftung des Privatrechts",
        459: "Teo",
        460: "UG (haftungsbeschränkt)",
        461: "UG (haftungsbeschränkt) & Co. KG",
        462: "UG (haftungsbeschränkt) & Co. oHG",
        463: "VOF",
        464: "VVaG",
        465: "Sonstige",
        466: "gGmbH",
        1001674: "SE ＆ Co. KG",
        1001685: "B.V.",
        1001686: "eGbR",
    }),
    18: ("MaStR-Zugangs-Status", {
        467: "unvollständig",
        468: "ungeprüft",
        469: "aktiviert",
        470: "deaktiviert",
        471: "gelöscht",
    }),
    19: ("Systemstatus", {
        472: "Aktiviert",
        473: "Deaktiviert",
        484: "Ungeprüft",
        490: "Unvollständig",
        572: "Gelöscht",
    }),
    20: ("Marktakteurstatus", {
        485: "unvollständig",
        486: "ungeprüft",
        487: "aktiviert",
        488: "deaktiviert",
        489: "gelöscht",
        1676: "erfasst",
        2980: "irreversibel gelöscht",
    }),
    21: ("Solaranlage Nachgeführt", {
        492: "1-Achsig",
        493: "2-Achsig",
    }),
    22: ("Solaranlaege Anlagentyp", {
        494: "Freifläche",
        495: "Aufdach",
        496: "Sonstiges",
    }),
    23: ("Marktfunktionsstatus", {
        497: "aktiv",
        498: "inaktiv",
    }),
    25: ("Stilllegungsart", {
        500: "Vorübergehend",
        501: "Endgültig",
    }),
    26: ("Leistungsänderungsart", {
        2397: "Inbetriebnahme",
        2398: "Veränderung",
    }),
    27: ("Personenart", {
        517: "Organisation (Unternehmen, Personengesellschaft, juristische Person, Behörde, Verband)",
        518: "Natürliche Person oder Organisation mit Personenbezug (z. B. Eheleute, Erbengemeinschaft, GbR mit Personenbezug)",
    }),
    28: ("BrennstoffTechnologieNetzersatz", {
        521: "Gas",
        522: "Diesel",
        523: "Batterie",
    }),
    29: ("StromspeicherOhneWasserkraft", {
        524: "Batterie",
        525: "Druckluft",
        526: "Schwungrad",
        1537: "Pumpspeicher",
        3067: "Wasserstoffspeicher",
    }),
    30: ("TechnologieVerbrennungsanlagenMitGas", {
        529: "Kondensationsmaschine-Gegendruckmaschine",
        530: "Entnahmekondensationsmaschine",
        531: "Gasturbinen ohne Abhitzekessel",
        532: "Gasturbinen mit Abhitzekessel",
        533: "Gasturbinen mit nachgeschalteter Dampfturbine",
        534: "Verbrennungsmotor",
        535: "Brennstoffzelle",
        536: "Stirlingmotor",
        537: "Dampfmotor",
        538: "ORC-Anlage",
        539: "Konsensationsmaschinen",
    }),
    31: ("TechnologieVerbrennungsanlagen", {
        542: "Verbrennungsmotor",
        543: "Brennstoffzelle",
        544: "Stirlingmotor",
        545: "Dampfmotor",
        546: "ORC (Organic Rankine Cycle)-Anlage",
        833: "Gegendruckmaschine mit Entnahme",
        834: "Gegendruckmaschine ohne Entnahme",
        835: "Gasturbinen ohne Abhitzekessel",
        836: "Gasturbinen mit Abhitzekessel",
        837: "Gasturbinen mit nachgeschalteter Dampfturbine",
        838: "Kondensationsmaschine mit Entnahme",
        839: "Kondensationsmaschine ohne Entnahme",
        840: "Sonstige",
        1538: "Kalina-Cycle",
    }),
    32: ("Brennstoff", {
        548: "Nicht biogener Müll",
        549: "Biogener Müll",
        550: "Braunkohle",
        551: "Deponiegas",
        552: "Erdgas",
        553: "Geothermie",
        554: "Grubengas",
        555: "Klärgas",
        556: "Mehrere Energieträger (nicht erneuerbar)",
        557: "Mineralölprodukte",
        558: "Solare Strahlungsenergie",
        559: "Sonstige",
        560: "Steinkohle",
        561: "Wasserstoff",
        841: "Raffineriegas",
        842: "Hochofen-/ und Kokereigas",
        843: "Keiner",
        844: "Kernenergie",
    }),
    33: ("Solarneigungswinkel", {
        806: "90 Grad (vertikal)",
        807: "61 - 89 Grad",
        808: "41 - 60 Grad",
        809: "21 - 40 Grad",
        810: "5 - 20 Grad",
        811: "Nachgeführt",
        3179: "unter 5 Grad (horizontal)",
    }),
    34: ("Solarausrichtung", {
        695: "Nord",
        696: "Nord-Ost",
        697: "Ost",
        698: "Süd-Ost",
        699: "Süd",
        700: "Süd-West",
        701: "West",
        702: "Nord-West",
        703: "nachgeführt",
        704: "Ost-West",
    }),
    35: ("Eigenerzeugung", {
        568: "Eigenerzeugung mit Netzdurchleitung und räumlichen Zusammenhang",
        569: "Eigenerzeugung ohne Netzdurchleitung und ohne räumlichen Zusammenhang",
        570: "Eigenerzeugung ohne Netzdurchleitung",
    }),
    36: ("Prüfungsstatus", {
        579: "ungeprüft",
        580: "geprüft",
        581: "In Prüfung (Anlagenbetreiber)",
        582: "In Klärung (Anlagenbetreiber)",
        600: "In Prüfung (Netzbetreiber)",
        601: "In Prüfung (Bundesnetzagentur)",
        602: "In Klärung (Netzbetreiber)",
        603: "In Klärung (Bundesnetzagentur)",
        2387: "unvollständig",
    }),
    39: ("Seelage", {
        639: "Ostsee",
        640: "Nordsee",
    }),
    40: ("ErtüchtigungsmaßnahmeWasserkraft", {
        792: "Austausch von Generatoren, Getrieben, Turbinen oder Laufrädern",
        793: "Erweiterung der Anlage durch Erhöhung des Ausbaudurchflusses und/oder der Fallhöhe",
        794: "Automatische Wasserstandsregelung",
        795: "Automatische Rechenreinigung",
        796: "Automatische Einsatzoptimierung bei Kraftwerken mit mehreren Turbinen",
        797: "Einsatz permanent erregter Generatoren",
        798: "Sonstige",
        1534: "Verbesserung der Zu- und Abströmung (Hydraulik-Turbinenzuströmung, Ober- und Unterwasserkanal)",
    }),
    41: ("FesteBiomasseEinsatzstoffe", {
        641: "Altholz",
        642: "Industrierestholz",
        643: "Sägewerksnebenprodukte",
        644: "Waldrestholz",
        645: "Landschaftspflegeholz",
    }),
    42: ("FluessigeBiomasseEinsatzstoffe", {
        646: "Pflanzenöl",
        647: "Palmöl",
    }),
    43: ("GasfoermigeBiomasseEinsatzstoffe", {}),
    46: ("Gasspeicherart", {
        658: "Kavernenspeicher",
        659: "Porenspeicher",
        660: "Aquiferspeicher",
    }),
    48: ("Präqualleistung", {
        670: "Sofort",
        671: "Schnell",
        672: "Temporär",
        673: "Befristet",
    }),
    51: ("Fernsteuerbarkeit", {
        685: "durch Netzbetreiber",
        686: "durch Direktvermarkter",
        687: "durch Dritte",
    }),
    52: ("Einspeisungsart", {
        688: "Volleinspeisung",
        689: "Teileinspeisung (einschließlich Eigenverbrauch)",
    }),
    53: ("Windanlagentechnologie", {
        691: "Horizontalläufer",
        692: "Vertikalläufer",
        3102: "Flugwindenergieanlage",
    }),
    54: ("Genehmigungsauflagenart", {}),
    55: ("Systemkopplung", {
        693: "AC gekoppeltes System",
        694: "DC gekoppeltes System",
    }),
    56: ("SolarFlächenMerkmale", {
        709: "Konversionsfläche",
        710: "Randstreifen längs von Autobahnen oder Schienenwegen",
        711: "Fläche wird landwirtschaftlich genutzt",
        712: "Versiegelte Fläche",
        812: "Im Bebauungsplan vor 01.01.2010 als Gewerbe- oder Industriegebiet ausgewiesen",
        813: "Bebauungsplan vor 01.09.2003 und nicht geändert",
        815: "Eigentum des Bundes oder Besitz oder Verwaltung des Bundesamtes für Immobilienaufgaben",
        2965: "Einheit auf einer sonstigen baulichen Anlage",
        3057: "Fläche ist ein wiedervernässter Moorboden",
        3180: "Fläche wird als Parkplatz genutzt",
        3181: "Besondere Solaranlage: Die Anlage genügt den Anforderungen der maßgeblichen Festlegung der Bundesnetzagentur nach § 85c EEG",
        3182: "Planfeststellungsverfahren oder sonstiges Verfahren nach § 38 BauGB",
        3183: "Benachteiligtes Gebiet",
        3184: "Einheit an einer Lärmschutzwand",
        3185: "Einheit an einem Zaun",
        3186: "Kein zusätzliches Merkmal",
    }),
    57: ("SolarNutzungsbereich", {
        713: "Haushalt",
        714: "Gewerbe, Handel und Dienstleistungen",
        715: "Industrie",
        716: "Landwirtschaft",
        717: "Öffentliches Gebäude",
        718: "Sonstige",
    }),
    58: ("Biomassart", {
        719: "Flüssige Biomasse",
        720: "Feste Biomasse",
        721: "Gasförmige Biomasse",
    }),
    59: ("Verstromungsart", {
        722: "Vor Ort verstromt",
        723: "Biomethan",
    }),
    60: ("BrennstoffBiomasse", {}),
    61: ("Zuflussart", {
        724: "Flusskraftwerk",
        725: "Restwasserkraftwerk",
        726: "Ausleitungskraftwerk",
    }),
    62: ("Batterietechnologie", {
        727: "Lithium-Batterie",
        728: "Blei-Batterie",
        729: "Redox-Flow-Batterie",
        730: "Hochtemperaturbatterie",
        731: "Nickel-Cadmium- / Nickel-Metallhydridbatterie",
        732: "Sonstige Batterie",
    }),
    63: ("Einsatzort", {
        733: "Flughafen",
        734: "Krankenhaus",
        735: "Veranstaltungsgebäude",
        736: "Rechenzentrum",
        737: "Industrie",
        738: "Bahn",
        739: "Bank",
        740: "Hotel",
        741: "Hochhaus",
        742: "Kaufhaus",
        743: "Kraftwerk",
        744: "Kultur und Messe",
        745: "Mastbetrieb",
        746: "Militär, Polizei und Justiz",
        747: "Regierungsgebäude",
        748: "Wasser- und Klärwerk",
        749: "Wohngebäude",
        750: "Versicherung",
        751: "Verlagshaus",
        752: "Tunnel und Straßen",
        753: "Telekommunikationsbranche",
        754: "Sportstätte",
        755: "Sendeanstalt",
        1531: "Alten-/Pflegeheim",
        1532: "Bergbau",
        1533: "Logistikzentrum (z.B. Kühlhaus)",
        2399: "Haushalt",
        2400: "Sonstige",
    }),
    64: ("Bilanzierungsgebiet", {}),
    65: ("Regelzone", {
        1000001: "50Hertz",
        1000010: "Amprion",
        1001564: "TenneT",
        1001572: "TransnetBW",
    }),
    66: ("Gasart", {
        761: "Biomethan",
        762: "Erdgas",
        763: "Wasserstoff",
    }),
    67: ("Marktgebiet", {
        1536: "Beide",
        1001666: "NetConnect Germany",
        1001667: "Trading Hub Europe",
    }),
    68: ("Gasqualität", {
        766: "L-Gas",
        767: "H-Gas",
    }),
    69: ("Netzart", {
        768: "Fernleitungsnetz",
        769: "Verteilernetz",
    }),
    74: ("WindHersteller", {
        1571: "ABB Power-One Italy SpA",
        1572: "Adwen GmbH",
        1573: "Alpha projekt GmbH",
        1574: "ALPHACON GmbH",
        1575: "Amperax Energie GmbH",
        1576: "Anhui Hummer Dynamo Co.,Ltd.",
        1577: "AN-Maschinenbau- und Umweltschutzanlagen GmbH",
        1578: "AREVA GmbH",
        1579: "Autoflug GmbH",
        1580: "awinco Ingenieur GmbH & Co. KG",
        1581: "BARD Holding GmbH",
        1582: "BRAUN Windturbinen GmbH",
        1583: "BWE Service GmbH",
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
        1600: "Hermann Brümmer Wind- und Wasserkraftanlagen KG",
        1601: "Heyde Windtechnik GmbH",
        1602: "Honeywell Windtronics",
        1603: "Husumer Dock und Reparatur GmbH & Co. KG",
        1604: "Hyden",
        1605: "InVentus Energie GmbH",
        1606: "JAMP GmbH",
        1607: "Jenny AG",
        1608: "K.D.-Stahl- und Maschinenbau GmbH",
        1609: "Kähler Maschinenbau GmbH",
        1610: "Kenersys Europe GmbH",
        1611: "Kessler Energy GmbH",
        1612: "Kleinwind GmbH",
        1613: "Krogmann GmbH & Co. KG",
        1614: "Lagerwey GmbH",
        1615: "Lely Aircon B.V. Niederlassung Leer",
        1616: "Levento power solutions GmbH & Co. KG",
        1617: "LN Glasfieber",
        1618: "Loosen Windkraft GmbH",
        1619: "LuvSide GmbH",
        1620: "LWS systems GmbH & Co. KG.",
        1621: "Mischtechnik Hoffmann & Partner GmbH",
        1622: "Mroz",
        1623: "myLEDsun",
        1624: "MyWind",
        1625: "NEG Micon Deutschland GmbH",
        1626: "Norddeutsche H-Rotoren GmbH & Co. KG",
        1627: "Nordex Energy GmbH",
        1628: "Nordex SE",
        1629: "Octopus Systems GmbH",
        1630: "Pfleiderer Deutschland GmbH",
        1631: "Pfleiderer Wind Energy GmbH",
        1632: "plenum gesellschaft für ganzheitlich nachhaltige entwicklung gmbh",
        1633: "PowerWind GmbH",
        1634: "PSW-Energiesysteme GmbH",
        1635: "QREON GmbH",
        1636: "RLE INTERNATIONAL Produktentwicklungsgesellschaft mit beschränkter Haftung",
        1637: "ROPATEC SRL",
        1638: "RS - Energietechnik GmbH",
        1639: "S & W ENERGIESYSTEME UG (haftungsbeschränkt)",
        1640: "SB Energy UK Ltd.",
        1641: "Schuler Aktiengesellschaft",
        1642: "Schütz GmbH & Co. KGaA",
        1643: "SeeBA Energiesysteme GmbH",
        1644: "SEEWIND Windenergiesysteme GmbH",
        1645: "Senvion Deutschland GmbH",
        1646: "Siemens Wind Power GmbH & Co. KG",
        1647: "SMA Solar Technology AG",
        1648: "SMG POLAND SP Z O O",
        1649: "SOLAR-WIND-TEAM GmbH",
        1650: "Stadtwerke Wedel GmbH",
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
        1662: "VWT Power Ltd",
        1663: "Wenus Inventus",
        1664: "Werner Eberle GmbH",
        1665: "WES IBS GmbH",
        1666: "Wind Technik Nord GmbH",
        1667: "Wind+Wing Technologies",
        1668: "Windenergie GmbH",
        1669: "Windmanufactur GbR",
        1670: "windradshop",
        1671: "WindTec GmbH",
        1672: "Wittenbauer Technik & Consulting GmbH",
        1673: "Wolf Energy GmbH",
        1674: "WSD - Windsysteme",
        1675: "WTT GmbH",
        2554: "Sonstige",
        2872: "Dethloff & Lange GmbH",
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
        2895: "Procon Energiesysteme GmbH",
        2896: "Wincon West Wind A/S",
        2897: "Euroturbine B.V.",
        2898: "Aeolos Windkraftanlagen",
        2899: "Fortis Wind Energy",
        2900: "Nova-Wind GmbH",
        2901: "PreVent GmbH",
        2902: "SkyWind GmbH",
        2903: "Smart Power Electronics GmbH",
        2904: "Weinack Windenergie Anlagen GmbH",
        2905: "Qiangsheng Magnets Co.Ltd",
        2929: "MHI Vestas Offshore Wind",
        1001671: "AN Windanlagen GmbH",
        1001678: "E.A.Z. Wind GmbH",
        1001679: "Siemens Gamesa Renewable Energy GmbH & Co. KG",
        1001681: "MAX-wyn GmbH",
        1001682: "Nordex Germany GmbH",
        1001683: "Zentrum für Sonnenenergie- und Wasserstoff-Forschung Baden-Württemberg (ZSW)",
        1001684: "eno energy systems GmbH",
        1001687: "SkySails Power GmbH",
        1001688: "EnerKíte GmbH",
        1001689: "Kite Gen Research S.r.l.",
        1001690: "Joby Aviation, Inc.",
        1001691: "AIRCON GmbH ＆ Co. KG",
        1001692: "AN Bonus",
        1001693: "Brümmer",
        1001694: "Conergy Wind GmbH",
        1001695: "EU Energy GmbH",
        1001696: "GfE Gesellschaft für Energietechnik mbH",
        1001697: "GET Danwin",
        1001698: "Innovative Windpower AG",
        1001699: "Siemens AG",
        1001700: "UniEnergy GmbH",
        1001701: "windwise GmbH",
    }),
    75: ("WindTyp", {}),
    76: ("SolarLeistungsbegrenzung", {
        802: "Nein",
        803: "Ja, auf 70%",
        804: "Ja, auf 60%",
        805: "Ja, auf 50%",
        1535: "Ja, sonstige",
    }),
    77: ("GasQuelle", {
        816: "Biogas",
        817: "Deponiegas",
        818: "Klärgas",
    }),
    78: ("NetzersatzTechnologie", {
        819: "Brennstoffbasiert",
        820: "Batterie",
        821: "Sonstiges",
    }),
    79: ("NetzersatzBetriebsart", {
        822: "Reiner Inselbetrieb",
        823: "Netzparallelbetrieb",
    }),
    80: ("TechnologieGasErzeugung", {
        824: "Förderung fossilen Erdgases",
        825: "Biomethan-Erzeugung",
        826: "Power-to-Gas (Wasserstoff)",
        827: "Power-to-Gas (Methan)",
        829: "Liquefied Natural Gas",
    }),
    81: ("SonstigeBrennstoff", {
        830: "Geothermie",
        831: "Solarthermie",
        832: "Grubengas",
    }),
    82: ("Art der Solaranlage", {
        852: "Freiflächensolaranlage",
        853: "Gebäudesolaranlage",
        2484: "Sonstige Solaranlage",
        2961: "Steckerfertige Solaranlage (sog. Balkonkraftwerk)",
    }),
    83: ("SonstigeTechnologie", {
        854: "ORC-Anlage",
        855: "Kalina",
        856: "Sonstige",
        857: "Gegendruckmaschine mit Entnahme",
        858: "Gegendruckmaschine ohne Entnahme",
        859: "Gasturbinen ohne Abhitzekessel",
        860: "Gasturbinen mit Abhitzekessel",
        861: "Gasturbinen mit nachgeschalteter Dampfturbine",
        862: "Verbrennungsmotor",
        863: "Brennstoffzelle",
        864: "Stirlingmotor",
        865: "Dampfmotor",
        866: "Kondensationsmaschine mit Entnahme",
        867: "Kondensationsmaschine ohne Entnahme",
    }),
    87: ("Wind an Land oder auf See", {
        888: "Windkraft an Land",
        889: "Windkraft auf See",
    }),
    88: ("Art der Wasserkraftanlage", {
        890: "Laufwasseranlage",
        891: "Speicherwasseranlage",
        894: "Wasserkraftanlage in Trinkwassersystem",
        895: "Wasserkraftanlage in Brauchwassersystem",
        896: "Abwasserkraftanlage",
        897: "Meeresenergie",
    }),
    90: ("Referenzwert", {
        991: "Hauptbrennstoff",
        992: "Weiterer Hauptbrennstoff",
        993: "Weitere Brennstoffe",
        994: "Technologie Geothermie",
        995: "Technologie Solarthermie Gase",
        996: "Genehmigung Verbrennung",
        997: "Genehmigung Biomasse",
        1562: "Brennstoff Biomasse",
        1563: "Energieträger Geo Gruben Solar Klärschlamm",
        1564: "Energieträger Verbrennung",
        1565: "Brennstoff Verbrennung",
    }),
    91: ("Titel", {
        1000: "Dr.",
        1001: "Prof.",
        1002: "Prof. Dr.",
    }),
    92: ("RegisterNummerPräfix", {
        1003: "HRA",
        1004: "HRB",
        1005: "GnR",
        1006: "PR",
        1007: "VR",
        3101: "GsR",
    }),
    93: ("RegisterGericht", {
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
        1053: "Königstein",
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
        1096: "Mönchengladbach",
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
        1349: "Altenburg",
        1350: "Apolda",
        1351: "Arnstadt",
        1352: "Arnstadt Zweigstelle Ilmenau",
        1353: "Bad Salzungen",
        1354: "Eisenach",
        1355: "Erfurt",
        1356: "Gera",
        1357: "Gotha",
        1358: "Greiz",
        1359: "Heilbad Heiligenstadt",
        1360: "Hildburghausen",
        1361: "Homburg",
        1362: "Langenfeld",
        1363: "Lebach",
        1364: "Meiningen",
        1365: "Merzig",
        1366: "Mühlhausen",
        1367: "Neunkirchen",
        1368: "Nordhausen",
        1369: "Ottweiler",
        1370: "Pößneck",
        1371: "Pößneck Zweigstelle Bad Lobenstein",
        1372: "Rudolstadt",
        1373: "Rudolstadt Zweigstelle Saalfeld",
        1374: "Saarlouis",
        1375: "Sömmerda",
        1376: "Sondershausen",
        1377: "Sonneberg",
        1378: "St. Ingbert",
        1379: "St. Wendel",
        1380: "Stadtroda",
        1381: "Suhl",
        1382: "Völklingen",
        1383: "Weimar",
        2871: "Celle",
        2877: "Schleswig",
        2878: "Bernkastel-Kues",
        2879: "Reutlingen",
        2880: "Naumburg",
        1001670: "Böblingen",
        1001672: "Kitzingen",
        1001675: "Konstanz",
        1001676: "Baden Baden",
        1001677: "Verden",
        1001680: "Wesel",
    }),
    94: ("RegionEbene2", {
        1124: "Stuttgart",
        1125: "Karlsruhe",
        1126: "Freiburg",
        1127: "Tübingen",
        1128: "Oberbayern",
        1129: "Niederbayern",
        1130: "Oberpfalz",
        1131: "Oberfranken",
        1132: "Mittelfranken",
        1133: "Unterfranken",
        1134: "Schwaben",
        1135: "Berlin",
        1136: "Brandenburg",
        1137: "Bremen",
        1138: "Hamburg",
        1139: "Darmstadt",
        1140: "Gießen",
        1141: "Kassel",
        1142: "Mecklenburg-Vorpommern",
        1143: "Braunschweig",
        1144: "Hannover",
        1145: "Lüneburg",
        1146: "Weser-Ems",
        1147: "Düsseldorf",
        1148: "Köln",
        1149: "Münster",
        1150: "Detmold",
        1151: "Arnsberg",
        1152: "Koblenz",
        1153: "Trier",
        1154: "Rheinhessen-Pfalz",
        1155: "Saarland",
        1156: "Dresden",
        1157: "Chemnitz",
        1158: "Leipzig",
        1159: "Sachsen-Anhalt",
        1160: "Schleswig-Holstein",
        1161: "Thüringen",
    }),
    95: ("NACEGruppeAbschnitt", {
        1162: "Abschnitt A - Land- und Forstwirtschaft, Fischerei",
        1163: "Abschnitt B - Bergbau und Gewinnung von Steinen und Erden",
        1164: "Abschnitt C – Verarbeitendes Gewerbe",
        1165: "Abschnitt D – Energieversorgung",
        1166: "Abschnitt E – Wasserversorgung; Abwasser- und Abfallentsorgung und Beseitigung von Umweltverschmutzungen",
        1167: "Abschnitt F - Baugewerbe",
        1168: "Abschnitt G - Handel",
        1169: "Abschnitt H – Verkehr und Lagerei",
        1170: "Abschnitt I – Gastgewerbe",
        1171: "Abschnitt J – Verlagswesen, Rundfunk sowie Erstellung und Verbreitung von Medieninhalten",
        1172: "Abschnitt L – Erbringung von Finanz- und Versicherungsdienstleistungen",
        1173: "Abschnitt M – Grundstücks- und Wohnungswesen",
        1174: "Abschnitt N – Erbringung von wissenschaftlichen und technischen Dienstleistungen",
        1175: "Abschnitt O – Erbringung von sonstigen wirtschaftlichen Dienstleistungen",
        1176: "Abschnitt P – Öffentliche Verwaltung, Verteidigung; Sozialversicherung",
        1177: "Abschnitt Q – Erziehung und Unterricht",
        1178: "Abschnitt R – Gesundheits- und Sozialwesen",
        1179: "Abschnitt S – Kunst, Sport und Erholung",
        1180: "Abschnitt T – Erbringung von sonstigen Dienstleistungen",
        1181: "Abschnitt U – Private Haushalte mit Hauspersonal sowie Herstellung von Waren und Erbringung von Dienstleistungen durch private Haushalte für den Eigenbedarf ohne ausgeprägten Schwerpunkt",
        1182: "Abschnitt V – Exterritoriale Organisationen und Körperschaften",
        3125: "Abschnitt K -Telekommunikation, Softwareentwicklung, IT-Beratung und Erbringung sonstiger Dienstleistungen der Informationstechnologie und der Computerinfrastruktur",
    }),
    96: ("NACEGruppeAbteilung", {
        1183: "Landwirtschaft, Jagd und damit verbundene Tätigkeiten",
        1184: "Forstwirtschaft und Holzeinschlag",
        1185: "Fischerei und Aquakultur",
        1186: "Kohlenbergbau",
        1187: "Gewinnung von Erdöl und Erdgas",
        1188: "Erzbergbau",
        1189: "Gewinnung von Steinen und Erden, sonstiger Bergbau",
        1190: "Erbringung von Dienstleistungen für den Bergbau und für die Gewinnung von Steinen und Erden",
        1191: "Herstellung von Nahrungs- und Futtermitteln",
        1192: "Getränkeherstellung",
        1193: "Tabakverarbeitung",
        1194: "Herstellung von Textilien",
        1195: "Herstellung von Bekleidung",
        1196: "Herstellung von Leder, Lederwaren und ähnlichen Produkten aus anderen Materialen",
        1197: "Herstellung von Holz-, Flecht-, Korb- und Korkwaren, ohne Möbel",
        1198: "Herstellung von Papier, Pappe und Waren daraus",
        1199: "Herstellung von Druckerzeugnissen; Vervielfältigung von bespielten Ton-, Bild- und Datenträgern",
        1200: "Kokerei und Mineralölverarbeitung",
        1201: "Herstellung von chemischen Erzeugnissen",
        1202: "Herstellung von pharmazeutischen Erzeugnissen",
        1203: "Herstellung von Gummi- und Kunststoffwaren",
        1204: "Herstellung von Glas und Glaswaren, Keramik, Verarbeitung von Steinen und Erden",
        1205: "Metallerzeugung und -bearbeitung",
        1206: "Herstellung von Metallerzeugnissen",
        1207: "Herstellung von Datenverarbeitungsgeräten, elektronischen und optischen Erzeugnissen",
        1208: "Herstellung von elektrischen Ausrüstungen",
        1209: "Maschinenbau a. n. g.",
        1210: "Herstellung von Kraftwagen und Kraftwagenteilen",
        1211: "Sonstiger Fahrzeugbau",
        1212: "Herstellung von Möbeln",
        1213: "Herstellung von sonstigen Waren",
        1214: "Reparatur, Instandhaltung und Installation von Maschinen und Ausrüstungen",
        1215: "Energieversorgung",
        1216: "Wasserversorgung",
        1217: "Abwasserentsorgung",
        1218: "Sammlung, Behandlung und Beseitigung von Abfällen",
        1219: "Beseitigung von Umweltverschmutzungen und sonstige Tätigkeiten in der Abfallbewirtschaftung",
        1220: "Hochbau",
        1221: "Tiefbau",
        1222: "Vorbereitende Baustellenarbeiten, Bauinstallation und sonstiges Ausbaugewerbe",
        1223: "Handel mit Kraftfahrzeugen; Instandhaltung und Reparatur von Kraftfahrzeugen",
        1224: "Großhandel",
        1225: "Einzelhandel",
        1226: "Landverkehr und Transport in Rohrfernleitungen",
        1227: "Schifffahrt",
        1228: "Luftfahrt",
        1229: "Lagerei sowie Erbringung von sonstigen Dienstleistungen für den Verkehr",
        1230: "Post-, Kurier- und Expressdienste",
        1231: "Beherbergung",
        1232: "Gastronomie",
        1233: "Verlagswesen",
        1234: "Herstellung, Verleih und Vertrieb von Filmen und Fernsehprogrammen; Kinos; Tonstudios und Verlegen von Musik",
        1235: "Rundfunkveranstalter, Nachrichtenagenturen und sonstige Verbreitung von Medieninhalten",
        1236: "Telekommunikation",
        1237: "Erbringung von Dienstleistungen der Informationstechnologie",
        1238: "Datenverarbeitung, Hosting und Erbringung sonstiger Informationsdienstleistungen",
        1239: "Erbringung von Finanzdienstleistungen",
        1240: "Versicherungen, Rückversicherungen und Pensionskassen, ohne Sozialversicherung",
        1241: "Mit Finanz- und Versicherungsdienstleistungen verbundene Tätigkeiten",
        1242: "Grundstücks- und Wohnungswesen",
        1243: "Rechts- und Steuerberatung, Wirtschaftsprüfung",
        1244: "Verwaltung und Führung von Unternehmen und Betrieben; Unternehmensberatung",
        1245: "Tätigkeiten von Architektur- und Ingenieurbüros; technische, physikalische und chemische Untersuchung",
        1246: "Forschung und Entwicklung",
        1247: "Werbung und Marktforschung sowie Public-Relations-Beratung",
        1248: "Sonstige wissenschaftliche und technische Tätigkeiten",
        1249: "Veterinärwesen",
        1250: "Vermietung und Leasing",
        1251: "Vermittlung und Überlassung von Arbeitskräften",
        1252: "Reisebüros, Reiseveranstalter und Erbringung sonstiger Reservierungsdienstleistungen",
        1253: "Wach- und Sicherheitsdienste sowie Detekteien",
        1254: "Gebäudebetreuung; Garten- und Landschaftsbau",
        1255: "Erbringung von wirtschaftlichen Dienstleistungen für Unternehmen und Privatpersonen",
        1256: "Öffentliche Verwaltung, Verteidigung; Sozialversicherung",
        1257: "Erziehung und Unterricht",
        1258: "Gesundheitswesen",
        1259: "Heime, ohne Erholungs- und Ferienheime",
        1260: "Sozialwesen, ohne Heime",
        1261: "Kunstschaffende Tätigkeiten und Tätigkeiten in der darstellenden Kunst",
        1262: "Bibliotheken, Archive, Museen, botanische und zoologische Gärten",
        1263: "Spiel-, Wett- und Lotteriewesen",
        1264: "Erbringung von Dienstleistungen des Sports, der Unterhaltung und der Erholung",
        1265: "Interessenvertretungen sowie kirchliche und sonstige religiöse Vereinigungen, ohne Sozialwesen und Sport",
        1266: "Reparatur und Instandhaltung von Datenverarbeitungsgeräten und Gebrauchsgütern sowie von Kraftwagen und Krafträdern",
        1267: "Erbringung von sonstigen überwiegend persönlichen Dienstleistungen",
        1268: "Private Haushalte mit Hauspersonal",
        1269: "Herstellung von Waren und Erbringung von Dienstleistungen durch private Haushalte für den Eigenbedarf ohne ausgeprägten Schwerpunkt",
        1270: "Exterritoriale Organisationen und Körperschaften",
    }),
    100: ("ArtAbschaltbareLast", {
        1397: "Sofort",
        1398: "Schnell",
        1399: "Temporär befristet",
    }),
    101: ("BundeslaenderEinheiten", {
        1400: "Brandenburg",
        1401: "Berlin",
        1402: "Baden-Württemberg",
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
        1415: "Thüringen",
        1416: "Ausschließliche Wirtschaftszone",
    }),
    102: ("LaenderEinheiten", {
        1434: "Deutschland",
        1435: "Dänemark",
        1436: "Niederlande",
        1437: "Belgien",
        1438: "Luxemburg",
        1439: "Frankreich",
        1440: "Schweiz",
        1441: "Österreich",
        1442: "Polen",
        1443: "Tschechische Republik",
    }),
    103: ("TechnologieKernkraft", {
        1444: "Druckwasserreaktor",
        1445: "Siedewasserreaktor",
    }),
    104: ("TechnologiePumpspeicher", {
        1446: "Pumpspeicheranlage mit natürlichem Zufluss",
        1447: "Pumpspeicheranlage ohne natürlichen Zufluss",
    }),
    105: ("Wechselrichter", {
        1448: "Stromspeicher vorhanden - gemeinsamer Wechselrichter mit Solaranlage",
        1449: "Stromspeicher vorhanden - kein gemeinsamer Wechselrichter mit Solaranlage",
        1450: "Kein Stromspeicher vorhanden",
    }),
    106: ("BrennstoffLage", {
        1451: "Windkraft an Land",
        1452: "Windkraft auf See",
        1453: "Bauliche Anlagen (Hausdach, Gebäude und Fassade)",
        1454: "Bauliche Anlagen (Sonstige)",
        1455: "Freifläche",
        1456: "Abfall, fest, rein biogen",
        1457: "Altholz",
        1458: "Blutmehl",
        1459: "Brennholz",
        1460: "Brennlauge",
        1461: "Feste biogene Stoffe",
        1462: "Holz",
        1463: "Holzhackschnitzel",
        1464: "Holzreste (z.B. Schreinereien)",
        1465: "Holzspäne, Sägemehl",
        1466: "Landschaftspflegeholz",
        1467: "Pellets (Holz)",
        1468: "Rauchspan",
        1469: "Restholz",
        1470: "Rinde",
        1471: "Schleifstaub, biogen",
        1472: "Schwarzlauge",
        1473: "Stroh, Strohpellets",
        1474: "Sulfitablauge",
        1475: "Tierfett",
        1476: "Tiermehl",
        1477: "Warmbrennstoffe (biogener Gewerbeabfall)",
        1478: "Abfall, flüssig, biogen",
        1479: "Biodiesel",
        1480: "Biomethanol",
        1481: "Flüssige biogene Stoffe",
        1482: "Harzöl",
        1483: "Iso-Hexan",
        1484: "Palmöl",
        1485: "Pflanzenöl",
        1486: "Terpentin",
        1487: "Biogas",
        1488: "Biomethan",
        1489: "Deponiegas",
        1490: "Klärgas",
        1491: "Abwasserkraftanlage",
        1492: "Laufwasseranlage",
        1493: "Meeresenergie",
        1494: "Speicherwasseranlage",
        1495: "Wasserkraftanlage in Brauchwassersystem",
        1496: "Wasserkraftanlage in Trinkwassersystem",
        1497: "Geothermie",
        1498: "Solarthermie",
        1499: "Klärschlamm",
        1500: "Grubengas",
        1501: "Kohlenwertstoffe aus Steinkohle",
        1502: "Steinkohlen",
        1503: "Steinkohlenbriketts",
        1504: "Steinkohlenkoks",
        1505: "Braunkohlenbriketts",
        1506: "Braunkohlenkoks",
        1507: "Hartbraunkohlen",
        1508: "Rohbraunkohlen",
        1509: "Staub- und Trockenkohle",
        1510: "Wirbelschichtkohle",
        1511: "Dieselkraftstoff",
        1512: "Heizöl, leicht",
        1513: "Heizöl, schwer",
        1514: "Flüssiggas",
        1515: "Petrolkoks",
        1516: "Raffineriegas",
        1517: "Andere Mineralölprodukte",
        1518: "Erdgas, Erdölgas",
        1519: "Grubengas",
        1520: "Hochofengas, Konvertergas",
        1521: "Kokereigas",
        1522: "Andere Gase",
        1523: "Sonstige hergestellte Gase",
        1524: "Industrieabfall",
        1525: "Abfall (Hausmüll, Siedl.abf.)",
        1526: "Dampf (zum Beispiel Prozesswärme)",
        1527: "Dampf (fremdbezogen)",
        1528: "Wärme",
        1529: "Kernenergie",
        1530: "Speicher",
    }),
    107: ("ClusterOstsee", {
        1540: "O-1",
        1541: "O-2",
        1542: "O-3",
        1543: "O-4",
        1544: "O-5",
        2962: "kein Gebiet nach dem Flächenentwicklungsplan des BSH",
        2970: "O-6",
    }),
    108: ("ClusterNordsee", {
        1546: "N-1",
        1547: "N-2",
        1548: "N-3",
        1549: "N-4",
        1550: "N-5",
        1551: "N-6",
        1552: "N-7",
        1553: "N-8",
        1554: "N-9",
        1555: "N-10",
        1556: "N-11",
        1557: "N-12",
        1558: "N-13",
        2963: "kein Gebiet nach dem Flächenentwicklungsplan des BSH",
    }),
    131: ("Standortangabe", {
        2385: "Postalische Adresse",
        2386: "Über Flurdaten",
    }),
    132: ("Energieträger (GSGK)", {
        2403: "Geothermie",
        2404: "Solarthermie",
        2405: "Klärschlamm",
        2406: "Grubengas",
        2957: "Druck aus Gasleitungen",
        2958: "Druck aus Wasserleitungen",
    }),
    133: ("Energieträger (Verbrennung)", {
        2407: "Steinkohle",
        2408: "Braunkohle",
        2409: "Mineralölprodukte",
        2410: "Erdgas",
        2411: "andere Gase",
        2412: "nicht biogener Abfall",
        2413: "Wärme",
        3030: "Wasserstoff",
    }),
    134: ("Feste Biomasse", {
        2414: "Feste biogene Stoffe und Abfälle (ohne Holz)",
        2415: "Altholz, Gebrauchtholz, Holz(sperr)müll",
        2416: "Tier- und Blutmehl",
        2417: "Brennholz",
        2418: "Brennlauge, Schwarzlauge, Sulfitablauge",
        2419: "Feste biogene Stoffe",
        2420: "Holz",
        2421: "Wald-Holzhackschnitzel, Wald-Scheitholz, -Kronenholz",
        2422: "Holzreste (z.B. aus Schreinereien, auch Spanholz)",
        2423: "Holzspäne, Sägemehl",
        2424: "Rinde und Landschaftspflegeholz",
        2425: "Holz-Pellets, Holz-Briketts",
        2426: "Rauchspan",
        2427: "Restholz",
        2428: "Rinde",
        2429: "Schleifstaub, biogen",
        2430: "Schwarzlauge",
        2431: "Stroh, Strohpellets",
        2432: "Sulfitablauge",
        2433: "Tierfett",
        2434: "Tiermehl",
        2435: "Warmbrennstoffe (biogener Gewerbeabfall)",
        3031: "Energiepflanzen zur Verbrennung (z.B. Kurzumtriebs-Holz)",
        3033: "Holzkohle",
        3034: "Wald-Stammholz, Rundholz",
    }),
    135: ("Flüssige Biomasse", {
        2436: "Flüssige biogene Stoffe und Abfälle",
        2437: "Biodiesel",
        2438: "Biomethanol",
        2439: "Flüssige biogene Stoffe",
        2440: "Harzöl",
        2441: "Iso-Hexan",
        2442: "Palmöl u.a. Pflanzenöle",
        2443: "Pflanzenöl",
        2444: "Terpentin",
    }),
    136: ("Gasförmige Biomasse", {
        2445: "Biogas",
        2446: "Biomethan (Bioerdgas)",
        2447: "Deponiegas",
        2448: "Klärgas",
        3032: "Holzgas (Gas Biomasse)",
    }),
    138: ("Verbrennung Steinkohle", {
        2456: "Kohlenwertstoffe aus Steinkohle",
        2457: "Steinkohlen",
        2458: "Steinkohlenbriketts",
        2459: "Steinkohlenkoks",
    }),
    139: ("Verbrennung Braunkohle", {
        2460: "Braunkohlenbriketts",
        2461: "Braunkohlenkoks",
        2462: "Hartbraunkohlen",
        2463: "Rohbraunkohlen",
        2464: "Staub- und Trockenkohle",
        2465: "Wirbelschichtkohle",
    }),
    140: ("Verbrennung Mineralölprodukte", {
        2466: "Dieselkraftstoff",
        2467: "Heizöl, leicht",
        2468: "Heizöl, schwer",
        2469: "Flüssiggas",
        2470: "Petrolkoks",
        2471: "Raffineriegas",
        2472: "Andere Mineralölprodukte",
    }),
    141: ("Verbrennung Erdgas", {
        2473: "Erdgas, Erdölgas",
    }),
    142: ("Verbrennung andere Gase", {
        2474: "Grubengas",
        2475: "Hochofengas, Konvertergas",
        2476: "Kokereigas",
        2477: "Andere Gase",
        2478: "Sonstige hergestellte Gase",
    }),
    143: ("Verbrennung nicht biogener Abfall", {
        2479: "Industrieabfall",
        2480: "Abfall (Hausmüll, Siedl.abf.)",
    }),
    144: ("Verbrennung Wärme", {
        2481: "Dampf (zum Beispiel Prozesswärme)",
        2482: "Dampf (fremdbezogen)",
        2483: "Wärme",
    }),
    145: ("EnergieträgerArt", {
        2485: "Geothermie",
        2486: "Verbrennung",
        2487: "Biomasse",
        2488: "Kernenergie",
        2489: "Solare Strahlungsenergie",
        2490: "Speicher",
        2491: "Wind",
        2492: "Wasser",
    }),
    146: ("Energieträger (Biomasse)", {
        2493: "Biomasse",
    }),
    147: ("Energieträger (Kernenergie)", {
        2494: "Kernenergie",
    }),
    148: ("Energieträger (Solare Strahlungsenergie)", {
        2495: "Solare Strahlungsenergie",
    }),
    149: ("Energieträger (Speicher)", {
        2496: "Speicher",
    }),
    150: ("Energieträger (Wind)", {
        2497: "Wind",
    }),
    151: ("Energieträger (Wasser)", {
        2498: "Wasser",
    }),
    155: ("Tätigkeitsstatus", {
        2511: "Aktiv",
        2512: "Inaktiv",
    }),
    156: ("Grund der Löschung", {
        2513: "Tätigkeitsende",
        2514: "Fehlerhafte Registrierung",
        3240: "Duplikat/Doppelte Registrierung",
    }),
    159: ("NACEGruppe", {
        2568: "Anbau ein- und zweijähriger Pflanzen",
        2569: "Anbau mehrjähriger Pflanzen",
        2570: "Betrieb von Baumschulen, sowie Anbau von Pflanzen zu Vermehrungszwecken",
        2571: "Tierhaltung",
        2572: "Gemischte Landwirtschaft",
        2573: "Erbringung von landwirtschaftlichen Dienstleistungen und nach der Ernte anfallende Tätigkeiten",
        2574: "Jagd, Fallenstellerei und damit verbundene Tätigkeiten",
        2575: "Forstwirtschaft",
        2576: "Holzeinschlag",
        2577: "Sammeln von wild wachsenden Produkten, ohne Holz",
        2578: "Erbringung von Dienstleistungen für Forstwirtschaft und Holzeinschlag",
        2579: "Fischerei",
        2580: "Aquakultur",
        2581: "Steinkohlenbergbau",
        2582: "Braunkohlenbergbau",
        2583: "Gewinnung von Erdöl",
        2584: "Gewinnung von Erdgas",
        2585: "Eisenerzbergbau",
        2586: "NE-Metallerzbergbau",
        2587: "Gewinnung von Natursteinen, Kies, Sand, Ton und Kaolin",
        2588: "Sonstiger Bergbau; Gewinnung von Steinen und Erden a. n. g.",
        2589: "Erbringung von Dienstleistungen für die Gewinnung von Erdöl und Erdgas",
        2590: "Erbringung von Dienstleistungen für den sonstigen Bergbau und die Gewinnung von Steinen und Erden",
        2591: "Schlachten und Fleischverarbeitung",
        2592: "Fischverarbeitung",
        2593: "Obst- und Gemüseverarbeitung",
        2594: "Herstellung von pflanzlichen und tierischen Ölen und Fetten",
        2595: "Herstellung von Milcherzeugnissen und Speiseeis",
        2596: "Mahl- und Schälmühlen, Herstellung von Stärke und Stärkeerzeugnissen",
        2597: "Herstellung von Back- und Teigwaren",
        2598: "Herstellung von sonstigen Nahrungsmitteln",
        2599: "Herstellung von Futtermitteln",
        2600: "Getränkeherstellung",
        2601: "Tabakverarbeitung",
        2602: "Spinnstoffaufbereitung und Spinnerei",
        2603: "Weberei",
        2604: "Veredlung von Textilien und Bekleidung",
        2605: "Herstellung von sonstigen Textilwaren",
        2606: "Herstellung von Bekleidung und Bekleidungszubehör",
        2607: "Herstellung von Pelzwaren",
        2608: "Herstellung von Bekleidung aus gewirktem und gestricktem Stoff",
        2609: "Gerben, Färben, Zurichten von Leder und Fellen; Herstellung von Reisegepäck, Handtaschen, Sattlerwaren und Geschirren",
        2610: "Herstellung von Schuhen",
        2611: "Säge-, Hobel- und Holzimprägnierwerke; Bearbeitung und Veredlung von Holz",
        2612: "Herstellung von sonstigen Holz-, Kork-, Flecht- und Korbwaren",
        2613: "Herstellung von Holz- und Zellstoff, Papier, Karton und Pappe",
        2614: "Herstellung von Waren aus Papier, Karton und Pappe",
        2615: "Herstellung von Druckerzeugnissen",
        2616: "Vervielfältigung von bespielten Ton-, Bild- und Datenträgern",
        2617: "Kokerei",
        2618: "Herstellung von Mineralölerzeugnissen und von fossilen Brennstoffen",
        2619: "Herstellung von chemischen Grundstoffen, Düngemitteln und Stickstoffverbindungen, Kunststoffen in Primärformen und synthetischem Kautschuk in Primärformen",
        2620: "Herstellung von Schädlingsbekämpfungs-, Pflanzenschutz- und Desinfektionsmitteln",
        2621: "Herstellung von Anstrichmitteln, Druckfarben und Kitten",
        2622: "Herstellung von Wasch-, Reinigungs- und Poliermitteln",
        2623: "Herstellung von sonstigen chemischen Erzeugnissen",
        2624: "Herstellung von Chemiefasern",
        2625: "Herstellung von pharmazeutischen Grundstoffen",
        2626: "Herstellung von pharmazeutischen Spezialitäten und sonstigen pharmazeutischen Erzeugnissen",
        2627: "Herstellung von Gummiwaren",
        2628: "Herstellung von Kunststoffwaren",
        2629: "Herstellung von Glas und Glaswaren",
        2630: "Herstellung von feuerfesten keramischen Werkstoffen und Waren",
        2631: "Herstellung von keramischen Baumaterialien",
        2632: "Herstellung von sonstigen Porzellan- und keramischen Erzeugnissen",
        2633: "Herstellung von Zement, Kalk und gebranntem Gips",
        2634: "Herstellung von Erzeugnissen aus Beton, Zement und Gips",
        2635: "Be- und Verarbeitung von Naturwerksteinen und Natursteinen",
        2636: "Herstellung von Schleifkörpern und Schleifmitteln auf Unterlage sowie sonstigen Erzeugnissen aus nichtmetallischen Mineralien a. n. g.",
        2637: "Erzeugung von Roheisen, Stahl und Ferrolegierungen",
        2638: "Herstellung von Stahlrohren, Rohrform-, Rohrverschluss- und Rohrverbindungsstücken aus Stahl",
        2639: "Sonstige erste Bearbeitung von Eisen und Stahl",
        2640: "Erzeugung und erste Bearbeitung von NE-Metallen",
        2641: "Gießereien",
        2642: "Stahl- und Leichtmetallbau",
        2643: "Herstellung von Metalltanks und -behältern",
        2644: "Herstellung von Dampfkesseln (ohne Zentralheizungskessel)",
        2645: "Herstellung von Waffen und Munition",
        2646: "Herstellung von Schmiede-, Press-, Zieh- und Stanzteilen und pulvermetallurgischen Erzeugnissen",
        2647: "Oberflächenveredlung und Wärmebehandlung; Metallbearbeitung",
        2648: "Herstellung von Schneidwaren, Werkzeugen, Schlössern und Beschlägen aus unedlen Metallen",
        2649: "Herstellung von sonstigen Metallwaren",
        2650: "Herstellung von elektronischen Bauelementen und Leiterplatten",
        2651: "Herstellung von Datenverarbeitungsgeräten und peripheren Geräten",
        2652: "Herstellung von Geräten und Einrichtungen der Telekommunikationstechnik",
        2653: "Herstellung von Geräten der Unterhaltungselektronik",
        2654: "Herstellung von Mess- und Kontrollinstrumenten sowie Uhren",
        2655: "Herstellung von Bestrahlungs- und Elektrotherapiegeräten und elektromedizinischen Geräten",
        2656: "Herstellung von optischen und fotografischen Instrumenten und Geräten sowie von magnetischen und optischen Datenträgern",
        2657: "Herstellung von magnetischen und optischen Datenträgern",
        2658: "Herstellung von Elektromotoren, Generatoren, Transformatoren, Elektrizitätsverteilungs- und -schalteinrichtungen",
        2659: "Herstellung von Batterien und Akkumulatoren",
        2660: "Herstellung von Kabeln und elektrischem Installationsmaterial",
        2661: "Herstellung von Lampen und Leuchten",
        2662: "Herstellung von Haushaltsgeräten",
        2663: "Herstellung von sonstigen elektrischen Ausrüstungen und Geräten",
        2664: "Herstellung von nicht wirtschaftszweigspezifischen Maschinen",
        2665: "Herstellung von sonstigen nicht wirtschaftszweigspezifischen Maschinen",
        2666: "Herstellung von land- und forstwirtschaftlichen Maschinen",
        2667: "Herstellung von Werkzeugmaschinen",
        2668: "Herstellung von Maschinen für sonstige bestimmte Wirtschaftszweige",
        2669: "Herstellung von Kraftwagen und Kraftwagenmotoren",
        2670: "Herstellung von Karosserien, Aufbauten und Anhängern",
        2671: "Herstellung von Teilen und Zubehör für Kraftwagen",
        2672: "Schiff- und Bootsbau",
        2673: "Schienenfahrzeugbau",
        2674: "Luft- und Raumfahrzeugbau",
        2675: "Herstellung von militärischen Kampffahrzeugen",
        2676: "Herstellung von Beförderungsmitteln",
        2677: "Herstellung von Möbeln",
        2678: "Herstellung von Münzen, Schmuck und ähnlichen Erzeugnissen",
        2679: "Herstellung von Musikinstrumenten",
        2680: "Herstellung von Sportgeräten",
        2681: "Herstellung von Spielwaren",
        2682: "Herstellung von medizinischen und zahnmedizinischen Apparaten und Materialien",
        2683: "Herstellung von Erzeugnissen a. n. g.",
        2684: "Reparatur und Instandhaltung von Metallerzeugnissen, Maschinen und Ausrüstungen",
        2685: "Installation von Industriemaschinen und -ausrüstungen",
        2686: "Elektrizitätsversorgung",
        2687: "Gasversorgung",
        2688: "Wärme- und Kälteversorgung",
        2689: "Wasserversorgung",
        2690: "Abwasserentsorgung",
        2691: "Sammlung von Abfällen",
        2692: "Verwertung von Abfällen",
        2693: "Abfallbeseitigung ohne Verwertung",
        2694: "Beseitigung von Umweltverschmutzungen und sonstige Tätigkeiten in der Abfallbewirtschaftung",
        2695: "Erschließung von Grundstücken; Bauträger",
        2696: "Bau von Gebäuden",
        2697: "Bau von Straßen und Bahnverkehrsstrecken",
        2698: "Bau von Versorgungseinrichtungen",
        2699: "Sonstiger Tiefbau",
        2700: "Abbrucharbeiten und vorbereitende Baustellenarbeiten",
        2701: "Bauinstallation",
        2702: "Sonstiger Ausbau",
        2703: "Sonstige spezialisierte Bautätigkeiten",
        2704: "Handel mit Kraftwagen",
        2705: "Instandhaltung und Reparatur von Kraftwagen",
        2706: "Handel mit Kraftwagenteilen und -zubehör",
        2707: "Handel mit Krafträdern, Kraftradteilen und -zubehör; Instandhaltung und Reparatur von Krafträdern",
        2708: "Handelsvermittlung",
        2709: "Großhandel mit landwirtschaftlichen Grundstoffen und lebenden Tieren",
        2710: "Großhandel mit Nahrungs- und Genussmitteln, Getränken und Tabakwaren",
        2711: "Großhandel mit Gebrauchs- und Verbrauchsgütern",
        2712: "Großhandel mit Geräten der Informations- und Kommunikationstechnik",
        2713: "Großhandel mit sonstigen Maschinen, Ausrüstungen und Zubehör",
        2714: "Sonstiger Großhandel",
        2715: "Großhandel ohne ausgeprägten Schwerpunkt",
        2716: "Einzelhandel mit Waren verschiedener Art",
        2717: "Einzelhandel mit Nahrungs- und Genussmitteln, Getränken und Tabakwaren",
        2718: "Einzelhandel mit Motorenkraftstoffen",
        2719: "Einzelhandel mit Geräten der Informations- und Kommunikationstechnik",
        2720: "Einzelhandel mit sonstigen Haushaltsgeräten, Textilien, Heimwerker- und Einrichtungsbedarf",
        2721: "Einzelhandel mit Verlagsprodukten, Sportausrüstungen und Spielwaren",
        2722: "Einzelhandel mit sonstigen Gütern, ohne Kraftwagen und Krafträder",
        2723: "Einzelhandel mit Kraftwagen, Krafträdern, deren Teilen und Zubehör",
        2724: "Vermittlungstätigkeiten für den Einzelhandel",
        2725: "Personenbeförderung im Schienenverkehr",
        2726: "Güterbeförderung im Schienenverkehr",
        2727: "Sonstige Personenbeförderung im Landverkehr",
        2728: "Güterbeförderung im Straßenverkehr, Umzugstransporte",
        2729: "Transport in Rohrfernleitungen",
        2730: "Personenbeförderung in der Hochsee- und Küstenschifffahrt",
        2731: "Güterbeförderung in der Hochsee- und Küstenschifffahrt",
        2732: "Personenbeförderung in der Binnenschifffahrt",
        2733: "Güterbeförderung in der Binnenschifffahrt",
        2734: "Personenbeförderung in der Luftfahrt",
        2735: "Güterbeförderung in der Luftfahrt und Raumtransport",
        2736: "Lagerei",
        2737: "Erbringung von sonstigen Dienstleistungen für den Verkehr",
        2738: "Postdienste von Universaldienstleistungsanbietern",
        2739: "Sonstige Post-, Kurier- und Expressdienste",
        2740: "Hotels, Gasthöfe und Pensionen",
        2741: "Ferienunterkünfte und ähnliche Beherbergungsstätten",
        2742: "Campingplätze",
        2743: "Sonstige Beherbergungsstätten",
        2744: "Restaurants, Gaststätten, Imbissstuben, Cafés, Eissalons u. Ä.",
        2745: "Caterer und Erbringung sonstiger Verpflegungsdienstleistungen",
        2746: "Ausschank von Getränken",
        2747: "Verlegen von Büchern und Zeitschriften; sonstiges Verlagswesen, ohne Software",
        2748: "Verlegen von Software",
        2749: "Herstellung von Filmen und Fernsehprogrammen, deren Verleih und Vertrieb; Kinos",
        2750: "Tonstudios; Herstellung von Hörfunkbeiträgen; Verlegen von bespielten Tonträgern und Musikalien",
        2751: "Hörfunkveranstalter und Verbreitung von Audioinhalten",
        2752: "Fernsehveranstalter und Verbreitung von Videoinhalten",
        2753: "Leitungsgebundene, drahtlose und satellitengestützte Telekommunikation",
        2754: "Wiederverkaufs- und Vermittlungstätigkeiten für die Telekommunikation",
        2755: "Satellitentelekommunikation",
        2756: "Sonstige Telekommunikation",
        2757: "Erbringung von Dienstleistungen der Informationstechnologie",
        2758: "Datenverarbeitung, Hosting und damit verbundene Tätigkeiten",
        2759: "Web-Suchportale und Erbringung von sonstigen Informationsdienstleistungen",
        2760: "Zentralbanken und Kreditinstitute",
        2761: "Beteiligungsgesellschaften und Finanzierungs-Conduits",
        2762: "Treuhand- und sonstige Fonds u. Ä. Finanzinstitutionen",
        2763: "Sonstige Finanzierungsinstitutionen",
        2764: "Versicherungen",
        2765: "Rückversicherungen",
        2766: "Pensionskassen und Pensionsfonds",
        2767: "Mit Finanzdienstleistungen verbundene Tätigkeiten",
        2768: "Mit Versicherungsdienstleistungen und Pensionskassen verbundene Tätigkeiten",
        2769: "Fondsmanagement",
        2770: "Kauf und Verkauf von eigenen Grundstücken, Gebäuden und Wohnungen sowie Erschließung von Grundstücken",
        2771: "Vermietung, Verpachtung von eigenen oder geleasten Grundstücken, Gebäuden und Wohnungen",
        2772: "Vermittlung und Verwaltung von Grundstücken, Gebäuden und Wohnungen für Dritte",
        2773: "Rechtsberatung",
        2774: "Wirtschaftsprüfung und Steuerberatung; Buchführung",
        2775: "Verwaltung und Führung von Unternehmen und Betrieben",
        2776: "Unternehmensberatung",
        2777: "Tätigkeiten von Architektur- und Ingenieurbüros",
        2778: "Technische, physikalische und chemische Untersuchung",
        2779: "Forschung und Entwicklung im Bereich Natur-, Ingenieur-, Agrarwissenschaften und Medizin",
        2780: "Forschung und Entwicklung im Bereich Rechts-, Wirtschafts- und Sozialwissenschaften sowie im Bereich Sprach-, Kultur- und Kunstwissenschaften",
        2781: "Werbung",
        2782: "Markt- und Meinungsforschung",
        2783: "Ateliers für Textil-, Schmuck-, Grafik- u. Ä. Design",
        2784: "Fotografie und Fotolabors",
        2785: "Übersetzen und Dolmetschen",
        2786: "Sonstige wissenschaftliche und technische Tätigkeiten a. n. g.",
        2787: "Veterinärwesen",
        2788: "Vermietung von Kraftwagen",
        2789: "Vermietung von Gebrauchsgütern",
        2790: "Vermietung von Maschinen, Geräten und sonstigen beweglichen Sachen",
        2791: "Leasing von nichtfinanziellen immateriellen Vermögensgütern ohne Copyrights",
        2792: "Vermittlung von Arbeitskräften",
        2793: "Überlassung von Arbeitskräften und sonstige Personaldienstleistungen",
        2794: "Sonstige Überlassung von Arbeitskräften",
        2795: "Reisebüros und Reiseveranstalter",
        2796: "Erbringung sonstiger Reservierungsdienstleistungen",
        2797: "Private Wach- und Sicherheitsdienste",
        2798: "Sicherheitsdienste mithilfe von Überwachungs- und Alarmsystemen",
        2799: "Detekteien",
        2800: "Hausmeisterdienste",
        2801: "Reinigung von Gebäuden, Straßen und Verkehrsmitteln",
        2802: "Garten- und Landschaftsbau sowie Erbringung von sonstigen gärtnerischen Dienstleistungen",
        2803: "Sekretariats- und Schreibdienste, Copy-Shops",
        2804: "Call Center",
        2805: "Messe-, Kongress- und Business-Event-Veranstalter",
        2806: "Erbringung wirtschaftlicher Dienstleistungen für Unternehmen und Privatpersonen a. n. g.",
        2807: "Öffentliche Verwaltung",
        2808: "Auswärtige Angelegenheiten, Verteidigung, Rechtspflege/Justiz, öffentliche Sicherheit und Ordnung",
        2809: "Sozialversicherung",
        2810: "Kindergärten und Vorschulen",
        2811: "Grundschulen/Volksschulen",
        2812: "Weiterführende Schulen und postsekundärer, nicht tertiärer Unterricht",
        2813: "Tertiärer und post-sekundärer, nicht tertiärer Unterricht",
        2814: "Sonstiger Unterricht",
        2815: "Erbringung von Dienstleistungen für den Unterricht",
        2816: "Krankenhäuser",
        2817: "Arzt- und Zahnarztpraxen",
        2818: "Sonstiges Gesundheitswesen",
        2819: "Pflegeheime",
        2820: "Stationäre Einrichtungen zur psychosozialen Betreuung, Suchtbekämpfung",
        2821: "Seniorenwohnheime und Wohnheime für Menschen mit Behinderung",
        2822: "Sonstige Heime, ohne Erholungs- und Ferienheime, und Tätigkeiten für stationäre Betreuung",
        2823: "Soziale Betreuung von älterern Menschen und von Menschen mit Behinderung",
        2824: "Sonstiges Sozialwesen, ohne Heime",
        2825: "Kreative, künstlerische und unterhaltende Tätigkeiten",
        2826: "Bibliotheken, Archive, Museen, botanische und zoologische Gärten",
        2827: "Spiel-, Wett- und Lotteriewesen",
        2828: "Erbringung von Dienstleistungen des Sports",
        2829: "Erbringung von sonstigen Dienstleistungen der Unterhaltung und der Erholung",
        2830: "Wirtschafts- und Arbeitgeberverbände, Berufsorganisationen",
        2831: "Arbeitnehmervereinigungen",
        2832: "Kirchliche Vereinigungen; politische Parteien sowie sonstige Interessenvertretungen und Vereinigungen",
        2833: "Reparatur und Instandhaltung von Datenverarbeitungs- und Telekommunikationsgeräten",
        2834: "Reparatur und Instandhaltung von Gebrauchsgütern",
        2835: "Erbringung von sonstigen überwiegend persönlichen Dienstleistungen",
        2836: "Private Haushalte mit Hauspersonal",
        2837: "Herstellung von Waren durch private Haushalte für den Eigenbedarf ohne ausgeprägten Schwerpunkt",
        2838: "Erbringungen von Dienstleistungen durch private Haushalte für den Eigenbedarf ohne ausgeprägten Schwerpunkt",
        2839: "Exterritoriale Organisationen und Körperschaften",
        3126: "Erbringung von Dienstleistungen für Fischerei und Aquakultur",
        3127: "Tätigkeiten von Strom- und Erdgasmaklerinnen und -maklern",
        3128: "Hochbau",
        3129: "Spezialisierte Bautätigkeiten im Hochbau",
        3130: "Spezialisierte Bautätigkeiten im Tiefbau",
        3131: "Vermittlungstätigkeiten für spezialisierte Bautätigkeiten",
        3132: "Großhandel mit Kraftwagen, Krafträdern, deren Teilen und Zubehör",
        3133: "Vermittlungstätigkeiten für den Verkehr",
        3134: "Vermittlungstätigkeiten für Post-, Kurier und Expressdienstleistungen",
        3135: "Vermittlungstätigkeiten für Beherbergungsdienstleistungen",
        3136: "Vermittlungstätigkeiten für gastronomische Dienstleistungen",
        3137: "Nachrichtenagenturen und sonstige Verbreitung von Medieninhalten",
        3138: "Programmierungstätigkeiten",
        3139: "Erbringung von Dienstleistungen der IT-Beratung sowie des Betriebs von Datenverarbeitungseinrichtungen",
        3140: "Erbringung von sonstigen Dienstleistungen der Informationstechnologie",
        3141: "Public-Relations-Beratung",
        3142: "Vermittlungstätigkeiten für die Vermietung und das Leasing von beweglichen Sachen und nichtfinanziellen immateriellen Vermögenswerten",
        3143: "Wach- und Sicherheitsdienste sowie Detekteien",
        3144: "Vermittlungstätigkeiten für die Erbringung von wirtschaftlichen Dienstleistungen für Unternehmen und Privatpersonen a. n. g.",
        3145: "Tertiärer Unterricht",
        3146: "Erbringung von Dienstleistungen für Erziehung und Unterricht",
        3147: "Kunstschaffende Tätigkeiten",
        3148: "Darstellende Kunst",
        3149: "Erbringung von Dienstleistungen für kunstschaffende und darstellende Künste",
        3150: "Bibliotheken und Archive",
        3151: "Museen, Sammlungen, historische Stätten und Denkmäler",
        3152: "Konservierung, Restaurierung und sonstige unterstützende Tätigkeiten für das kulturelle Erbe",
        3153: "Botanische und zoologische Gärten sowie Naturparks",
        3154: "Reparatur und Instandhaltung von Kraftwagen und Krafträdern",
        3155: "Vermittlungstätigkeiten für die Reparatur und Instandhaltung von Datenverarbeitungsgeräten und Gebrauchsgütern sowie von Kraftwagen und Krafträdern",
        3156: "Wäscherei und chemische Reinigung",
        3157: "Frisör- und Kosmetiksalons, Day Spas u. Ä",
        3158: "Bestattungswesen",
        3159: "Vermittlungstätigkeiten für überwiegend persönliche Dienstleistungen",
        3160: "Erbringung von sonstigen überwiegend persönlichen Dienstleistungen",
    }),
    163: ("SystemStatus EEG", {
        2850: "Aktiviert",
        2851: "Gelöscht",
    }),
    164: ("SystemStatus KWK", {
        2852: "Aktiviert",
        2853: "Gelöscht",
    }),
    165: ("SystemStatus Speicher", {
        2854: "Aktiviert",
        2855: "Gelöscht",
    }),
    166: ("SystemStatus Genehmigung", {
        2856: "Aktiviert",
        2857: "Gelöscht",
    }),
    171: ("Pumpspeichertechnologie", {
        2920: "Pumpspeicheranlage ohne natürlichen Zufluss",
        2921: "Pumpspeicheranlage mit natürlichem Zufluss",
    }),
    175: ("NBPStatusFilter", {
        2954: "Geprüft",
        2955: "In Prüfung",
        3075: "Nicht vorgesehen",
    }),
    187: ("Verbrennung Wasserstoff", {
        3035: "Wasserstoff",
    }),
    194: ("Reserveart", {
        3078: "Nein",
        3079: "Ja, Kapazitätsreserve",
        3080: "Ja, Netzreserve",
    }),
    195: ("Grund der Zuordnungsänderung", {
        3085: "Standortänderung",
        3086: "Übertragung von Einheiten",
    }),
    198: ("GesamtdatenexportInfo", {
        3106: "",
    }),
    199: ("PersistierungLetzteAktualisierung", {
        3107: "26.09.2026",
        3108: "26.09.2026",
        3109: "26.09.2026",
        3110: "26.09.2026",
    }),
    201: ("Technologie (Flugwind)", {
        3163: "Flexibler Drachen (Softkite)",
        3164: "Starrflügler (Fixed Wing)",
        3165: "Hybrid",
        3166: "Sonstige",
    }),
    203: ("Solaranlagen-Kategorie", {
        3176: "Steckerfertige Solaranlage (sog. Balkonkraftwerk)",
        3177: "Gebäudesolaranlage",
        3178: "Andere Solaranlage",
    }),
    204: ("Vorherige Nutzungsartengruppe", {
        3187: "Landwirtschaft - Ackerland",
        3188: "Landwirtschaft - Grünland",
        3189: "Landwirtschaft - Gartenbauland",
        3190: "Landwirtschaft - Rebfläche",
        3191: "Landwirtschaft - Obst- und Nussplantage",
        3192: "Landwirtschaft - Weihnachtsbaumkultur",
        3193: "Landwirtschaft - Kurzumtriebsplantage",
        3194: "Landwirtschaft - Brachland",
        3196: "Gehölz",
        3197: "Heide",
        3198: "Moor",
        3199: "Sumpf",
        3200: "Unland / Vegetationslose Fläche",
        3201: "Wohnbaufläche",
        3202: "Industrie- und Gewerbefläche",
        3203: "Halde",
        3204: "Bergbaubetrieb",
        3205: "Tagebau, Grube, Steinbruch",
        3206: "Fläche gemischter Nutzung",
        3207: "Fläche besonderer funktionaler Prägung",
        3208: "Sport-, Freizeit- und Erholungsfläche",
        3209: "Friedhof",
        3210: "Straßenverkehr",
        3211: "Weg",
        3212: "Platz",
        3213: "Bahnverkehr",
        3214: "Flugverkehr",
        3215: "Schiffsverkehr",
        3216: "Fließgewässer",
        3217: "Hafenbecken",
        3218: "Stehendes Gewässer",
        3219: "Meer",
        3245: "Wald - Laubholz",
        3246: "Wald - Nadelholz",
        3247: "Wald - Laub- und Nadelholz",
        3248: "Wald - Dauerhaft unbestockt",
        3249: "Landwirtschaft - Baumschule",
    }),
    205: ("Vorheriger Nutzungsartenbereich der Fläche", {
        3220: "Vegetation",
        3221: "Siedlung",
        3222: "Verkehr",
        3223: "Gewässer",
    }),
    208: ("Löschgründe Einheit", {
        3234: "Duplikat/Doppelte Registrierung",
        3235: "Versehentliche Registrierung /Testregistrierung",
        3236: "Anlagenzusammenfassung/-aufteilung",
        3237: "Einheit wird nicht in Betrieb genommen",
        3238: "Mit falschem Einheitentyp registriert",
        3239: "Keine Registrierungspflicht",
    }),
    209: ("PersistierteEinheitenInfo", {
        3253: "PersistierteEinheitenInfo Testinfo",
    }),
    210: ("PersistierteEinheitenInMeinemNetzInfo", {
        3254: "PersistierteEinheitenInMeinemNetzInfo Testinfo",
    }),
}

# Einheitentypen.xml
EINHEITENTYPEN = {
    1: "Solareinheit",
    2: "Windeinheit",
    3: "Biomasse",
    4: "Wasser",
    5: "Geothermie",
    6: "Verbrennung",
    7: "Kernenergie",
    8: "Stromspeichereinheit",
    9: "Stromverbrauchseinheit",
    10: "Gasverbrauchseinheit",
    11: "Gaserzeugungseinheit",
    12: "Gasspeichereinheit",
    13: "Stromerzeugungseinheit",
}

# Lokationstypen.xml
LOKATIONSTYPEN = {
    1: "Stromerzeugungslokation",
    2: "Stromverbrauchslokation",
    3: "Gaserzeugungslokation",
    4: "Gasverbrauchslokation",
}

# Marktfunktionen.xml
MARKTFUNKTIONEN = {
    1: "Stromnetzbetreiber",
    2: "Anlagenbetreiber",
    3: "Akteur im Strommarkt",
    4: "Organisierter Marktplatz",
    5: "Behörde, Verband, Institution",
    6: "Sonstiger Marktakteur",
    7: "Bundesnetzagentur",
    8: "Gasnetzbetreiber",
    9: "Akteur im Gasmarkt",
    10: "Supportpartner",
}

# Marktrollen.xml
MARKTROLLEN = {
    1: "Übertragungsnetzbetreiber",
    2: "Anschlussnetzbetreiber",
    3: "Bilanzkreisverantwortlicher",
    4: "Bilanzkoordinator",
    5: "Messstellenbetreiber",
    6: "Fernleitungsnetzbetreiber (Gas)",
    7: "Marktgebietsverantwortlicher",
    8: "Anschlussnetzbetreiber",
    18: "Stromlieferant, Direktvermarkter, Stromgroßhändler",
    20: "Bilanzkreisverantwortlicher",
    21: "Messstellenbetreiber",
    22: "Bilanzkreisverantwortlicher",
    23: "Betreiber einer Buchungsplattform für grenzüberschreitende Stromnetzkapazitäten",
    24: "Börse",
    25: "OTC-Plattform",
    26: "Betreiber einer Buchungsplattform für Gasspeicher",
    27: "Behörde",
    28: "energiewirtschaftlicher Verband",
    29: "energiewirtschaftliche Institution",
    30: "Dienstleister",
    31: "Sonstige Marktrolle",
    32: "Messstellenbetreiber",
    33: "Messstellenbetreiber",
    35: "Transportkunde",
    37: "Betreiber einer Buchungsplattform für Gaskapazitäten",
}
# fmt: on
# ------------------------------------------------ end of the catalogs of the export

# Every code's text (a code is unique across the catalogs), and the lists of their own files by their name
KATALOGWERTE = {code: text for _, values in KATALOG.values() for code, text in values.items()}
LISTEN = {
    "Einheitentypen": EINHEITENTYPEN,
    "Lokationstypen": LOKATIONSTYPEN,
    "Marktfunktionen": MARKTFUNKTIONEN,
    "Marktrollen": MARKTROLLEN,
}
