# -*- coding: utf-8 -*-
# Generator reklamnih vizuala za FitLink (ciljna grupa: treneri).
# Svaki slajd je jedan HTML fajl; render ide kroz headless Chrome.
import os, html

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(os.path.dirname(OUT), "font")

GLYPH = '<svg viewBox="0 0 828.12 517.2" style="height:100%;width:auto;display:block" fill="currentColor"><path d="M662.2.44l-142.2,81.41v76.48l117.57-67.31,99.98,174.63-255.11,146.05c-10.34,5.92-19.44,1.93-22.88-.06-3.43-1.99-11.42-7.91-11.42-19.82v-36.17s198.53-113.66,198.53-113.66l-32.97-57.6-165.59,94.8-.02-79.69.05-.03v-76.48l-.09.05c-.61-31.48-17.15-59.58-44.49-75.43-27.86-16.15-61.18-16.24-89.13-.24L0,227.37l165.92,289.83,150.04-85.9v-76.48l-125.42,71.8-99.98-174.63L347.39,104.97c10.34-5.92,19.44-1.93,22.87.06,3.43,1.99,11.42,7.91,11.42,19.82v36.17s-189.19,108.31-189.19,108.31l32.97,57.6,156.25-89.45.02,79.69-.23.13v76.48l.27-.15c.61,31.48,17.15,59.58,44.49,75.43,27.86,16.15,61.18,16.24,89.13.24l312.71-179.02L662.2.44Z"/></svg>'

GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

