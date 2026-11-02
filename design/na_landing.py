"""Pretvara Ponoć mockup stranicu u stranicu za fitlink.rs (repo fitlink-landing).

python3 design/na_landing.py vezbac      -> fitlink-landing/dizajn-vezbac.html
python3 design/na_landing.py trener      -> fitlink-landing/dizajn-trener.html
python3 design/na_landing.py sat         -> fitlink-landing/dizajn-sat-vezbac.html
python3 design/na_landing.py sat-trener  -> fitlink-landing/dizajn-sat-trener.html

Mediji idu u dizajn-slike/, nikad u assets/ (na landingu /assets/* ide na app.fitlink.rs).
"""
import os
import re
import shutil
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
LANDING = os.path.expanduser('~/Documents/fitlink-landing')

STRANE = {
    'vezbac': ('fitlink-ponoc-vezbac.html', 'dizajn-vezbac.html', 'FitLink Ponoć Vežbač',
               'Koncept svih ekrana FitLink aplikacije za vežbača u tamnoj temi.'),
    'trener': ('fitlink-ponoc-trener-svi.html', 'dizajn-trener.html', 'FitLink Ponoć Trener',
               'Koncept svih ekrana FitLink aplikacije za trenera u tamnoj temi.'),
    'sat': ('fitlink-ponoc-sat.html', 'dizajn-sat-vezbac.html', 'FitLink Ponoć Sat Vežbač',
            'Koncept ekrana FitLink aplikacije za Apple Watch, za vežbača.'),
    'sat-trener': ('fitlink-ponoc-sat-trener.html', 'dizajn-sat-trener.html', 'FitLink Ponoć Sat Trener',
                   'Ideja za Apple Watch aplikaciju trenera, u tamnoj temi.'),
}

HEAD = '''<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#15111B">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
'''
SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">'


def main(kljuc):
    src, dst, title, desc = STRANE[kljuc]
    s = open(os.path.join(DIR, src), encoding='utf-8').read()

    s, n = re.subn(r'^<title>[^<]*</title>\n', HEAD.format(title=title, desc=desc), s, count=1)
    assert n == 1, 'izvor mora da pocinje sa <title>'
    i = s.find(SPRITE)
    assert i > 0, 'nema SVG sprite-a'
    s = s[:i] + '</head>\n<body>\n' + s[i:]

    mediji = sorted(set(re.findall(r'assets/([A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|svg|mp4))', s)))
    s = s.replace('assets/', 'dizajn-slike/')
    s = s.rstrip('\n') + '\n\n</body>\n</html>\n'
    assert '—' not in s and '–' not in s, 'em/en crtica u stranici'

    nove = 0
    for m in mediji:
        a = os.path.join(DIR, 'assets', m)
        b = os.path.join(LANDING, 'dizajn-slike', m)
        assert os.path.isfile(a), 'fali ' + a
        if not os.path.isfile(b):
            os.makedirs(os.path.dirname(b), exist_ok=True)
            shutil.copyfile(a, b)
            nove += 1

    open(os.path.join(LANDING, dst), 'w', encoding='utf-8').write(s)
    print(dst, len(s.encode('utf-8')), 'bajtova,', len(mediji), 'medija,', nove, 'novih kopirano')


if __name__ == '__main__':
    for k in sys.argv[1:] or STRANE:
        main(k)
