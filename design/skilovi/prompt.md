# Prompt: mockup FitLink aplikacije preko jednog skila

Zameni [SKIL] i [LINK] jednim od ova tri:

| Skil | Link |
|---|---|
| anti-slop | https://github.com/miqdadbadjuber/anti-slop |
| taste-skill | https://github.com/leonxlnx/taste-skill |
| superdesign-skill | https://github.com/superdesigndev/superdesign-skill |

anti-slop se instalira kao plugin u Claude Code:

```
/plugin marketplace add https://github.com/miqdadbadjuber/anti-slop
/plugin install antislop@anti-slop
```

---

Napravi mockup nove FitLink aplikacije za iPhone, potpuno po skilu [SKIL] ([LINK]). Pročitaj ceo skil (README i sve SKILL.md i references fajlove) i radi po njegovim pravilima. Hoću da vidim kako bi taj skil dizajnirao našu aplikaciju.

**Šta je FitLink.** Aplikacija za personalne trenere i njihove vežbače u Srbiji. Trener vidi ko trenira dok trenira (puls, kalorije i serije uživo), vodi termine, članarine, programe i ishranu. Vežbač vidi svoj plan, radi trening uz animaciju vežbe i prati napredak. Puls stiže sa Apple Watch-a ili Bluetooth trake.

**Kako aplikacija izgleda sada.** Slike svih ekrana su u `design/app-store/izvor/sirovi/` (t- je trener, a- je vežbač). Pogledaj ih sve. Odatle uzmi funkcije, podatke i tekstove. Izgled (boje, fontovi, raspored, komponente) bira skil. Može da zadrži sadašnji tamni ljubičasti stil "Ponoć" ili da predloži svoj, ali neka ostane FitLink.

**Ekrani (tačno ovih 6, ovim redom):**
1. Trener, početna: ko trenira sada (puls i kalorije po vežbaču), uplate koje čekaju, članovi kojima ističe članarina.
2. Trener, uživo jedan vežbač: puls i zona, kalorije, odmor, puls poslednjih 10 minuta, vežba i serije.
3. Trener, kalendar: dan sa terminima, rezervacije, slobodna mesta, lista čekanja.
4. Trener, uplate i članarine: zahtevi za uplatu (potvrdi ili odbij, keš ili račun), ukupno na čekanju.
5. Vežbač, trening u toku: slika vežbe, serije sa kg i ponavljanjima, prošli put, puls i kalorije, zone pulsa.
6. Vežbač, napredak: broj treninga, niz dana, aktivnost po nedeljama, lični rekordi.

**Pravila aplikacije koja moraju da važe:**
- Sav tekst je na srpskom, latinicom. Bez dugih crtica (em i en dash), samo obična crtica.
- Puls i kalorije su uvek blizanci: ista veličina, poravnati u kolonama.
- Imena i nazivi idu u najviše 2 reda, natpisi dugmadi su uvek celi. Tri tačke samo za baš predugačak tekst.
- Glavne celine nikad u traci koja se lista u stranu.
- Slike prate sadržaj: uz vežbu ide slika te vežbe, bez nasumičnih fotografija uz podatke.
- Unos kg i ponavljanja ide kroz brojčanik, bez plus/minus dugmadi i bez sistemske tastature.
- Najveće brojke su oko 64 pt.
- Samo funkcije koje stvarno postoje na slikama, ništa izmišljeno.

**Izlaz.** Jedna HTML stranica sa 6 ekrana u iPhone okvirima 393 x 852, sa kratkim natpisom ispod svakog. Na vrhu stranice 3 do 4 rečenice: koji pravac je skil izabrao i zašto. Stranica mora lepo da se vidi i na telefonu.
