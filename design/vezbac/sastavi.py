"""Sastavlja design/fitlink-ponoc-vezbac.html: svi ekrani vezbaca na jednoj stranici.

Tri odobrena ekrana (Pocetna, Aktivan trening, Ishrana) i njihov CSS se uzimaju iz
design/fitlink-ponoc.html, novi ekrani iz delova u design/vezbac/.
"""
import pathlib
import re

D = pathlib.Path(__file__).resolve().parent.parent
V = D / "vezbac"

v1 = (D / "fitlink-ponoc.html").read_text(encoding="utf-8")
stil = re.search(r"<style>(.*?)</style>", v1, re.S).group(1)
defs = re.search(r"<defs>(.*?)</defs>", v1, re.S).group(1)
zaglavlje = re.search(r'<header class="top">.*?</header>', v1, re.S).group(0)
telefoni = re.findall(r'<section class="phone[^"]*"[^>]*>.*?</section>', v1, re.S)
assert len(telefoni) == 3, len(telefoni)
home, live, ishrana = telefoni

novo_css = (V / "novo.css").read_text(encoding="utf-8") + "\n" + (V / "novo2.css").read_text(encoding="utf-8")
ikone = (V / "ikone.svg").read_text(encoding="utf-8")
delovi = ["s1-ulazak.html", "s2a-trening.html", "s2b-trening.html", "s3-napredak.html", "s4-termini.html", "s5-profil.html"]
sekcije = "\n".join((V / d).read_text(encoding="utf-8") for d in delovi)
sekcije = sekcije.replace("{{V1_HOME}}", home).replace("{{V1_LIVE}}", live).replace("{{V1_ISHRANA}}", ishrana)
assert "{{" not in sekcije

ids = re.findall(r'id="([^"]+)"', defs + ikone)
dupli = sorted({i for i in ids if ids.count(i) > 1})
assert not dupli, dupli

zaglavlje = re.sub(r"<p>.*?</p>", "<p>Ponoć · svi ekrani vežbača, od poziva do profila</p>", zaglavlje, flags=re.S)

qr = """<script>
document.querySelectorAll('svg.qr').forEach(function (s) {
  var n = 25, seed = 7, h = '';
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

stranica = f"""<title>FitLink Ponoć Vežbač</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap" rel="stylesheet">
<style>{stil}
{novo_css}</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>{defs}{ikone}</defs></svg>
{zaglavlje}
{sekcije}
<footer class="foot">
  <p>Koncept. Sadržaj prati prave ekrane vežbača; Početna, Aktivan trening i Ishrana su ranije odobrene verzije sa idejama. Imena i brojke su primer.</p>
  <p>Sličice i snimak vežbi: FitLink baza · Fotografije: StockSnap, CC0</p>
</footer>
{qr}
"""

izlaz = D / "fitlink-ponoc-vezbac.html"
izlaz.write_text(stranica, encoding="utf-8")
print(izlaz, len(stranica.encode("utf-8")), "bajtova,", stranica.count('class="phone'), "telefona")
