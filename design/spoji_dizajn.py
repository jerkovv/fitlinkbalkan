"""Spaja mockup vezbaca i trenera u jednu stranicu za fitlink.rs/dizajn.

Svaki mockup ide u svoj shadow root (deklarativno, uz mali JS fallback), pa se
njihovi CSS-ovi i SVG id-jevi ne sudaraju i ne treba ih prepisivati.
"""
import pathlib
import re

D = pathlib.Path("/Users/jerkov/Documents/fitlinkbalkan/design")
IZLAZI = [
    pathlib.Path("/Users/jerkov/Documents/fitlink-landing/dizajn.html"),
    D / "_preview" / "dizajn.html",
]


def deo(putanja: pathlib.Path) -> str:
    s = putanja.read_text(encoding="utf-8")
    stil = re.search(r"<style>(.*?)</style>", s, re.S).group(1)
    telo = s[s.index("</style>") + len("</style>"):]

    assert stil.count(":root{") == 1, putanja
    stil = stil.replace(":root{", ":host{", 1)
    stil, n_html = re.subn(r"\nhtml\{[^}]*\}", "\n", stil)
    stil, n_body = re.subn(
        r"\nbody\{[^}]*\}",
        "\n:host{display:block;color:var(--tx);font-family:var(--font);-webkit-font-smoothing:antialiased}",
        stil,
    )
    assert n_html == 1 and n_body == 1, (putanja, n_html, n_body)

    # /assets/* na landingu ide na app.fitlink.rs, zato mediji idu u dizajn-slike/
    telo = telo.replace('"assets/baza/', '"dizajn-slike/baza/').replace('"assets/', '"dizajn-slike/')
    assert "assets/" not in telo, putanja
    return f"<style>{stil}</style>{telo.strip()}"


vezbac = deo(D / "fitlink-ponoc.html")
trener = deo(D / "fitlink-ponoc-trener.html")

stranica = f"""<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FitLink Ponoć · dizajn</title>
<meta name="description" content="Koncept tamne teme FitLink aplikacije za vežbača i trenera.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#15111B">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html{{background:#15111B}}
body{{min-height:100vh;background:#15111B radial-gradient(1300px 760px at 50% 0,#453B55,#221C2C 55%,#15111B) no-repeat;color:#F6F3FB;font-family:"Poppins",-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;padding:36px 24px 56px}}
.blok+.blok{{position:relative;margin-top:72px;padding-top:72px}}
.blok+.blok::before{{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(196,162,255,.28),transparent)}}
</style>
</head>
<body>
<section class="blok" id="vezbac"><div><template shadowrootmode="open">{vezbac}</template></div></section>
<section class="blok" id="trener"><div><template shadowrootmode="open">{trener}</template></div></section>
<script>
document.querySelectorAll('template[shadowrootmode]').forEach(function (t) {{
  var host = t.parentNode;
  if (!host.shadowRoot) host.attachShadow({{ mode: 'open' }}).appendChild(t.content);
  t.remove();
}});
</script>
</body>
</html>
"""

for izlaz in IZLAZI:
    izlaz.parent.mkdir(parents=True, exist_ok=True)
    izlaz.write_text(stranica, encoding="utf-8")
    print(izlaz, len(stranica.encode("utf-8")), "bajtova")
