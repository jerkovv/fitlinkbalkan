#!/usr/bin/env python3
"""Snima mejl-1.html i mejl-2.html u pregled-*.png (racunar 680 px i telefon 390 px): python3 snimi.py"""
import subprocess, pathlib
from PIL import Image, ImageChops
CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
TU = pathlib.Path(__file__).parent
def snimi(f, w, iz):
    # Chrome bez prozora ne ide uze od oko 500 px, pa se telefon snima kroz okvir (iframe) zadate sirine.
    okvir = TU / '_okvir.html'
    okvir.write_text(f'<body style="margin:0;background:#ededf3"><iframe src="{f}" style="display:block;border:0;width:{w}px;height:5600px"></iframe>')
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
                    '--blink-settings=preferredColorScheme=1', f'--window-size={max(w, 520)},5600', '--virtual-time-budget=5000',
                    f'--screenshot={iz}', f'file://{okvir}'], capture_output=True)
    okvir.unlink()
    im = Image.open(iz).convert('RGB').crop((0, 0, w * 2, 11200))
    bg = Image.new('RGB', im.size, im.getpixel((2, 2)))
    b = ImageChops.difference(im, bg).getbbox()
    im = im.crop((0, 0, im.width, min(im.height, b[3] + 60)))
    im.save(iz); return im
for n in (1, 2):
    for w, s in ((680, 'racunar'), (390, 'telefon')):
        im = snimi(f'mejl-{n}.html', w, TU / f'pregled-{n}-{s}.png'); print(n, s, im.size)
a, b = Image.open(TU / 'pregled-1-racunar.png'), Image.open(TU / 'pregled-2-racunar.png')
o = Image.new('RGB', (a.width + b.width, max(a.height, b.height)), a.getpixel((2, 2)))
o.paste(a, (0, 0)); o.paste(b, (a.width, 0)); o.save(TU / 'pregled-oba.png'); print(o.size)
