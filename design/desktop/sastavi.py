#!/usr/bin/env python3
"""Sastavlja desktop mockupe trenera (Ponoc) iz delova u ovom folderu.

  python3 design/desktop/sastavi.py          # pravi HTML za svaki ekran i zbirnu stranicu
  python3 design/desktop/sastavi.py slike    # uz to i PNG svakog ekrana (headless Chrome)

Svaki ekran je fajl eNN-ime.html koji sadrzi samo ono sto ide u .content; prvi red je
komentar <!-- ekran: Naslov | stavka menija | visina prozora | potpis -->.
Okvir (prozor, bocni meni, gornja traka), osnova.css, dodatak.css i ikone.svg su zajednicki.
"""
import re, subprocess, sys
from pathlib import Path

OVDE = Path(__file__).resolve().parent
DESIGN = OVDE.parent
IZLAZ = OVDE / "ekrani"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

MENI = [
    ("Pregled", [("Početna", "home", ""), ("Uživo", "radio", "<em><i></i>4</em>"), ("Vežbači", "users", "")]),
    ("Raspored", [("Kalendar", "calclock", ""), ("Termini", "calcog", "")]),
    ("Sadržaj", [("Biblioteka vežbi", "dumbbell", ""), ("Programi treninga", "clipboard", ""), ("Planovi ishrane", "apple", "")]),
    ("Poslovanje", [("Finansije", "bars", ""), ("Paketi članarina", "idcard", ""), ("Uplate", "wallet", '<em class="n">2</em>')]),
    ("Komunikacija", [("Poruke", "chat", '<em class="n">2</em>'), ("Obaveštenja", "bell", "")]),
]


def meni(aktivno: str) -> str:
    d = ['<aside class="side">',
         '<div class="logo"><i><svg viewBox="0 0 828.12 517.2"><use href="#mark" fill="#fff"/></svg></i><b>FitLink</b></div>']
    for naslov, stavke in MENI:
        d.append(f'<div class="grp"><div class="gt2">{naslov}</div><div class="nav">')
        for ime, ikona, znacka in stavke:
            on = ' class="on"' if ime == aktivno else ""
            d.append(f'<span{on}><svg class="i"><use href="#{ikona}"/></svg>{ime}{znacka}</span>')
        d.append("</div></div>")
    d.append("</aside>")
    return "\n".join(d)


TRAKA = """<div class="bar">
  <span class="date"><svg class="i"><use href="#cal"/></svg>Utorak, 13. oktobar</span>
  <label class="trazi"><svg class="i"><use href="#search"/></svg><span>Pretraži vežbače, programe, vežbe</span><kbd>⌘K</kbd></label>
  <div class="acts">
    <span class="ib" aria-label="Poruke"><svg class="i"><use href="#chat"/></svg><span class="badge">2</span></span>
    <span class="ib" aria-label="Obaveštenja"><svg class="i"><use href="#bell"/></svg><span class="badge">5</span></span>
    <img class="me" src="../../assets/kettlebell-man.jpg" alt="">
  </div>
</div>"""


def ekrani():
    for f in sorted(OVDE.glob("e[0-9][0-9]-*.html")):
        t = f.read_text(encoding="utf-8")
        m = re.match(r"\s*<!--\s*ekran:\s*(.*?)\s*-->", t)
        naslov, stavka, visina, potpis = (f.stem, "Početna", "900", "")
        if m:
            delovi = [d.strip() for d in m.group(1).split("|")] + ["", "", "", ""]
            naslov, stavka, visina, potpis = delovi[0] or f.stem, delovi[1] or "Početna", delovi[2] or "900", delovi[3]
            t = t[m.end():]
        yield f.stem, naslov, stavka, visina, potpis, t.strip("\n")


