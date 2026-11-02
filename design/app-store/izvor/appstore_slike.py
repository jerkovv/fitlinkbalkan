#!/usr/bin/env python3
# App Store slike za iPhone, u stilu prvog izdanja (avgust 2026): InterTight naslov u dva
# reda (beli, pa roze), oznaka TRENER/VEZBAC, telefon u istom iPhone okviru i tamne
# oznake sa tackom. Ekrani su iz nove aplikacije (simulator, demo -demo / -trener).
#
# Okvir telefona (okvir-iphone.png) je medijana starih slajdova: oznake koje su na svakom
# slajdu na drugom mestu nestaju, ostaju pozadina, senka, okvir i Dynamic Island.
# Slajdovi bez telefona (zakljucan ekran, sat) koriste stari slajd kao podlogu.
#
#   python3 appstore_slike.py        -> ../iphone-1320x2868 i ../iphone-1206x2622

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import os

OVDE = os.path.dirname(os.path.abspath(__file__))
SIROVI = os.path.join(OVDE, "sirovi")
SAT = os.path.join(OVDE, "..", "sat-416x496")
IZLAZ_VELIKI = os.path.join(OVDE, "..", "iphone-1320x2868")
IZLAZ_SREDNJI = os.path.join(OVDE, "..", "iphone-1206x2622")
FONT = os.path.join(OVDE, "InterTight.ttf")

W, H = 1320, 2868
BELA = (255, 255, 255)
ROZE = (236, 72, 153)
BOJE = {"roze": (236, 72, 153), "zuta": (250, 204, 21), "ljubicasta": (167, 139, 250),
        "zelena": (52, 211, 153), "crvena": (244, 94, 94)}

# Ekran i ostrvo u okviru, izmereni na okvir-iphone.png.
EKRAN = (220, 636, 1099, 2543)
EKRAN_R = 145
OSTRVO = (520, 661, 799, 744)

# Ekrani sata na starom slajdu (nadjeni poredjenjem sa starim snimcima sata).
SATOVI = [(274, 958, 349, 416), (711, 1513, 374, 446)]


def font(size, weight=b"ExtraBold"):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f


def maska_zaobljena(w, h, r, nadsemplovanje=4):
    k = nadsemplovanje
    m = Image.new("L", (w * k, h * k), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * k - 1, h * k - 1], radius=r * k, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def popravi_vrh(im):
    """Vrh podloge (oznaka i naslov sa starih slajdova) zamenjuje se odrazom desne
    strane, gde nema teksta; sjaj pozadine je simetrican oko x=690."""
    a = np.asarray(im.convert("RGB")).copy()
    for x in range(0, 700):
        a[110:540, x] = a[110:540, 1380 - x] if 1380 - x < W else a[110:540, W - 1]
    return Image.fromarray(a)


def cist_vrh(im):
    """Ceo pojas oznake i naslova sa cistom pozadinom (iz okvira telefona)."""
    vrh = popravi_vrh(Image.open(os.path.join(OVDE, "okvir-iphone.png"))).crop((0, 100, W, 560))
    im = im.convert("RGB")
    im.paste(vrh, (0, 100))
    return im


def obrisi_pojas(im, x0, y0, x1, y1):
    """Prebrisi pravougaonik linearnim prelazom izmedju reda iznad i reda ispod."""
    a = np.asarray(im.convert("RGB")).astype(float).copy()
    gore, dole = a[y0 - 1, x0:x1], a[y1 + 1, x0:x1]
    for y in range(y0, y1 + 1):
        t = (y - y0 + 1) / (y1 - y0 + 2)
        a[y, x0:x1] = gore * (1 - t) + dole * t
    return Image.fromarray(a.astype(np.uint8))


def znacka(im, tekst, obris=False):
    d = ImageDraw.Draw(im)
    f = font(31, b"Bold")
    razmak = 5
    sirina = sum(d.textlength(c, font=f) + razmak for c in tekst) - razmak
    x0, y0, x1, y1 = 92, 150, 92 + sirina + 62, 223
    if obris:
        d.rounded_rectangle([x0, y0, x1, y1], radius=37, fill=(26, 22, 44),
                            outline=(150, 140, 190), width=3)
        boja = (226, 220, 245)
    else:
        pas = Image.new("RGB", (int(x1 - x0), int(y1 - y0)))
        pd = ImageDraw.Draw(pas)
        for x in range(pas.width):
            t = x / pas.width
            pd.line([(x, 0), (x, pas.height)],
                    fill=(int(168 + (236 - 168) * t), int(85 + (72 - 85) * t), int(247 + (153 - 247) * t)))
        im.paste(pas, (int(x0), int(y0)), maska_zaobljena(pas.width, pas.height, 37))
        boja = BELA
    x = x0 + 31
    for c in tekst:
        d.text((x, (y0 + y1) / 2), c, font=f, fill=boja, anchor="lm")
        x += d.textlength(c, font=f) + razmak


