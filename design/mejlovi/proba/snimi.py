#!/usr/bin/env python3
"""Snima mejl-*.html u pregled-*.png (telefon 390 px) i pregled-sve.png: python3 snimi.py"""
import subprocess, pathlib
from PIL import Image, ImageChops
CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
TU = pathlib.Path(__file__).parent
def snimi(f, w, iz):
    okvir = TU / '_okvir.html'
    okvir.write_text(f'<body style="margin:0;background:#ededf3"><iframe src="{f}" style="display:block;border:0;width:{w}px;height:7000px"></iframe>')
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
                    '--blink-settings=preferredColorScheme=1', f'--window-size={max(w, 520)},7000', '--virtual-time-budget=5000',
                    f'--screenshot={iz}', f'file://{okvir}'], capture_output=True)
    okvir.unlink()
    im = Image.open(iz).convert('RGB').crop((0, 0, w * 2, 14000))
    bg = Image.new('RGB', im.size, im.getpixel((2, 2)))
    b = ImageChops.difference(im, bg).getbbox()
    im = im.crop((0, 0, im.width, min(im.height, b[3] + 60)))
    im.save(iz); return im
slike = []
for f in sorted(TU.glob('mejl-*.html')):
    ime = f.stem.replace('mejl-', '')
    im = snimi(f.name, 390, TU / f'pregled-{ime}.png'); print(ime, im.size); slike.append(im)
h = max(i.height for i in slike)
o = Image.new('RGB', (sum(i.width for i in slike) + 30 * (len(slike) - 1), h), (237, 237, 243))
x = 0
for i in slike: o.paste(i, (x, 0)); x += i.width + 30
o.save(TU / 'pregled-sve.png'); print(o.size)