def prozor(stavka: str, visina: str, sadrzaj: str, putanja: str) -> str:
    return f"""<div class="win" style="--h:{visina}px" role="img">
  <div class="chrome">
    <div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
    <div class="url"><svg class="i"><use href="#lock"/></svg><b>fitlink.rs</b>{putanja}</div>
    <div class="sp"></div>
  </div>
  <div class="app">
{meni(stavka)}
    <div class="col">
{TRAKA}
      <div class="content">
{sadrzaj}
      </div>
    </div>
  </div>
</div>"""


PUTANJE = {"Početna": "/trener", "Uživo": "/trener/uzivo", "Vežbači": "/trener/vezbaci", "Kalendar": "/trener/kalendar",
           "Termini": "/trener/termini", "Biblioteka vežbi": "/trener/biblioteka", "Programi treninga": "/trener/programi",
           "Planovi ishrane": "/trener/ishrana", "Finansije": "/trener/finansije", "Paketi članarina": "/trener/paketi",
           "Uplate": "/trener/uplate", "Poruke": "/trener/chat", "Obaveštenja": "/trener/notifikacije"}

GLAVA = """<!doctype html>
<html lang="sr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{naslov}</title>
<style>
{css}
</style>
{ikone}
"""


def main():
    css = (OVDE / "osnova.css").read_text(encoding="utf-8") + "\n" + (OVDE / "dodatak.css").read_text(encoding="utf-8")
    ikone = (OVDE / "ikone.svg").read_text(encoding="utf-8")
    IZLAZ.mkdir(exist_ok=True)
    svi = []
    for ime, naslov, stavka, visina, potpis, sadrzaj in ekrani():
        p = prozor(stavka, visina, sadrzaj, PUTANJE.get(stavka, "/trener"))
        jedan = GLAVA.format(naslov=f"FitLink desktop - {naslov}", css=css, ikone=ikone)
        jedan += f'<body class="jedan"><main class="stage"><div class="scaler">{p}</div></main></body></html>\n'
        (IZLAZ / f"{ime}.html").write_text(jedan, encoding="utf-8")
        svi.append((ime, naslov, potpis, p))
        if any(c in sadrzaj for c in "–—"):
            print("UPOZORENJE, duga crtica u", ime)
    # zbirna stranica: svi ekrani jedan ispod drugog, slike se traze iz design/
    zbir = GLAVA.format(naslov="FitLink Ponoć Desktop, svi ekrani", css=css, ikone=ikone)
    zbir += '<body><header class="top"><div class="brand"><svg viewBox="0 0 828.12 517.2" aria-hidden="true"><use href="#mark" fill="url(#gbrand)"/></svg>FitLink <em>Desktop</em></div><p>Ponoć · trenerova veb aplikacija na računaru, svi ekrani</p></header>\n'
    for ime, naslov, potpis, p in svi:
        zbir += f'<section class="ekran"><div class="pot"><h2>{naslov}</h2><p>{potpis}</p></div><main class="stage"><div class="scaler">{p}</div></main></section>\n'
    zbir += '<footer class="foot"><p>Koncept. Imena, iznosi i brojke su primer.</p><p>Na manjem ekranu prozor se smanjuje.</p></footer></body></html>\n'
    zbir = zbir.replace("../../assets/", "assets/")
    (DESIGN / "fitlink-ponoc-desktop-svi.html").write_text(zbir, encoding="utf-8")
    print(f"{len(svi)} ekrana")

    if len(sys.argv) > 1 and sys.argv[1] == "slike":
        (OVDE / "slike").mkdir(exist_ok=True)
        samo = sys.argv[2:]
        for ime, naslov, stavka, visina, potpis, _ in ekrani():
            if samo and not any(s in ime for s in samo):
                continue
            h = int(visina) + 64
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", "--virtual-time-budget=3000",
                            f"--window-size=1344,{h}", f"--screenshot={OVDE / 'slike' / (ime + '.png')}",
                            f"file://{IZLAZ / (ime + '.html')}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
            print("slika", ime)


if __name__ == "__main__":
    main()