CSS = f"""
@font-face {{ font-family:'PPNM'; src:url('{FONT}/ppneuemontreal-thin.otf'); font-weight:200; }}
@font-face {{ font-family:'PPNM'; src:url('{FONT}/ppneuemontreal-book.otf'); font-weight:400; }}
@font-face {{ font-family:'PPNM'; src:url('{FONT}/ppneuemontreal-medium.otf'); font-weight:500; }}
@font-face {{ font-family:'PPNM'; src:url('{FONT}/ppneuemontreal-bold.otf'); font-weight:700; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html,body {{ width:100%; height:100%; }}
body {{ font-family:'PPNM',sans-serif; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; overflow:hidden; }}

.canvas {{ position:relative; width:100%; height:100%; display:flex; flex-direction:column; padding:84px; }}
.story .canvas {{ padding:96px 84px 120px; }}

/* teme */
.dark  {{ background:#0d0d14; color:#f5f4f8; }}
.light {{ background:#fafafc; color:#16161f; }}
.dark .mesh {{ position:absolute; inset:0; background:
  radial-gradient(58% 44% at 88% 6%, rgba(139,63,224,.40) 0%, transparent 62%),
  radial-gradient(42% 34% at 4% 100%, rgba(99,71,232,.30) 0%, transparent 60%),
  radial-gradient(30% 24% at 100% 78%, rgba(224,79,183,.16) 0%, transparent 60%); }}
.grain {{ position:absolute; inset:0; opacity:.13; mix-blend-mode:overlay; background:{GRAIN}; }}
.light .grain {{ opacity:.20; mix-blend-mode:multiply; }}

/* gornja i donja traka */
.top {{ position:relative; display:flex; align-items:center; justify-content:space-between;
        padding-bottom:34px; border-bottom:1.5px solid rgba(22,22,31,.12); }}
.dark .top {{ border-color:rgba(255,255,255,.16); }}
.brand {{ display:flex; align-items:center; gap:20px; }}
.brand .g {{ height:40px; color:#8B3FE0; }}
.brand .w {{ font-weight:500; font-size:31px; letter-spacing:.14em; }}
.top .site {{ font-weight:400; font-size:27px; letter-spacing:.02em; opacity:.62; }}
.bottom {{ position:relative; margin-top:auto; display:flex; align-items:flex-end; justify-content:space-between;
           padding-top:34px; border-top:1.5px solid rgba(22,22,31,.12); }}
.dark .bottom {{ border-color:rgba(255,255,255,.16); }}
.idx {{ font-weight:500; font-size:29px; font-variant-numeric:tabular-nums; letter-spacing:.06em; opacity:.62; }}
.tag {{ font-weight:500; font-size:24px; letter-spacing:.24em; text-transform:uppercase; opacity:.62; }}
.swipe {{ display:flex; align-items:center; gap:14px; font-weight:500; font-size:26px; letter-spacing:.20em; text-transform:uppercase; }}
.swipe .ln {{ width:74px; height:2px; background:currentColor; opacity:.85; }}

/* sadrzaj */
.mid {{ position:relative; flex:1; display:flex; flex-direction:column; justify-content:center; }}
.kick {{ font-weight:500; font-size:29px; letter-spacing:.26em; text-transform:uppercase; color:#8B3FE0; margin-bottom:44px; }}
.dark .kick {{ color:#B9A0F2; }}
h1 {{ font-weight:700; letter-spacing:-.028em; line-height:.99; font-size:118px; }}
h1 .grad {{ background:linear-gradient(135deg,#8B3FE0 0%,#6347E8 55%,#E04FB7 100%);
            -webkit-background-clip:text; background-clip:text; color:transparent; }}
h1 .mut {{ opacity:.34; }}
.sub {{ font-weight:400; font-size:41px; line-height:1.4; margin-top:52px; max-width:820px; color:rgba(22,22,31,.72); }}
.dark .sub {{ color:rgba(245,244,248,.72); }}
.sub b {{ font-weight:500; color:inherit; }}

/* CTA */
.cta {{ display:inline-flex; align-items:center; gap:18px; margin-top:64px; padding:30px 54px; border-radius:22px;
       background:linear-gradient(135deg,#8B3FE0 0%,#6347E8 55%,#E04FB7 100%);
       color:#fff; font-weight:500; font-size:36px; letter-spacing:.02em; width:max-content;
       box-shadow:0 26px 60px -18px rgba(139,63,224,.55); }}

/* mini UI */
.app {{ background:#fff; border-radius:30px; box-shadow:0 0 0 1.5px #ECECF2, 0 40px 90px -30px rgba(22,22,31,.18); overflow:hidden; }}
.dark .app {{ box-shadow:0 0 0 1.5px rgba(255,255,255,.10), 0 50px 110px -30px rgba(0,0,0,.65); }}
.app .hd {{ display:flex; align-items:center; justify-content:space-between; padding:30px 38px; border-bottom:1.5px solid #F0F0F5; }}
.app .hd .t {{ font-weight:500; font-size:29px; color:#16161f; }}
.app .hd .live {{ display:flex; align-items:center; gap:12px; font-weight:500; font-size:23px; color:#0FA968; }}
.app .hd .live i {{ width:14px; height:14px; border-radius:50%; background:#0FA968; }}
.row {{ display:flex; align-items:center; gap:26px; padding:28px 38px; border-bottom:1.5px solid #F4F4F8; }}
.row:last-child {{ border-bottom:0; }}
.av {{ width:74px; height:74px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      font-weight:500; font-size:27px; color:#7327C9; background:#F3EBFD; flex:none; }}
.row .nm {{ font-weight:500; font-size:30px; color:#16161f; }}
.row .ds {{ font-weight:400; font-size:24px; color:#8C8C99; margin-top:6px; }}
.row .rt {{ margin-left:auto; text-align:right; }}
.chip {{ display:inline-block; padding:10px 22px; border-radius:999px; font-weight:500; font-size:23px; }}
.chip.ok  {{ background:#E7F6EE; color:#0E7C4F; }}
.chip.due {{ background:#FDF0E4; color:#B25E09; }}
.chip.bad {{ background:#FCE9E9; color:#B42323; }}
.chip.vio {{ background:#F3EBFD; color:#7327C9; }}
.bpm {{ font-weight:500; font-size:44px; color:#16161f; font-variant-numeric:tabular-nums; }}
.bpm small {{ font-size:24px; color:#8C8C99; font-weight:400; margin-left:6px; }}
"""

