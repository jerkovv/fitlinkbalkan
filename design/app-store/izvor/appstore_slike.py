#!/usr/bin/env python3
# App Store slike za iPhone (1.1.1): veliki telefon, naslov Plus Jakarta Sans na sredini,
# podnaslov i staklene oznake sa ikonicom (InterTight), nova tamna pozadina.
#
#   python3 appstore_slike.py
#
# 1. Telefoni: novi snimci ekrana (sirovi/) u iPhone okviru iz prvog izdanja.
#    okvir-iphone.png je medijana starih slajdova; stara pozadina se skida po zasicenosti
#    boje (pozadina je zasicena ljubicasta, okvir siv ili crn), pa ostaje samo telefon.
# 2. Satovi: isto, iz starog slajda sa dva Apple Watch-a (okvir-satovi.png).
# 3. Tekst i oznake slaze slajd.html (Chrome), pa se slika smanji i na 1206 x 2622.
#
# Zakljucan ekran se slaze u zakljucan-ekran.html (simulator na njemu pise engleski datum).
# Zaglavlje (vrh stranice i pretraga, 5244 x 2950) je zaglavlje.html, iz istih slojeva.

from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os
import subprocess
import tempfile
import time

OVDE = os.path.dirname(os.path.abspath(__file__))
SIROVI = os.path.join(OVDE, "sirovi")
SLOJEVI = os.path.join(OVDE, "slojevi")
SAT = os.path.join(OVDE, "..", "sat-416x496")
IZLAZ_VELIKI = os.path.join(OVDE, "..", "iphone-1320x2868")
IZLAZ_SREDNJI = os.path.join(OVDE, "..", "iphone-1206x2622")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

K = 1.2                              # uvecanje telefona u odnosu na stari slajd
EKRAN = (220, 636, 1099, 2543)       # ekran u okvir-iphone.png
OSTRVO = (520, 661, 799, 744)
TELO = (174, 589, 1146, 2589)
ISECAK = (150, 568, 1172, 2612)

# Sat u statusnoj traci sirovog snimka (1206 px): okvir oko "09:41" sa malo pozadine,
# ivice slova i poslednja kolona nule (posle nje pocinje "9").
SAT_OKVIR = (150, 74, 292, 122)
SAT_LEVO, SAT_DESNO, NULA_DO = 157, 284, 188

# Satovi na starom slajdu: oblast svakog sata i njegov ekran (x, y, sirina, visina).
SATOVI_OBLAST = [(205, 730, 700, 1600), (635, 1280, 1195, 2205)]
SATOVI_EKRAN = [(274, 958, 349, 416), (711, 1513, 374, 446)]
SATOVI_SNIMCI = ["01-v-set", "03-prsten"]

# Redosled na App Store-u (brojevi su slajdovi iz slajd.html). Prve tri se vide i u
# pretrazi: pracenje uzivo, trening vezbaca, termini.
REDOSLED = [1, 8, 3, 4, 5, 9, 2, 7, 10, 6]

SNIMCI = ["t-pocetna", "zakljucan-ekran", "t-kalendar", "t-uplate", "t-finansije",
          "t-biblioteka", "t-ishrana", "a-trening", "a-napredak", "t-uzivo-detalj"]


def bez_pozadine(c):
    """Providnost po zasicenosti: ljubicasta pozadina nestaje, sivo i crno ostaje."""
    r, b = c[..., 0], c[..., 2]
    mx = c.max(axis=2)
    odnos = (b - r) / np.maximum(mx, 1)
    a = np.clip((0.42 - odnos) / (0.42 - 0.12), 0, 1)
    a[mx < 14] = 1
    return a


def obojeno(c, a, bg):
    """Boja ivice bez primese stare pozadine."""
    aa = np.maximum(a, 0.05)[..., None]
    return np.clip((c - (1 - aa) * bg) / aa, 0, 255)


