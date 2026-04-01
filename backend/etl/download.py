
import os

import pandas as pd
import requests
from alive_progress import alive_bar
from bs4 import BeautifulSoup
from zipfile import ZipFile


class Downloader_MSDR():
    """Handles the scraping, downloading, and extraction of MaStR data."""
    
    def __init__(self):
        self.url = "https://www.marktstammdatenregister.de/MaStR/Datendownload"
    
    def get_downlad_url(self) -> str | int:

        r = requests.get(url=self.url)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
 
        url_btn = soup.select_one("#wrapper-content > div.col-xs-12.col-lg-10.col-lg-offset-2.column-content > div > div:nth-child(8) > div.panel-body > div")
        url = url_btn.find(attrs={"title": "Download"})
        url = url.get("href")
        
        size_elem = soup.select_one("body > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div > div:nth-of-type(2) > div > div:nth-of-type(7) > div:nth-of-type(3) > div > a:nth-of-type(1)")
        size_text = "".join(filter(str.isdigit,size_elem.get_text(strip=True)))
        size_bytes = int(size_text)
        
        return url, size_bytes
        
    def download_zip(self, url: str, name: str, dest: str = "", size: int = 0) -> None:
        
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            
            total = r.headers.get("content-length", size)
            zip_file = os.path.join(dest, name)
            
            with open(zip_file, "wb") as f:
                with alive_bar(total, unit="B", scale="SI") as bar:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                        bar(len(chunk))
        
    def unpack_zip(self, src: str, dest: str = "") -> None:
        with ZipFile(src, "r") as z:
            z.extractall(dest)
            
downloader = Downloader_MSDR()

# url, file_size = downloader.get_downlad_url()
# downloader.download_zip(url, "Gesamtdatenexport.zip", "/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/raw", file_size*1000)
downloader.unpack_zip("/home/kerf/energy_projects/mastadatregpv_korrekt-main/backend/data/raw/Gesamtdatenexport.zip", "/home/kerf/energy_projects/mastadatregpv_korrekt-main/backend/data/raw/Gesamtdatenexport_xml")