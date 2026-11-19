#!/usr/bin/env python3
"""Pravi slike za mejlove povratka (pravi ekrani na Ponoc podlozi): python3 slike.py"""
import subprocess, pathlib
from PIL import Image
CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
TU = pathlib.Path(__file__).parent
# ime: (sirina, visina, telefoni, sjaj, mrak dole)
SLIKE = {
  # parovi: levo ekran trenera, desno ekran vezbaca
  # obe strane pokazuju serije i kilazu (trazeno 2026-11-19): trener ima otvorenu vezbu sa poljima SET / KG / REPS,
  # klijent trening u toku. Snimak t-urednik-serije je iz simulatora (-demo -trener), okvir pravi appstore_slike.telefon.
  'par-program-serije': (1024, 720, 't-urednik-serije,111,86,350,0;a-trening,563,86,350,0', '512,760,1200', 30, 1),
  'par-ishrana':   (1024, 720, 't-ishrana,96,92,380,0;a-ishrana,548,92,380,0', '512,760,1200', 110, 1),
  'par-termini':   (1024, 720, 't-kalendar,96,92,380,0;a-rezervisi,548,92,380,0', '512,760,1200', 110, 1),
  'par-uzivo':     (1024, 720, 't-uzivo-detalj,96,92,380,0;a-trening,548,92,380,0', '512,760,1200', 110, 1),
  'par-clanarine': (1024, 720, 't-uplate,96,92,380,0;a-pocetna,548,92,380,0', '512,760,1200', 40, 1),
  'par-napredak':  (1024, 720, 't-vezbaci,96,92,380,0;a-napredak,548,92,380,0', '512,760,1200', 110, 1),
}
for ime, (w, h, t, s, m, par) in SLIKE.items():
    iz = TU / 'slike' / f'{ime}.png'
    url = f'file://{TU}/slika.html#w={w}&h={h}&t={t}&s={s}&m={m}' + ('&par=1' if par else '')
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={w},{h + 200}',
                    '--virtual-time-budget=3000', f'--screenshot={iz}', url], capture_output=True)
    jpg = iz.with_suffix('.jpg')
    Image.open(iz).crop((0, 0, w, h)).convert('RGB').save(jpg, quality=88, optimize=True, progressive=True)
    iz.unlink()
    print(ime, jpg.stat().st_size // 1024, 'KB')