def maska(w, h, r):
    m = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * 4 - 1, h * 4 - 1], radius=r * 4, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def ostrvo_maska(w, h):
    """Pilula od 1 px manja sa svake strane, da ivica ostrva ne nosi stari rub."""
    m = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([4, 4, w * 4 - 5, h * 4 - 5], radius=(h * 4 - 8) // 2, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def kriva_ugla(l):
    kriva = []
    for k in range(200):
        red = l[EKRAN[1] + k, EKRAN[0]:EKRAN[0] + 300]
        sv = np.where(red > 150)[0]
        kriva.append(int(sv[0]) if len(sv) else 300)
        if kriva[-1] == 0:
            break
    return kriva


def maska_ekrana(ew, eh, kriva, k):
    """iPhone ugao nije krug: kriva se cita sa samog okvira i uvecava."""
    S = 4
    m = Image.new("L", (ew * S, eh * S), 255)
    d = ImageDraw.Draw(m)
    n = len(kriva)
    for r in range(int(n * k) + 1):
        dx = kriva[min(n - 1, int(r / k))] * k
        if dx <= 0:
            continue
        for gy in (r, eh - 1 - r):
            d.rectangle([0, gy * S, int(dx * S) - 1, gy * S + S - 1], fill=0)
            d.rectangle([int((ew - dx) * S), gy * S, ew * S - 1, gy * S + S - 1], fill=0)
    return m.resize((ew, eh), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))