def naslov(im, red1, red2):
    d = ImageDraw.Draw(im)
    f = font(89)
    d.text((92, 293), red1, font=f, fill=BELA, anchor="la")
    d.text((92, 393), red2, font=f, fill=ROZE, anchor="la")


def oznaka(im, tekst, boja, sredina, strana):
    d = ImageDraw.Draw(im)
    f = font(37, b"SemiBold")
    w = d.textlength(tekst, font=f) + 106
    x0 = 36 if strana == "L" else 1284 - w
    y0 = round(sredina - 33)
    y1 = y0 + 66
    sen = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sen).rounded_rectangle([x0, y0 + 6, x0 + w, y1 + 6], radius=33, fill=(0, 0, 0, 110))
    im.alpha_composite(sen.filter(ImageFilter.GaussianBlur(11)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([x0, y0, x0 + w, y1], radius=33, fill=(24, 21, 34, 245))
    cy = (y0 + y1) / 2
    d.ellipse([x0 + 30, cy - 10, x0 + 50, cy + 10], fill=BOJE[boja])
    d.text((x0 + 68, cy), tekst, font=f, fill=BELA, anchor="lm")


def maska_ekrana():
    """Oblik ekrana iz samog okvira: za svaki red ugla trazi se prvi svetao piksel od
    ivice (iPhone ugao nije obican krug). Kriva levog gornjeg ugla se preslikava na
    sva cetiri, pa stari sadrzaj ekrana ne moze da procuri."""
    l = np.asarray(Image.open(os.path.join(OVDE, "okvir-iphone.png")).convert("L")).astype(int)
    x0, y0, x1, y1 = EKRAN
    ew, eh = x1 - x0, y1 - y0
    kriva = []
    for k in range(200):
        red = l[y0 + k, x0:x0 + 300]
        svetli = np.where(red > 150)[0]
        kriva.append(int(svetli[0]) if len(svetli) else 300)
        if kriva[-1] == 0:
            break
    K = 4
    m = Image.new("L", (ew * K, eh * K), 255)
    d = ImageDraw.Draw(m)
    for k, dx in enumerate(kriva):
        if dx <= 0:
            continue
        for gy in (k, eh - 1 - k):
            d.rectangle([0, gy * K, dx * K - 1, gy * K + K - 1], fill=0)
            d.rectangle([(ew - dx) * K, gy * K, ew * K - 1, gy * K + K - 1], fill=0)
    return m.resize((ew, eh), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))


def telefon(snimak):
    """Novi ekran u starom okviru; ostrvo ostaje iz okvira."""
    baza = popravi_vrh(Image.open(os.path.join(OVDE, "okvir-iphone.png")))
    ostrvo = baza.crop(OSTRVO)
    s = Image.open(os.path.join(SIROVI, snimak + ".png")).convert("RGB")
    ew, eh = EKRAN[2] - EKRAN[0], EKRAN[3] - EKRAN[1]
    s = s.resize((ew, round(s.height * ew / s.width)), Image.LANCZOS).crop((0, 0, ew, eh))
    baza.paste(s, EKRAN[:2], maska_ekrana())
    ow, oh = OSTRVO[2] - OSTRVO[0], OSTRVO[3] - OSTRVO[1]
    baza.paste(ostrvo, OSTRVO[:2], maska_zaobljena(ow, oh, oh // 2))
    return baza.convert("RGBA")


def zakljucan_ekran():
    """Kartica sa zakljucanog ekrana, velika, na mestu stare kartice."""
    baza = cist_vrh(Image.open(os.path.join(OVDE, "stari-zakljucan.png")))
    baza = obrisi_pojas(baza, 0, 1220, W - 1, 2100)
    s = Image.open(os.path.join(SIROVI, "t-zakljucan.png")).convert("RGB")
    kartica = s.crop((42, 1788, 1164, 2238))
    nw = 1187
    nh = round(kartica.height * nw / kartica.width)
    kartica = kartica.resize((nw, nh), Image.LANCZOS)
    x0, y0 = (W - nw) // 2, 1666 - nh // 2
    im = baza.convert("RGBA")
    sen = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sen).rounded_rectangle([x0 + 30, y0 + 40, x0 + nw - 30, y0 + nh + 20], radius=70,
                                          fill=(0, 0, 0, 150))
    im.alpha_composite(sen.filter(ImageFilter.GaussianBlur(45)))
    im.paste(kartica, (x0, y0), maska_zaobljena(nw, nh, 70))
    return im


def satovi():
    """Novi ekrani sata u starim Apple Watch okvirima."""
    baza = cist_vrh(Image.open(os.path.join(OVDE, "okvir-satovi.png")))
    baza = obrisi_pojas(baza, 780, 900, 1150, 1015)    # stara oznaka "Serije na ruci"
    baza = obrisi_pojas(baza, 140, 1620, 480, 1730)    # stara oznaka "Zone pulsa"
    for (x, y, w, h), ime in zip(SATOVI, ["01-v-set", "03-prsten"]):
        e = Image.open(os.path.join(SAT, ime + ".png")).convert("RGB").resize((w, h), Image.LANCZOS)
        baza.paste(e, (x, y), maska_zaobljena(w, h, round(w * 0.2)))
    return baza.convert("RGBA")


SLAJDOVI = [
    dict(ime="01", ekran="t-pocetna", znak="TRENER", r1="VIDIŠ KO TRENIRA", r2="DOK TRENIRA",
         ozn=[("Puls uživo", "crvena", 1352, "L"), ("Kalorije", "zuta", 1425, "D"),
              ("Apple Watch", "ljubicasta", 1640, "L")]),
    dict(ime="02", poseban=zakljucan_ekran, znak="TRENER", r1="CELA GRUPA NA", r2="ZAKLJUČANOM EKRANU",
         ozn=[("Puls i kalorije uživo", "crvena", 1300, "L"), ("Bez otvaranja aplikacije", "ljubicasta", 2040, "D")]),
    dict(ime="03", ekran="t-kalendar", znak="TRENER", r1="TERMINI SE", r2="POPUNE SAMI",
         ozn=[("12 rezervacija", "ljubicasta", 1340, "L"), ("Lista čekanja", "roze", 1562, "D")]),
    dict(ime="04", ekran="t-uplate", znak="TRENER", r1="ČLANARINA", r2="U DVA KLIKA",
         ozn=[("Keš ili račun", "zuta", 1598, "D"), ("Potvrdi i gotovo", "zelena", 1903, "L")]),
    dict(ime="05", ekran="t-finansije", znak="TRENER", r1="ZNAŠ KOLIKO SI", r2="ZARADIO",
         ozn=[("Rast +12%", "zelena", 1030, "D"), ("Ko nije platio", "zuta", 1668, "L")]),
    dict(ime="06", ekran="t-biblioteka", znak="TRENER", r1="4.699 VEŽBI", r2="U BIBLIOTECI",
         ozn=[("Po mišićnoj grupi", "ljubicasta", 1622, "L"), ("Svaka sa snimkom", "roze", 1860, "D")]),
    dict(ime="07", ekran="t-ishrana", znak="TRENER", r1="PLAN ISHRANE", r2="DO GRAMA",
         ozn=[("Kalorije i makroi", "zuta", 1390, "D"), ("Gram po gram", "roze", 2072, "L"),
              ("Dodeli u jedan klik", "zelena", 2300, "D")]),
    dict(ime="08", ekran="a-trening", znak="VEŽBAČ", obris=True, r1="VIDIŠ TAČNO", r2="KAKO SE RADI",
         ozn=[("Animacija vežbe", "roze", 1000, "L"), ("Puls i kalorije", "crvena", 1292, "D"),
              ("Prošli put", "zuta", 1555, "L")]),
    dict(ime="09", poseban=satovi, znak="VEŽBAČ", obris=True, r1="TRENING BEZ", r2="TELEFONA U RUCI",
         ozn=[("Serije na ruci", "ljubicasta", 958, "D"), ("Zone pulsa i kalorije", "roze", 1675, "L")]),
    dict(ime="10", ekran="a-napredak", znak="VEŽBAČ", obris=True, r1="NAPREDAK KOJI", r2="SE VIDI",
         ozn=[("Niz treninga", "zuta", 1318, "D"), ("Lični rekordi", "ljubicasta", 1920, "L")]),
]


def napravi(s):
    im = s["poseban"]() if "poseban" in s else telefon(s["ekran"])
    znacka(im, s["znak"], s.get("obris", False))
    naslov(im, s["r1"], s["r2"])
    for t, b, y, strana in s["ozn"]:
        oznaka(im, t, b, y, strana)
    return im.convert("RGB")


if __name__ == "__main__":
    os.makedirs(IZLAZ_VELIKI, exist_ok=True)
    os.makedirs(IZLAZ_SREDNJI, exist_ok=True)
    for s in SLAJDOVI:
        im = napravi(s)
        im.save(os.path.join(IZLAZ_VELIKI, s["ime"] + ".png"), optimize=True)
        im.resize((1206, 2622), Image.LANCZOS).save(os.path.join(IZLAZ_SREDNJI, s["ime"] + ".png"), optimize=True)
        print("napravljen", s["ime"])