def top(dark, site="fitlink.rs"):
    return f'<div class="top"><div class="brand"><div class="g">{GLYPH}</div><div class="w">FITLINK</div></div><div class="site">{site}</div></div>'

def bottom(left="", right=""):
    return f'<div class="bottom"><div>{left}</div><div>{right}</div></div>'

def page(theme, body, story=False):
    return f"""<!doctype html><html class="{'story' if story else ''}"><head><meta charset="utf-8"><style>{CSS}</style></head>
<body class="{theme}"><div class="canvas">{'<div class="mesh"></div>' if theme=='dark' else ''}<div class="grain"></div>{body}</div></body></html>"""

SW = '<div class="swipe"><span>Prevuci</span><span class="ln"></span></div>'

def slide(name, theme, mid, idx=None, total=None, tag=None, swipe=False, story=False, site="fitlink.rs"):
    left = f'<div class="idx">{idx:02d} / {total:02d}</div>' if idx else (f'<div class="tag">{tag}</div>' if tag else '')
    right = SW if swipe else (f'<div class="tag">{tag}</div>' if (tag and idx) else '')
    body = top(theme=="dark", site) + f'<div class="mid">{mid}</div>' + bottom(left, right)
    with open(os.path.join(OUT, name + ".html"), "w", encoding="utf-8") as f:
        f.write(page(theme, body, story))

# ---------------------------------------------------------------- mini UI blokovi
UI_UPLATE = """
<div class="app" style="max-width:860px">
  <div class="hd"><div class="t">Uplate</div><div style="font-weight:400;font-size:24px;color:#8C8C99">avgust</div></div>
  <div class="row"><div class="av">MJ</div><div><div class="nm">Marko J.</div><div class="ds">Mesečna članarina</div></div><div class="rt"><span class="chip ok">Plaćeno</span></div></div>
  <div class="row"><div class="av">SN</div><div><div class="nm">Sara N.</div><div class="ds">Paket 12 treninga</div></div><div class="rt"><span class="chip due">Ističe za 3 dana</span></div></div>
  <div class="row"><div class="av">DP</div><div><div class="nm">Dušan P.</div><div class="ds">Mesečna članarina</div></div><div class="rt"><span class="chip bad">Duguje</span></div></div>
</div>"""

UI_LIVE = """
<div class="app" style="max-width:860px">
  <div class="hd"><div class="t">Treninzi uživo</div><div class="live"><i></i>3 aktivna</div></div>
  <div class="row"><div class="av">MJ</div><div><div class="nm">Marko J.</div><div class="ds">Čučanj, 3. serija od 5</div></div><div class="rt"><div class="bpm">142<small>bpm</small></div></div></div>
  <div class="row"><div class="av">SN</div><div><div class="nm">Sara N.</div><div class="ds">Mrtvo dizanje, pauza 0:40</div></div><div class="rt"><div class="bpm">128<small>bpm</small></div></div></div>
  <div class="row"><div class="av">DP</div><div><div class="nm">Dušan P.</div><div class="ds">Zagrevanje</div></div><div class="rt"><div class="bpm">104<small>bpm</small></div></div></div>
</div>"""

UI_DANAS = """
<div class="app" style="max-width:860px">
  <div class="hd"><div class="t">Danas</div><div style="font-weight:400;font-size:24px;color:#8C8C99">utorak</div></div>
  <div class="row"><div class="av" style="background:#EEF0FE;color:#4338CA">07</div><div><div class="nm">07:00, Ana V.</div><div class="ds">Individualni trening</div></div><div class="rt"><span class="chip vio">Potvrđen</span></div></div>
  <div class="row"><div class="av" style="background:#EEF0FE;color:#4338CA">18</div><div><div class="nm">18:00, grupni</div><div class="ds">6 od 8 mesta</div></div><div class="rt"><span class="chip vio">Otvoren</span></div></div>
  <div class="row"><div class="av" style="background:#EEF0FE;color:#4338CA">20</div><div><div class="nm">20:00, Marko J.</div><div class="ds">Čeka potvrdu</div></div><div class="rt"><span class="chip due">Novo</span></div></div>
</div>"""