def okvir_telefona():
    put = os.path.join(OVDE, "okvir-iphone.png")
    m = np.asarray(Image.open(put).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = ISECAK
    c = m[y0:y1, x0:x1]
    a = bez_pozadine(c)
    obl = Image.new("L", (x1 - x0, y1 - y0), 0)
    d = ImageDraw.Draw(obl)
    d.rounded_rectangle([TELO[0] - x0 - 2, TELO[1] - y0 - 2, TELO[2] - x0 + 2, TELO[3] - y0 + 2], radius=195, fill=255)
    d.rectangle([0, 0, 40, y1 - y0], fill=255)                  # dugmici sa strane
    d.rectangle([x1 - x0 - 40, 0, x1 - x0, y1 - y0], fill=255)
    a = a * (np.asarray(obl) / 255.0)
    l = np.asarray(Image.open(put).convert("L")).astype(int)
    kriva = kriva_ugla(l)
    # Stari ekran je bio beo: ekran (i 3 px oko njega, sve je to crna ivica) postaje crn i
    # neproziran, inace u uglovima ostaje tanka bela linija izmedju ivice i novog snimka.
    # Ekran ima zaobljene uglove (kriva sa okvira): pravougaonik bi u uglovima prekrio
    # zaobljen okvir telefona crnim coskovima.
    ew, eh = EKRAN[2] - EKRAN[0], EKRAN[3] - EKRAN[1]
    pl = Image.new("L", (ew + 6, eh + 6), 0)
    pl.paste(maska_ekrana(ew, eh, kriva, 1), (3, 3))
    ekr = np.asarray(pl.filter(ImageFilter.MaxFilter(7))) > 0
    ey, ex = EKRAN[1] - y0 - 3, EKRAN[0] - x0 - 3
    a[ey:ey + eh + 6, ex:ex + ew + 6][ekr] = 1
    boja = obojeno(c, a, m[y0:y1, 40][:, None, :])
    boja[ey:ey + eh + 6, ex:ex + ew + 6][ekr] = 0
    rgba = Image.fromarray(np.dstack([boja, a * 255]).astype(np.uint8), "RGBA")
    # Ostrvo sa starog slajda ima svetao rub od belog ekrana: na rubu (6 px) sve sto nije
    # crno postaje crno; kamera u sredini ostaje netaknuta.
    o = np.asarray(Image.open(put).convert("RGB").crop(OSTRVO)).copy()
    h, w = o.shape[:2]
    unutra = Image.new("L", (w, h), 0)
    ImageDraw.Draw(unutra).rounded_rectangle([6, 6, w - 7, h - 7], radius=(h - 12) // 2, fill=255)
    rub = np.asarray(unutra) == 0
    o[rub & (o.max(axis=2) > 25)] = 0
    return rgba, kriva, Image.fromarray(o)


def maska_vremena():
    """Pokrivenost slova "09:41" (isti polozaj i font na svim snimcima), iz snimka sa
    glatkom pozadinom: pozadina se po redu racuna izmedju leve i desne ivice okvira."""
    s = np.asarray(Image.open(os.path.join(SIROVI, "t-uzivo-detalj.png")).convert("L")).astype(float)
    x0, y0, x1, y1 = SAT_OKVIR
    r = s[y0:y1, x0:x1]
    t = np.linspace(0, 1, x1 - x0)[None, :]
    bg = r[:, :4].mean(1)[:, None] * (1 - t) + r[:, -4:].mean(1)[:, None] * t
    a = np.clip((r - bg) / (255 - bg), 0, 1)
    a[a < 0.03] = 0
    return a


def prosiri(m, n):
    for _ in range(n):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def vreme_bez_nule(s, a):
    """Simulator (24 h) pise "09:41", a App Store slike nose "9:41" kao kod Apple-a.
    Nula se brise (pozadina se popuni okolinom), a pravi "9:41" iz snimka se pomeri
    ulevo tako da ostane centriran. Nista se ne crta novim fontom."""
    x0, y0, x1, y1 = SAT_OKVIR
    c = np.asarray(s.convert("RGB")).astype(float).copy()
    p = c[y0:y1, x0:x1].copy()
    boja = p[a > 0.95].mean(axis=0)
    nepoznato = prosiri(a > 0, 2)
    h, w = nepoznato.shape
    for y in range(h):
        zna = np.where(~nepoznato[y])[0]
        for k in range(3):
            p[y, :, k] = np.interp(np.arange(w), zna, p[y, zna, k])
    for _ in range(800):
        z = (np.roll(p, 1, 0) + np.roll(p, -1, 0) + np.roll(p, 1, 1) + np.roll(p, -1, 1)) / 4
        p[nepoznato] = z[nepoznato]
    # Iza sata su dve ravne boje (npr. slike vezbi na crnom): razmazan prelaz postaje ostra
    # ivica, po sredini izmedju dve boje, sa glatkim rubom.
    sv = p[~nepoznato].mean(axis=1)
    if sv.max() - sv.min() > 80:
        prag = (sv.max() + sv.min()) / 2
        tamna = p[~nepoznato][sv < prag].mean(axis=0)
        svetla = p[~nepoznato][sv >= prag].mean(axis=0)
        v = (p.mean(axis=2) - tamna.mean()) / (svetla.mean() - tamna.mean())
        vv = Image.fromarray(np.clip(v * 255, 0, 255).astype(np.uint8)).resize((w * 4, h * 4), Image.BILINEAR)
        pok = np.asarray(Image.fromarray(((np.asarray(vv) > 127) * 255).astype(np.uint8))
                         .resize((w, h), Image.BOX)).astype(float)[..., None] / 255
        ostro = tamna * (1 - pok) + svetla * pok
        p[nepoznato] = ostro[nepoznato]
    devet = a.copy()
    devet[:, :NULA_DO + 1 - x0] = 0
    pomak = round((SAT_LEVO + SAT_DESNO) / 2 - (NULA_DO + 1 + SAT_DESNO) / 2)
    devet = np.roll(devet, pomak, axis=1)[..., None]
    c[y0:y1, x0:x1] = p * (1 - devet) + boja * devet
    return Image.fromarray(np.clip(c + 0.5, 0, 255).astype(np.uint8))


def telefon(okvir, kriva, ostrvo, snimak, sat=None):
    k = K
    sl = okvir.convert("RGBa").resize((round(okvir.width * k), round(okvir.height * k)), Image.LANCZOS).convert("RGBA")
    ex0, ey0 = round((EKRAN[0] - ISECAK[0]) * k), round((EKRAN[1] - ISECAK[1]) * k)
    ew, eh = round((EKRAN[2] - EKRAN[0]) * k), round((EKRAN[3] - EKRAN[1]) * k)
    s = Image.open(os.path.join(SIROVI, snimak + ".png")).convert("RGB")
    if sat is not None and snimak != "zakljucan-ekran":
        s = vreme_bez_nule(s, sat)
    s = s.resize((ew, round(s.height * ew / s.width)), Image.LANCZOS).crop((0, 0, ew, eh))
    sl.paste(s, (ex0, ey0), maska_ekrana(ew, eh, kriva, k))
    ow, oh = round(ostrvo.width * k), round(ostrvo.height * k)
    sl.paste(ostrvo.resize((ow, oh), Image.LANCZOS),
             (round((OSTRVO[0] - ISECAK[0]) * k), round((OSTRVO[1] - ISECAK[1]) * k)), ostrvo_maska(ow, oh))
    return sl


def satovi():
    """Dva Apple Watch-a sa starog slajda, sa novim ekranima."""
    m = np.asarray(Image.open(os.path.join(OVDE, "okvir-satovi.png")).convert("RGB")).astype(np.float32)
    bx0 = min(o[0] for o in SATOVI_OBLAST)
    by0 = min(o[1] for o in SATOVI_OBLAST)
    bx1 = max(o[2] for o in SATOVI_OBLAST)
    by1 = max(o[3] for o in SATOVI_OBLAST)
    c = m[by0:by1, bx0:bx1]
    a = bez_pozadine(c)
    obl = Image.new("L", (bx1 - bx0, by1 - by0), 0)
    for o in SATOVI_OBLAST:
        ImageDraw.Draw(obl).rectangle([o[0] - bx0, o[1] - by0, o[2] - bx0, o[3] - by0], fill=255)
    a = a * (np.asarray(obl) / 255.0)
    boja = obojeno(c, a, m[by0:by1, 40][:, None, :])
    sl = Image.fromarray(np.dstack([boja, a * 255]).astype(np.uint8), "RGBA")
    for (x, y, w, h), ime in zip(SATOVI_EKRAN, SATOVI_SNIMCI):
        e = Image.open(os.path.join(SAT, ime + ".png")).convert("RGB").resize((w, h), Image.LANCZOS)
        sl.paste(e, (x - bx0, y - by0), maska(w, h, round(w * 0.21)))
    return sl


def jedan_sat():
    """Desni sat sa starog slajda (ekran zone pulsa), za zaglavlje (zaglavlje.html)."""
    m = np.asarray(Image.open(os.path.join(OVDE, "okvir-satovi.png")).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = SATOVI_OBLAST[1]
    c = m[y0:y1, x0:x1]
    a = bez_pozadine(c)
    boja = obojeno(c, a, m[y0:y1, 40][:, None, :])
    sl = Image.fromarray(np.dstack([boja, a * 255]).astype(np.uint8), "RGBA")
    x, y, w, h = SATOVI_EKRAN[1]
    e = Image.open(os.path.join(SAT, SATOVI_SNIMCI[1] + ".png")).convert("RGB").resize((w, h), Image.LANCZOS)
    sl.paste(e, (x - x0, y - y0), maska(w, h, round(w * 0.21)))
    sl = sl.crop(sl.getbbox())
    p = np.asarray(sl).copy()
    p[:185, :100, 3] = 0          # komadic levog sata koji upadne u oblast
    sl = Image.fromarray(p)
    return sl.crop(sl.getbbox())


def snimi(adresa, izlaz):
    with tempfile.TemporaryDirectory() as profil:
        subprocess.run([CHROME, "--headless=new", f"--user-data-dir={profil}", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", "--virtual-time-budget=8000", "--window-size=1320,2868",
                        f"--screenshot={izlaz}", adresa], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=180, check=True)


if __name__ == "__main__":
    os.makedirs(SLOJEVI, exist_ok=True)
    os.makedirs(IZLAZ_VELIKI, exist_ok=True)
    os.makedirs(IZLAZ_SREDNJI, exist_ok=True)

    okvir, kriva, ostrvo = okvir_telefona()
    sat = maska_vremena()
    for s in SNIMCI:
        telefon(okvir, kriva, ostrvo, s, sat).save(os.path.join(SLOJEVI, f"tel-{s}.png"))
        print("telefon", s)
    satovi().save(os.path.join(SLOJEVI, "satovi.png"))
    jedan_sat().save(os.path.join(SLOJEVI, "sat-prsten.png"))
    print("satovi")

    v = int(time.time())
    for i, slajd in enumerate(REDOSLED, 1):
        n = f"{i:02d}"
        put = os.path.join(IZLAZ_VELIKI, n + ".png")
        snimi(f"file://{OVDE}/slajd.html?n={slajd}&v={v}", put)
        im = Image.open(put).convert("RGB")
        im.save(put, optimize=True)
        im.resize((1206, 2622), Image.LANCZOS).save(os.path.join(IZLAZ_SREDNJI, n + ".png"), optimize=True)
        print("slajd", n)
