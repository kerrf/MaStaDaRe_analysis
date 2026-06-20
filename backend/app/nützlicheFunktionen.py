import pandas as pd
from io import StringIO
from collections import Counter
from collections import defaultdict




# def add_coord_to_table(path: str) -> None:
#     """Liest die PLZ in der Tabelle aus und fügt Breiten- und Längengrade in die Tabelle hinzu"""

#     try:
#         with open(path, encoding='utf-8') as f:
#             xml_content = f.read()
#     except FileNotFoundError:
#         print("File not found")
#         return

#     solarDataFrame = pd.read_xml(StringIO(xml_content))
#     solarDataFrame.insert(1,"Lan",[plz_koord[plz][0] for plz in solarDataFrame["Postleitzahl"].to_list()])
#     solarDataFrame.insert(2,"Lon",[plz_koord[plz][1] for plz in solarDataFrame["Postleitzahl"].to_list()])
#     solarDataFrame.to_csv('out.csv', index=False)
#     return


def count_plz_in_msdr(file: pd.DataFrame) -> dict:
    """
    file ist die Datei, von der gezählt wird
    """
    plz_list = []
    plz_list = plz_list + file["Postleitzahl"].to_list()

    #print(Counter(plz_list), type(Counter(plz_list)))

    counts = Counter(plz_list).most_common()
    counts = {key:val for key, val in counts}
    return counts



def plz_liste_bereinigen(plz_counter: dict) -> dict:
    """ 
        Die Funktion bekommt eine Liste mit Tupeln (plz:menge) und bereinigt diese Liste,
        sodass keine PLZ doppelt vorkommt und die Mengen entsprechend addiert werden
    """

    normierte_liste = []
    # normiere alle 4-stelligen PLZ, setze führende 0
    for plz, value in plz_counter.items():
        if len(str(plz)) == 4:
            plz = "0" + str(plz)
            normierte_liste.append(tuple([plz,value]))
        else:
            normierte_liste.append(tuple([plz,value]))

    # kumuliere values doppelter Schlüssel
    result = defaultdict(int)
    for plz, value in normierte_liste:
        result[str(plz)] += value
    result = dict(result)

    return result

def fünfstl_zu_zweistl(counter: dict) -> dict:

    result = defaultdict(int)
    for plz, value in counter.items():
        result[str(plz)[0:2]] += value
    result = dict(result)

# und eine .csv gleich mit
#    with open(f"{dateiname}.csv", "w") as f:
#        f.write("postleitzahl, summe")
#        for plz,value in result.items():
#            if str(plz)[0] != 0:
#                f.write(f"{plz}, {value},\n")
#        f.write("}")

    return result

def akk_leistung_plz(file: pd.DataFrame) -> dict:
    """ Liest das DataFrame aus und gibt ein dict zurück plz:leistung, dass die Peakleistung
        einer Postleitzahl aufsummiert """

    result = defaultdict(int)
    for plz, value in zip(file["Postleitzahl"], file["Nettonennleistung"]):
        result[str(plz)] += value
    result = dict(result)

    return result

def main():
    return

if __name__ == "__main__":
    main()
