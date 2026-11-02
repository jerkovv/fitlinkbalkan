"""Sastavlja dve stranice sa Apple Watch ekranima:

- design/fitlink-ponoc-sat.html        vezbac, prati watchOS aplikaciju (sat/s1..s4)
- design/fitlink-ponoc-sat-trener.html trener, ideja koja ne postoji u aplikaciji (sat/s5..s6)

Osnova je ista kao za telefon (design/fitlink-ponoc.html plus vezbac/novo.css, novo2.css,
ikone.svg), a sat dodaje sat/w.css. Izvor sadrzaja vezbaca: ios/App/FitLink Watch Watch App.
"""
import pathlib
import re

D = pathlib.Path(__file__).resolve().parent.parent
S = D / "sat"
V = D / "vezbac"
T = D / "trener"

v1 = (D / "fitlink-ponoc.html").read_text(encoding="utf-8")
stil = re.search(r"<style>(.*?)</style>", v1, re.S).group(1)
defs = re.search(r"<defs>(.*?)</defs>", v1, re.S).group(1)
zaglavlje = re.search(r'<header class="top">.*?</header>', v1, re.S).group(0)

css = "\n".join([stil, (V / "novo.css").read_text(encoding="utf-8"), (V / "novo2.css").read_text(encoding="utf-8"), (S / "w.css").read_text(encoding="utf-8")])
ikone = (V / "ikone.svg").read_text(encoding="utf-8") + (T / "ikone.svg").read_text(encoding="utf-8")
ids = re.findall(r'id="([^"]+)"', defs + ikone)
dupli = sorted({i for i in ids if ids.count(i) > 1})
assert not dupli, dupli

ZNACKA = '<em style="font-style:normal;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(139,61,235,.16);color:#C4A2FF">{0}</em>'


def napravi(delovi, izlaz, naslov, znacka, uvod, podnozje):
    sekcije = "\n".join((S / d).read_text(encoding="utf-8") for d in delovi)
    assert "{{" not in sekcije
    fale = sorted(set(re.findall(r'href="#([^"]+)"', sekcije)) - set(ids))
    assert not fale, fale
    zag = re.sub(r"<p>.*?</p>", "<p>" + uvod + "</p>", zaglavlje, flags=re.S)
    zag = zag.replace("FitLink\n  </div>", "FitLink " + ZNACKA.format(znacka) + "\n  </div>")
    stranica = f"""<title>{naslov}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap" rel="stylesheet">
<style>{css}</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>{defs}{ikone}</defs></svg>
{zag}
{sekcije}
<footer class="foot">
  <p>{podnozje}</p>
</footer>
"""
    p = D / izlaz
    p.write_text(stranica, encoding="utf-8")
    print(p.name, len(stranica.encode("utf-8")), "bajtova,", stranica.count('class="watch"'), "satova")


napravi(
    ["s1-pocetak.html", "s2-trening.html", "s3-zone.html", "s4-kraj.html"],
    "fitlink-ponoc-sat.html",
    "FitLink Ponoć Sat Vežbač",
    "Sat · vežbač",
    "Ponoć · Apple Watch za vežbača, od pokretanja treninga do zona pulsa",
    "Koncept. Ekrani prate watchOS aplikaciju iz repozitorijuma: pokretanje sa sata, serije i pauza, četiri stila zonskog ekrana, poruka trenera i kraj treninga. Brojke su primer.",
)
napravi(
    ["s5-trener-uzivo.html", "s6-trener-dan.html"],
    "fitlink-ponoc-sat-trener.html",
    "FitLink Ponoć Sat Trener",
    "Sat · trener",
    "Ponoć · Apple Watch za trenera, ideja koja još ne postoji u aplikaciji",
    "Koncept i ideja. Sat za trenera ne postoji u aplikaciji. Sve na ovim ekranima oslanja se na podatke koje server već ima: puls uživo, sesije, termini i zahtevi za članarinu. Imena i brojke su primer.",
)