E = html.escape
# tekstovi sa dijakriticima idu kroz f-stringove direktno (utf-8)

# ---------------------------------------------------------------- telefon + ekrani
CSS_EXTRA = """
/* iPhone okvir */
.phwrap { position:relative; display:flex; justify-content:center; }
.phglow { position:absolute; top:8%; left:50%; transform:translateX(-50%); width:78%; height:80%;
  background:radial-gradient(50% 50% at 50% 50%, rgba(139,63,224,.42) 0%, transparent 70%); filter:blur(30px); }
.phone { position:relative; width:472px; background:#101016; border-radius:70px; padding:15px;
  box-shadow:0 0 0 2px rgba(255,255,255,.10), 0 60px 120px -30px rgba(0,0,0,.75); }
.light .phone { box-shadow:0 0 0 2px rgba(22,22,31,.10), 0 60px 120px -34px rgba(22,22,31,.38); }
.screen { position:relative; background:#f7f7fa; border-radius:56px; overflow:hidden; }
.island { position:absolute; top:16px; left:50%; transform:translateX(-50%); width:118px; height:34px; border-radius:20px; background:#101016; z-index:5; }
.sbar { display:flex; justify-content:space-between; align-items:center; padding:20px 34px 6px; font-weight:500; font-size:20px; color:#16161f; }
.appbody { padding:18px 24px 0; }
.greet { font-weight:700; font-size:31px; letter-spacing:-.02em; color:#16161f; }
.greet small { display:block; font-weight:400; font-size:18px; color:#8C8C99; margin-top:4px; letter-spacing:0; }
.stats { display:flex; gap:14px; margin-top:18px; }
.stat { flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:4px; border-radius:24px; padding:18px 20px; }
.stat.brand { background:linear-gradient(135deg,#8B3FE0,#6347E8); color:#fff; }
.stat.warn { background:#fff; box-shadow:0 0 0 1px #ECECF2; color:#16161f; }
.stat .v { display:block; font-weight:700; font-size:31px; letter-spacing:-.02em; white-space:nowrap; }
.stat .v small { font-size:17px; font-weight:400; opacity:.75; margin-left:5px; letter-spacing:0; }
.stat .l { display:block; font-weight:400; font-size:16px; opacity:.72; }
.sect { display:flex; align-items:baseline; justify-content:space-between; margin:22px 2px 12px; }
.sect .t { font-weight:700; font-size:21px; letter-spacing:-.01em; color:#16161f; }
.sect .a { font-weight:500; font-size:15.5px; color:#8B3FE0; }
.mrow { display:flex; align-items:center; gap:15px; background:#fff; border-radius:22px; padding:15px 18px;
  box-shadow:0 0 0 1px #ECECF2; margin-bottom:11px; }
.mrow .ic { width:46px; height:46px; border-radius:16px; display:flex; align-items:center; justify-content:center; flex:none; font-weight:500; font-size:19px; }
.mrow .nm { font-weight:500; font-size:19.5px; color:#16161f; letter-spacing:-.01em; }
.mrow .ds { font-weight:400; font-size:15.5px; color:#8C8C99; margin-top:3px; }
.mrow .rt { margin-left:auto; text-align:right; }
.mchip { display:inline-block; padding:7px 14px; border-radius:999px; font-weight:500; font-size:14.5px; }
.mbpm { font-weight:500; font-size:26px; color:#16161f; font-variant-numeric:tabular-nums; }
.mbpm small { font-size:15px; color:#8C8C99; font-weight:400; margin-left:3px; }
.nav { display:flex; justify-content:space-around; align-items:center; margin-top:10px; padding:16px 10px 30px; background:#fff; border-top:1.5px solid #F0F0F5; }
.nav .it { display:flex; flex-direction:column; align-items:center; gap:7px; font-weight:500; font-size:13.5px; color:#9A9AA6; }
.nav .it.on { color:#8B3FE0; }
.nav svg { width:26px; height:26px; }
.htitle { font-weight:700; font-size:74px; letter-spacing:-.026em; line-height:1.02; }
.phrow { display:flex; align-items:center; gap:56px; }
/* benefit lista */
.blist { margin-top:14px; }
.bitem { display:flex; align-items:center; gap:30px; padding:33px 6px; border-bottom:1.5px solid rgba(255,255,255,.13); }
.light .bitem { border-color:rgba(22,22,31,.10); }
.bitem:last-child { border-bottom:0; }
.bik { width:56px; height:56px; border-radius:50%; flex:none; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,#8B3FE0 0%,#6347E8 55%,#E04FB7 100%); }
.bik svg { width:28px; height:28px; }
.bitem .tx { font-weight:500; font-size:40px; letter-spacing:-.015em; }
.bitem .sx { font-weight:400; font-size:25px; opacity:.60; margin-top:6px; }
"""
CSS = CSS + CSS_EXTRA

CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>'
I_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>'
I_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
I_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
I_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 15v-4M12 15V7M17 15v-6"/></svg>'

def nav(active):
    items=[("Početna",I_HOME),("Vežbači",I_USERS),("Kalendar",I_CAL),("Finansije",I_CHART)]
    return '<div class="nav">' + ''.join(
        f'<div class="it {"on" if n==active else ""}">{ic}<span>{n}</span></div>' for n,ic in items) + '</div>'

def phone_img(src, width=420):
    sw = width - 30
    return f"""<div class="phwrap"><div class="phglow"></div><div class="phone" style="width:{width}px"><div class="screen">
<div class="island"></div>
<img src="{OUT}/{src}" style="width:{sw}px;display:block">
</div></div></div>"""

def phone(screen, active_tab):
    return f'''<div class="phwrap"><div class="phglow"></div><div class="phone"><div class="screen">
<div class="island"></div>
<div class="sbar"><span>9:41</span><span style="letter-spacing:.06em">●●●&nbsp; 5G&nbsp; ▮</span></div>
{screen}{nav(active_tab)}</div></div></div>'''

SCREEN_HOME = """
<div class="appbody">
  <div class="greet">Dobro jutro, Nikola<small>utorak, 26. avgust</small></div>
  <div class="stats">
    <div class="stat brand"><div class="v">14<small>članova</small></div><div class="l">Aktivnih</div></div>
    <div class="stat warn"><div class="v">2<small>ističu</small></div><div class="l">≤ 14 dana</div></div>
  </div>
  <div class="sect"><div class="t">Danas, utorak</div><div class="a">Kalendar</div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">07</div><div><div class="nm">07:00 · Ana V.</div><div class="ds">Individualni trening</div></div><div class="rt"><span class="mchip" style="background:#EEF0FE;color:#4338CA">Zakazano</span></div></div>
  <div class="mrow"><div class="ic" style="background:#E7F6EE;color:#0E7C4F">18</div><div><div class="nm">18:00 · Marko J.</div><div class="ds">Snaga, gornji deo</div></div><div class="rt"><span class="mchip" style="background:#EEF0FE;color:#4338CA">Zakazano</span></div></div>
  <div class="sect"><div class="t">Uživo</div><div class="a">Svi</div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">MJ</div><div><div class="nm">Marko J.</div><div class="ds">Čučanj · 3. serija od 5</div></div><div class="rt"><div class="mbpm">142<small>bpm</small></div></div></div>
</div>"""

