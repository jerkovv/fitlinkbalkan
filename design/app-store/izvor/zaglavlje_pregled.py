"""Od snimka zaglavlje.html pravi gotove slike i pregled.

python3 zaglavlje_pregled.py <cist.png> <sa-zonom.png>
  ../zaglavlje/zaglavlje-5244x2950.png  univerzalna slika (bez alfe)
  ../zaglavlje/zaglavlje-3840x1646.png  isecak 21:9 (samo vrh stranice)
  ../zaglavlje/pregled-zaglavlje.png    sigurna zona + iPhone, iPad/Mac i pretraga
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "InterTight.ttf"

def font(v, b):
    f = ImageFont.truetype(FONT, v); f.set_variation_by_name(b); return f

cist = Image.open(sys.argv[1]).convert("RGB")
zona = Image.open(sys.argv[2]).convert("RGB")
assert cist.size == (5244, 2950)
cist.save("../zaglavlje/zaglavlje-5244x2950.png", optimize=True)
hdr = cist.crop((0, 351, 5244, 2598)).resize((3840, 1646), Image.LANCZOS)
hdr.save("../zaglavlje/zaglavlje-3840x1646.png", optimize=True)

# iPhone: App Store pokaze sredinu (oko 2967 px), gore dugmad, dole bela kartica sa ikonom.
x0 = 2622 - 1483
ip = cist.crop((x0, 0, x0 + 2967, 2950)).resize((402, 400), Image.LANCZOS).convert("RGBA")
d = ImageDraw.Draw(ip)
for cx in (32, 370):
    d.ellipse([cx - 19, 52, cx + 19, 90], fill=(235, 235, 240, 220))
d.rectangle([0, 272, 402, 400], fill=(255, 255, 255, 255))
d.rounded_rectangle([18, 288, 92, 362], radius=18, outline=(180, 180, 190), width=2)
d.text((108, 300), "FitLink - Trener i vežbači", font=font(20, b"SemiBold"), fill=(10, 10, 10))
ip = ip.convert("RGB").resize((804, 800), Image.LANCZOS)

F = font(30, b"Bold")
o = Image.new("RGB", (2900, 1960), (245, 245, 247)); d = ImageDraw.Draw(o)
d.text((20, 30), "Cela slika 5244 x 2950, zeleno = sigurna zona iz Apple šablona", font=F, fill=(20, 20, 24))
o.paste(zona.resize((1600, 900), Image.LANCZOS), (20, 90))
d.text((1700, 30), "iPhone (vrh stranice)", font=F, fill=(20, 20, 24)); o.paste(ip, (1700, 90))
d.text((20, 1040), "iPad / Mac (21:9)", font=F, fill=(20, 20, 24))
o.paste(hdr.resize((1600, 686), Image.LANCZOS), (20, 1100))
d.text((1700, 1040), "Pretraga (3:2)", font=F, fill=(20, 20, 24))
o.paste(cist.crop((409, 0, 4835, 2950)).resize((1140, 760), Image.LANCZOS), (1700, 1100))
o.save("../zaglavlje/pregled-zaglavlje.png", optimize=True)
print("ok")
