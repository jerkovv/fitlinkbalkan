"""Sastavlja design/fitlink-ponoc-trener-svi.html: svi ekrani trenera na jednoj stranici.

- Osnova (CSS, ikonice, zaglavlje) je ista kao za vezbaca: design/fitlink-ponoc.html
  plus design/vezbac/novo.css, novo2.css i ikone.svg, pa trener/trener.css i trener/ikone.svg.
- Tri odobrena ekrana trenera (Pocetna, Uzivo, Finansije) se uzimaju netaknuta iz
  design/fitlink-ponoc-trener.html i svaki ide u svoj shadow root, jer imaju svoj CSS.
- Novi ekrani su u trener/s*.html; mesta za odobrene su {{T_HOME}}, {{T_LIVE}}, {{T_FIN}}.
"""
import pathlib
import re

D = pathlib.Path(__file__).resolve().parent.parent
T = D / "trener"
V = D / "vezbac"

v1 = (D / "fitlink-ponoc.html").read_text(encoding="utf-8")
stil = re.search(r"<style>(.*?)</style>", v1, re.S).group(1)
defs = re.search(r"<defs>(.*?)</defs>", v1, re.S).group(1)
zaglavlje = re.search(r'<header class="top">.*?</header>', v1, re.S).group(0)
zaglavlje = re.sub(r"<p>.*?</p>", "<p>Ponoć · svi ekrani trenera, od poziva vežbača do naplate</p>", zaglavlje, flags=re.S)
zaglavlje = zaglavlje.replace("FitLink\n  </div>", 'FitLink <em style="font-style:normal;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(139,61,235,.16);color:#C4A2FF">Trener</em>\n  </div>')

css = "\n".join([stil, (V / "novo.css").read_text(encoding="utf-8"), (V / "novo2.css").read_text(encoding="utf-8")] + [p.read_text(encoding="utf-8") for p in sorted(T.glob("*.css"))])
ikone = (V / "ikone.svg").read_text(encoding="utf-8") + (T / "ikone.svg").read_text(encoding="utf-8")

# odobreni ekrani trenera, svaki u svom shadow root-u
tr = (D / "fitlink-ponoc-trener.html").read_text(encoding="utf-8")
tstil = re.search(r"<style>(.*?)</style>", tr, re.S).group(1)
tdefs = re.search(r'<svg width="0" height="0".*?</svg>', tr, re.S).group(0)
assert tstil.count(":root{") == 1
tstil = tstil.replace(":root{", ":host{", 1)
tstil, n1 = re.subn(r"\nhtml\{[^}]*\}", "\n", tstil)
tstil, n2 = re.subn(r"\nbody\{[^}]*\}", "\n:host{display:block;color:var(--tx);font-family:var(--font);-webkit-font-smoothing:antialiased}", tstil)
assert n1 == 1 and n2 == 1
glavni = tr[tr.index('<main class="stage">') + len('<main class="stage">'):tr.index("</main>")]
oznake = ["<!-- 1. POČETNA TRENERA -->", "<!-- 2. UŽIVO: JEDAN VEŽBAČ -->", "<!-- 3. FINANSIJE -->"]
poz = [glavni.index(o) for o in oznake] + [len(glavni)]
odobreni = []
for a, b in zip(poz, poz[1:]):
    telefon = glavni[a:b].strip()
    odobreni.append(f'<div class="host"><template shadowrootmode="open"><style>{tstil}</style>{tdefs}{telefon}</template></div>')

delovi = sorted(T.glob("s*.html"))
sekcije = "\n".join(p.read_text(encoding="utf-8") for p in delovi)
sekcije = sekcije.replace("{{T_HOME}}", odobreni[0]).replace("{{T_LIVE}}", odobreni[1]).replace("{{T_FIN}}", odobreni[2])
assert "{{" not in sekcije

ids = re.findall(r'id="([^"]+)"', defs + ikone)
dupli = sorted({i for i in ids if ids.count(i) > 1})
assert not dupli, dupli

skripte = """<script>
document.querySelectorAll('template[shadowrootmode]').forEach(function (t) {
  var host = t.parentNode;
  if (!host.shadowRoot) host.attachShadow({ mode: 'open' }).appendChild(t.content);
  t.remove();
});
document.querySelectorAll('svg.qr').forEach(function (s) {
  var n = 25, seed = 11, h = '';
  function r() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function oko(x, y) { return (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9); }
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { if (!oko(x, y) && r() < 0.48) h += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'; }
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
    h += '<rect x="' + (p[0] + 0.5) + '" y="' + (p[1] + 0.5) + '" width="6" height="6" fill="none" stroke="#0B0A10" stroke-width="1"/>';
    h += '<rect x="' + (p[0] + 2) + '" y="' + (p[1] + 2) + '" width="3" height="3"/>';
  });
  s.innerHTML = h;
});
</script>"""

stranica = f"""<title>FitLink Ponoć Trener Ekrani</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap" rel="stylesheet">
<style>{css}</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>{defs}{ikone}</defs></svg>
{zaglavlje}
{sekcije}
<footer class="foot">
  <p>Koncept. Sadržaj prati prave ekrane trenera; Početna, Uživo i Finansije su ranije odobrene verzije. Oznaka „Novo“ ispod telefona je ideja. Imena i brojke su primer.</p>
  <p>Sličice vežbi: FitLink baza · Fotografije: StockSnap, CC0</p>
</footer>
{skripte}
"""

izlaz = D / "fitlink-ponoc-trener-svi.html"
izlaz.write_text(stranica, encoding="utf-8")
print(izlaz, len(stranica.encode("utf-8")), "bajtova,", stranica.count('class="phone'), "telefona")