SCREEN_LIVE = """
<div class="appbody">
  <div class="greet">Uživo<small><span style="color:#0FA968">●</span> 3 aktivna treninga</small></div>
  <div style="height:12px"></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">MJ</div><div><div class="nm">Marko J.</div><div class="ds">Čučanj · 3. serija od 5</div></div><div class="rt"><div class="mbpm">142<small>bpm</small></div></div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">SN</div><div><div class="nm">Sara N.</div><div class="ds">Mrtvo dizanje · pauza 0:40</div></div><div class="rt"><div class="mbpm">128<small>bpm</small></div></div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">DP</div><div><div class="nm">Dušan P.</div><div class="ds">Zagrevanje</div></div><div class="rt"><div class="mbpm">104<small>bpm</small></div></div></div>
  <div class="mrow"><div class="ic" style="background:#EEF0FE;color:#4338CA">AV</div><div><div class="nm">Ana V.</div><div class="ds">Završila · 52 min</div></div><div class="rt"><span class="mchip" style="background:#E7F6EE;color:#0E7C4F">Gotovo</span></div></div>
</div>"""

SCREEN_FIN = """
<div class="appbody">
  <div class="greet">Finansije<small>avgust</small></div>
  <div class="stats">
    <div class="stat brand"><div class="v">96.500<small>RSD</small></div><div class="l">Naplaćeno</div></div>
    <div class="stat warn"><div class="v">12.000<small>RSD</small></div><div class="l">Na čekanju</div></div>
  </div>
  <div class="sect"><div class="t">Uplate</div><div class="a">Sve</div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">MJ</div><div><div class="nm">Marko J.</div><div class="ds">Mesečna članarina</div></div><div class="rt"><span class="mchip" style="background:#E7F6EE;color:#0E7C4F">Plaćeno</span></div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">SN</div><div><div class="nm">Sara N.</div><div class="ds">Paket 12 treninga</div></div><div class="rt"><span class="mchip" style="background:#FDF0E4;color:#B25E09">Ističe za 3 dana</span></div></div>
  <div class="mrow"><div class="ic" style="background:#F3EBFD;color:#7327C9">DP</div><div><div class="nm">Dušan P.</div><div class="ds">Mesečna članarina</div></div><div class="rt"><span class="mchip" style="background:#FCE9E9;color:#B42323">Duguje</span></div></div>
</div>"""

def bitem(t, sub=""):
    sx = f'<div class="sx">{sub}</div>' if sub else ''
    return f'<div class="bitem"><div class="bik">{CHECK}</div><div><div class="tx">{t}</div>{sx}</div></div>'

# ---------------------------------------------------------------- KAROSEL A: sveska (7)
slide("a1","dark", """
<div class="kick">Za trenere</div>
<h1>Klijenti u svesci.<br>Termini u glavi.<br><span class="grad">Pare na reč.</span></h1>
<div class="sub">Poznato?</div>
""", 1,7, swipe=True)

slide("a2","light", """
<h1 style="font-size:100px">Plan mu pošalješ<br>na Viber.<br><span class="mut">Otvori ga dvaput.</span></h1>
<div class="sub">Treći put te pita "šta ono beše danas".</div>
""", 2,7)

slide("a3","light", f"""
<h1 style="font-size:92px;margin-bottom:64px">Ko je platio,<br>a ko "plaća sledeće<br>nedelje"?</h1>
{UI_UPLATE}
""", 3,7)

slide("a4","dark", f"""
<div class="phrow">
  <div style="flex:1">
    <div class="kick">FitLink</div>
    <div class="htitle">Ovako izgleda<br>tvoj dan.</div>
    <div class="sub" style="font-size:34px;margin-top:40px">Termini, grupe i liste čekanja, bez papira i prepiske.</div>
  </div>
  <div style="flex:none">{phone_img("kalendar.jpg")}</div>
</div>
""", 4,7)

slide("a5","dark", """
<div class="kick">Šta dobijaš</div>
<div class="blist">
""" + bitem("Programi treninga", "Napraviš jednom, dodeliš svima") \
    + bitem("Termini i rezervacije", "Klijenti sami zakazuju iz aplikacije") \
    + bitem("Članarine i uplate", "Ko je platio, ko duguje, ko ističe") \
    + bitem("Napredak i merenja", "Istorija svakog treninga i lični rekordi") \
    + bitem("Chat i ishrana", "Sve ostalo, na istom mestu") + """
</div>
""", 5,7)

