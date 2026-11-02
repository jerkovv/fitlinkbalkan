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

# iPhone: izmereno na pregledu u App Store Connect-u. Vidi se x 1217..4027 i y 0..1830
# (dalje je bela kartica), gore Dynamic Island i dugmad nazad/deli.
k = 0.316  # 2810 px slike -> 888 px pregleda (2x od 444)
ip = cist.crop((1217, 0, 4027, 1830)).resize((888, 578), Image.LANCZOS).convert("RGBA")
ip = ip.crop((0, 0, 888, 578))
tel = Image.new("RGBA", (888, 1000), (255, 255, 255, 255)); tel.paste(ip, (0, 0))
d = ImageDraw.Draw(tel)
d.rounded_rectangle([300, 24, 588, 98], radius=37, fill=(0, 0, 0, 255))
for x in (34, 744):
    d.ellipse([x, 128, x + 110, 238], fill=(225, 222, 232, 235))
d.rounded_rectangle([46, 610, 306, 870], radius=58, outline=(170, 170, 180), width=3)
d.text((340, 625), "FitLink - Trener i", font=font(44, b"SemiBold"), fill=(10, 10, 10))
d.text((340, 680), "vežbači", font=font(44, b"SemiBold"), fill=(10, 10, 10))
d.rounded_rectangle([340, 790, 500, 860], radius=35, fill=(0, 122, 255))
d.text((388, 802), "Get", font=font(38, b"SemiBold"), fill=(255, 255, 255))
m = Image.new("L", tel.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, 888, 1000], radius=110, fill=255)
ok = Image.new("RGB", (968, 1080), (20, 20, 22)); ok.paste(tel.convert("RGB"), (40, 40), m)
ip = ok.resize((774, 864), Image.LANCZOS)

F = font(30, b"Bold")
o = Image.new("RGB", (2500, 1820), (245, 245, 247)); d = ImageDraw.Draw(o)
d.text((20, 30), "Cela slika: zeleno = sigurna zona iz Apple šablona, žuto = iPhone", font=F, fill=(20, 20, 24))
o.paste(zona.resize((1600, 900), Image.LANCZOS), (20, 90))
d.text((1700, 30), "iPhone (vrh stranice)", font=F, fill=(20, 20, 24)); o.paste(ip, (1700, 90))
d.text((20, 1040), "iPad / Mac (21:9)", font=F, fill=(20, 20, 24))
o.paste(hdr.resize((1600, 686), Image.LANCZOS), (20, 1100))
d.text((1700, 1040), "Pretraga (3:2)", font=F, fill=(20, 20, 24))
o.paste(cist.crop((409, 0, 4835, 2950)).resize((774, 516), Image.LANCZOS), (1700, 1100))
o.save("../zaglavlje/pregled-zaglavlje.png", optimize=True)
print("ok")