slide("a6","dark", """
<div class="kick">FitLink</div>
<h1 style="font-size:104px">Planovi, termini,<br>članarine i napredak.<br><span class="grad">Jedna aplikacija.</span></h1>
<div class="sub">Ti treniraš ljude. FitLink vodi evidenciju.</div>
""", 6,7)

slide("a7","dark", """
<h1>Sveska ide<br>u penziju.</h1>
<div class="cta">Probaj besplatno</div>
<div class="sub" style="margin-top:44px">fitlink.rs</div>
""", 7,7)

# ---------------------------------------------------------------- KAROSEL B: uzivo (7)
slide("b1","dark", """
<div class="kick">Trening uživo</div>
<h1>Vidiš mu puls.<br><span class="grad">Sa druge strane<br>grada.</span></h1>
""", 1,7, swipe=True)

slide("b2","dark", f"""
<div class="phrow">
  <div style="flex:1">
    <div class="kick">Uživo</div>
    <div class="htitle">Svaki trening,<br>seriju po<br>seriju.</div>
    <div class="sub" style="font-size:34px;margin-top:40px">Vežba, serija, puls. I dugme da mu kažeš da smanji tempo.</div>
  </div>
  <div style="flex:none">{phone_img("poruka.jpg")}</div>
</div>
""", 2,7)

slide("b3","light", """
<h1 style="font-size:100px">On označi seriju<br>na satu.<br><span class="mut">Tebi se upiše sama.</span></h1>
<div class="sub">Apple Watch, bez telefona u ruci usred treninga.</div>
""", 3,7)

slide("b4","dark", """
<h1 style="font-size:100px">Vidiš da mu je teško?<br><span class="grad">Skrati mu seriju.</span><br>Odmah.</h1>
<div class="sub">Izmene plana stižu vežbaču u sekundi, i na sat.</div>
""", 4,7)

slide("b5","dark", """
<div class="kick">Šta dobijaš</div>
<div class="blist">
""" + bitem("Puls u realnom vremenu", "Sa Apple Watch-a, dok trenira") \
    + bitem("Serije se upisuju same", "Vežbač štiklira na satu, tebi se broji") \
    + bitem("Izmena plana u hodu", "Novo vežbanje mu stigne u sekundi") \
    + bitem("Istorija svakog treninga", "Serije, kilaže i pulsne zone") + """
</div>
""", 5,7)

slide("b6","dark", f"""
<div class="phrow">
  <div style="flex:1">
    <div class="kick">Posle treninga</div>
    <div class="htitle">Izveštaj<br>stigne sam.</div>
    <div class="sub" style="font-size:34px;margin-top:40px">Trajanje, kalorije, volumen i pulsne zone, za svaki trening.</div>
  </div>
  <div style="flex:none">{phone_img("izvestaj.jpg")}</div>
</div>
""", 6,7)

slide("b7","dark", """
<h1>Treniraj ih<br>i kad nisi tu.</h1>
<div class="cta">Probaj besplatno</div>
<div class="sub" style="margin-top:44px">fitlink.rs</div>
""", 7,7)

# ---------------------------------------------------------------- KAROSEL C: naplata (6)
slide("c1","dark", """
<div class="kick">Članarine</div>
<h1><span class="mut">"Ej brate,</span><br>plaćam ti<br>sledeći put."</h1>
""", 1,6, swipe=True)

slide("c2","light", f"""
<h1 style="font-size:92px;margin-bottom:64px">FitLink pamti<br>umesto tebe.</h1>
{UI_UPLATE}
""", 2,6)

slide("c3","dark", f"""
<div class="phrow">
  <div style="flex:1">
    <div class="kick">Finansije</div>
    <div class="htitle">Znaš tačno<br>koliko si<br>naplatio.</div>
    <div class="sub" style="font-size:34px;margin-top:40px">Po mesecu, po klijentu, po paketu.</div>
  </div>
  <div style="flex:none">{phone_img("finansije.jpg")}</div>
</div>
""", 3,6)

slide("c4","light", """
<h1 style="font-size:100px">Podsetnik stigne<br>klijentu.<br><span class="mut">Ne tebi.</span></h1>
<div class="sub">Pre isteka članarine, automatski. Bez neprijatnih poruka.</div>
""", 4,6)

slide("c5","dark", """
<div class="kick">Šta dobijaš</div>
<div class="blist">
""" + bitem("Evidencija uplata", "Plaćeno, na čekanju, duguje") \
    + bitem("Automatski podsetnici", "Klijentu, pre nego što članarina istekne") \
    + bitem("Paketi i članarine", "Mesečne, po treningu, kako god naplaćuješ") \
    + bitem("Prihod po mesecu", "Jedan pogled i znaš gde si") + """
</div>
""", 5,6)

slide("c6","dark", """
<h1>Naplati svoj rad.<br><span class="grad">Bez jurenja.</span></h1>
<div class="cta">Probaj besplatno</div>
<div class="sub" style="margin-top:44px">fitlink.rs</div>
""", 6,6)

# ---------------------------------------------------------------- KLASICNE OBJAVE (4)
slide("p1","dark", """
<div class="kick">Za trenere</div>
<h1 style="font-size:106px">Ti si trener.<br><span class="mut">Ne knjigovođa,<br>podsetnik i sekretar.</span></h1>
<div class="sub"><b>FitLink</b> vodi klijente, termine i članarine. Ti vodiš treninge.</div>
""", tag="Aplikacija za trenere")

slide("p2","dark", f"""
<div class="phrow">
  <div style="flex:1">
    <div class="kick">Trening uživo</div>
    <div class="htitle">Tvoji vežbači,<br>sada.</div>
    <div class="sub" style="font-size:34px;margin-top:40px">Puls, serije i pauze, u realnom vremenu.</div>
  </div>
  <div style="flex:none">{phone_img("poruka.jpg")}</div>
</div>
""", tag="Aplikacija za trenere")

slide("p3","dark", """
<div class="kick">Jedna aplikacija</div>
<h1 style="font-size:96px">Programi. Termini.<br>Članarine. Ishrana.<br>Chat. <span class="grad">Trening uživo.</span></h1>
<div class="sub">Sve što vodiš po sveskama i porukama, na jednom mestu.</div>
""", tag="Aplikacija za trenere")

slide("p4","light", f"""
<div class="phrow">
  <div style="flex:1">
    <div class="kick" style="color:#8B3FE0">Termini</div>
    <div class="htitle">Klijenti<br>sami<br>zakazuju.</div>
    <div class="sub" style="font-size:34px;margin-top:40px">Rezervišu iz aplikacije, tebi se puni kalendar.</div>
  </div>
  <div style="flex:none">{phone_img("termin.jpg")}</div>
</div>
""", tag="Aplikacija za trenere")

# ---------------------------------------------------------------- STORY (2)
slide("s1","dark", """
<div class="kick">Za trenere</div>
<h1 style="font-size:112px">Klijenti.<br>Planovi.<br>Termini.<br>Naplata.<br><span class="grad">Jedna<br>aplikacija.</span></h1>
<div class="cta">Probaj besplatno</div>
""", tag="fitlink.rs", story=True, site="")

slide("s2","dark", f"""
<div class="kick">Trening uživo</div>
<h1 style="font-size:96px;margin-bottom:80px">Vidiš mu puls.<br><span class="grad">Sa druge<br>strane grada.</span></h1>
{phone_img("poruka.jpg", 472)}
""", tag="fitlink.rs", story=True, site="")

print("slides:", len([f for f in os.listdir(OUT) if f.endswith('.html')]))
