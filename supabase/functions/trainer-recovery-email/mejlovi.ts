// Dva mejla za trenera koji je potvrdio nalog a nije pokrenuo pretplatu: prvi istog dana,
// drugi tri dana kasnije (poslednji). Sablon je isti kao u send-app-email: Poppins, zvanican logo
// kao slika, svetla kartica sa tamnom temom. Bez cena, a proba uvek trazi karticu.
// Slike su pravi ekrani aplikacije; pravi ih design/mejlovi/povratak/slike.py, a zive na
// fitlink.rs/slike/mejl/ (landing repo). Pregled bez slanja: node design/mejlovi/povratak/povratak.cjs
// Ovaj fajl ne koristi Deno, da bi ga pregled mogao da ucita.

export type Mejl = { tema: string; html: string };
// Linkovi jednog mejla. Kad mejl ide po rasporedu, "pretplata" vodi kroz fitlink.rs/api/mejl
// (belezi klik pa salje na /pretplata), "piksel" je slika 1x1 koja belezi otvaranje, a "odjava"
// nosi kljuc reda iz dnevnika slanja. Bez kljuca (rucna proba) ostaju obicni linkovi.
export type Veze = { odjava: string; pretplata?: string; piksel?: string };

const SLIKE = "https://fitlink.rs/slike/mejl/";
const BILLING_URL = "https://fitlink.rs/pretplata";
// Adresa na koju vode dugme, slike i linkovi mejla koji se upravo slaze (mejl1/mejl2 je postave na pocetku).
let PRETPLATA = BILLING_URL;
const LOGO_SVETLA = "https://fitlink.rs/slike/mejl-logo-svetla.png";
const LOGO_TAMNA = "https://fitlink.rs/slike/mejl-logo-tamna.png";
const FONT = "'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const raz = (h: number) => `<div style="height:${h}px; line-height:${h}px; font-size:0;">&nbsp;</div>`;
const link = (tekst: string) => `<a class="t-accent" href="${PRETPLATA}" style="color:#8a36e8; text-decoration:none; font-weight:500;">${tekst}</a>`;
const dugme = (tekst: string) => `<a href="${PRETPLATA}" style="display:block; text-align:center; background-color:#8a36e8; background-image:linear-gradient(135deg,#8a36e8 0%,#603dea 55%,#e84bae 100%); color:#ffffff; font-family:${FONT}; font-size:16px; font-weight:600; text-decoration:none; padding:16px 32px; border-radius:12px; box-shadow:0 8px 22px -8px rgba(138,54,232,0.5);">${tekst}</a>`;
const nadnaslov = (t: string) => `<div class="t-accent" style="font-size:12px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8a36e8;">${t}</div>`;
const naslov = (t: string, px = 26) => `<div class="t-primary" style="font-family:${FONT}; font-size:${px}px; font-weight:600; letter-spacing:-0.4px; color:#16161f; line-height:1.25;">${t}</div>`;
const tekst = (t: string) => `<div class="t-body" style="font-size:15px; color:#4b4b57; line-height:1.7;">${t}</div>`;
const sitno = (t: string) => `<div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">${t}</div>`;
const crta = () => `<div class="hairline" style="border-top:1px solid #ececf2; font-size:0; line-height:0;">&nbsp;</div>`;
// Siroka slika preko cele kartice (pravi ekrani na Ponoc podlozi).
const slika = (ime: string, alt: string) => `<a href="${PRETPLATA}" style="text-decoration:none;"><img src="${SLIKE}${ime}.jpg" width="512" alt="${alt}" style="display:block; width:100%; max-width:512px; height:auto; border:0; outline:none; border-radius:16px;"></a>`;
// Par ekrana: levo sta trener pravi, desno sta klijent vidi. Ispod slike naslov i po jedna recenica za svakog.
const par = (ime: string, n: string, ti: string, klijent: string, alt: string) => `${slika(ime, alt)}
  ${raz(18)}
  <div class="t-primary" style="font-size:19px; font-weight:600; letter-spacing:-0.3px; color:#16161f; line-height:1.3;">${n}</div>
  ${raz(8)}
  <div class="t-body" style="font-size:14px; color:#4b4b57; line-height:1.65;"><span class="t-accent" style="font-weight:600; color:#8a36e8;">Ti:</span> ${ti}</div>
  ${raz(6)}
  <div class="t-body" style="font-size:14px; color:#4b4b57; line-height:1.65;"><span class="t-primary" style="font-weight:600; color:#16161f;">Klijent:</span> ${klijent}</div>`;
const parovi = (niz: [string, string, string, string, string][]) => niz.map((c) => par(...c)).join(raz(38));
// Kratak spisak sa stiklirom.
const stavke = (niz: string[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${niz.map((t) => `<tr>
      <td valign="top" width="26" style="padding:5px 0; font-size:15px; font-weight:600; color:#1f9d63;">&#10003;</td>
      <td valign="top" class="t-body" style="padding:5px 0; font-size:15px; color:#4b4b57; line-height:1.6;">${t}</td>
    </tr>`).join('')}
  </table>`;
// Numerisani koraci (isti kao u mejlu posle potvrde naloga).
const koraci = (niz: [string, string][]) => `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">
    ${niz.map(([n, t], i) => `<tr>
      <td valign="top" width="44" class="${i ? 'hairline' : ''}" style="padding:16px 0 16px 18px; ${i ? 'border-top:1px solid #e8e8f0;' : ''}">
        <div class="krug" style="width:28px; height:28px; border-radius:14px; background-color:#efe6fd; color:#8a36e8; font-size:13px; font-weight:600; line-height:28px; text-align:center;">${i + 1}</div>
      </td>
      <td valign="top" class="${i ? 'hairline' : ''}" style="padding:16px 18px 16px 12px; ${i ? 'border-top:1px solid #e8e8f0;' : ''}">
        <div class="t-primary" style="font-size:15px; font-weight:600; color:#16161f; line-height:1.35;">${n}</div>
        <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.55; padding-top:2px;">${t}</div>
      </td>
    </tr>`).join('')}
  </table>`;
// "Do sada" precrtano, "U aplikaciji" sa stiklirom.
const zamene = (niz: [string, string][]) => `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">
    <tr>
      <td class="t-muted" width="46%" style="padding:14px 8px 10px 20px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#8c8c99;">Do sada</td>
      <td class="t-accent" style="padding:14px 20px 10px 8px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#8a36e8;">U aplikaciji</td>
    </tr>
    ${niz.map(([a, b]) => `<tr>
      <td class="hairline t-muted" valign="middle" style="padding:13px 8px 13px 20px; border-top:1px solid #e8e8f0; font-size:14px; color:#8c8c99; text-decoration:line-through; text-decoration-color:#e5484d;">${a}</td>
      <td class="hairline t-primary" valign="middle" style="padding:13px 20px 13px 8px; border-top:1px solid #e8e8f0; font-size:14px; font-weight:600; color:#16161f;"><span style="color:#1f9d63;">&#10003;</span>&nbsp; ${b}</td>
    </tr>`).join('')}
  </table>`;
// Nedoumica i odgovor.
const pitanja = (niz: [string, string][]) => niz.map(([p, o], i) => `${i ? raz(16) + crta() + raz(16) : ''}
  <div class="t-primary" style="font-size:15px; font-weight:600; color:#16161f; line-height:1.4;">${p}</div>
  ${raz(4)}
  <div class="t-body" style="font-size:14px; color:#4b4b57; line-height:1.65;">${o}</div>`).join('');

function mejl(o: { pre: string; dno: string; telo: string; veze: Veze }): string {
  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FitLink</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #0d0d12 !important; }
    .email-card { background-color: #14141a !important; border-color: #292932 !important; }
    .t-primary { color: #f3f3f7 !important; }
    .t-body { color: #c2c2cd !important; }
    .t-muted { color: #9a9aa6 !important; }
    .t-footer { color: #74747f !important; }
    .panel { background-color: #1b1b22 !important; border-color: #292932 !important; }
    .hairline { border-color: #292932 !important; }
    .krug { background-color: #2a2140 !important; color: #b58cff !important; }
    .t-accent { color: #b58cff !important; }
    .logo-svetla { display: none !important; }
    .logo-tamna { display: block !important; }
  }
  @media (max-width: 620px) {
    .pad { padding: 32px 22px 30px 22px !important; }
    .pad-foot { padding: 20px 22px 24px 22px !important; }
    .email-wrap { padding: 18px 12px !important; }
  }
</style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#ededf3; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${o.pre}</div>

<table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ededf3;">
<tr>
<td align="center" class="email-wrap" style="padding:40px 16px;">

<table role="presentation" class="email-card" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:20px; border:1px solid #e6e6ee; box-shadow:0 4px 28px rgba(22,22,38,0.07); overflow:hidden;">

<tr><td class="pad" style="padding:44px 44px 40px 44px; font-family:${FONT};">

  <img class="logo-svetla" src="${LOGO_SVETLA}" width="148" height="25" alt="FitLink" style="display:block; border:0; outline:none; width:148px; height:25px; margin-left:-2px;">
  <!--[if !mso]><!--><img class="logo-tamna" src="${LOGO_TAMNA}" width="148" height="25" alt="FitLink" style="display:none; border:0; outline:none; width:148px; height:25px; margin-left:-2px;"><!--<![endif]-->

  ${raz(22)}
  ${crta()}
  ${raz(30)}
${o.telo}
${o.veze.piksel ? `<img src="${o.veze.piksel}" width="1" height="1" alt="" style="display:block; border:0; width:1px; height:1px;">` : ""}
</td></tr>

<tr><td class="hairline pad-foot" style="padding:24px 44px 30px 44px; border-top:1px solid #eeeef4; font-family:${FONT};">
  <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">FitLink, aplikacija za trenere.</div>
  ${raz(3)}
  <div class="t-footer" style="font-size:12px; color:#abacb6; line-height:1.6;">${o.dno} <a class="t-footer" href="${o.veze.odjava}" style="color:#abacb6; text-decoration:underline;">Odjavi se od podsetnika</a></div>
</td></tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

const POKRENI = 'Pokreni 30 dana besplatno';
const uslovi = () => `Za probu se unosi kartica. Ako je ne otkažeš, posle 30 dana kreće mesečna pretplata, a otkazuješ kad hoćeš na ${link('fitlink.rs/pretplata')}`;

// ---- Mejl 1: istog dana, nekoliko sati posle potvrde naloga ----
export function mejl1(ime: string, veze: Veze): Mejl {
  PRETPLATA = veze.pretplata ?? BILLING_URL;
  const zdravo = ime ? `Zdravo ${ime}, ` : 'Zdravo, ';
  return {
    tema: 'Tvoj nalog čeka još jedan korak',
    html: mejl({
      pre: 'Pokreni 30 dana besplatno i unesi prve klijente još danas.',
      dno: 'Ovaj podsetnik stiže jer pretplata na tvom nalogu nije pokrenuta.',
      veze,
      telo: `
  ${nadnaslov('Tvoj nalog čeka')}
  ${raz(8)}
  ${naslov('Nalog imaš. Ostao je jedan korak')}
  ${raz(14)}
  ${tekst(`${zdravo}tvoj nalog je potvrđen, ali aplikacija je još zaključana jer pretplata nije pokrenuta. Pokreće se na sajtu, a prvih 30 dana je besplatno.`)}
  ${raz(26)}
  ${dugme(POKRENI)}
  ${raz(38)}
  ${nadnaslov('Kako to izgleda')}
  ${raz(8)}
  ${naslov('Ti napraviš, klijent dobije u telefon', 21)}
  ${raz(10)}
  ${tekst('Na svakoj slici levo je tvoj ekran, a desno ono što u istom trenutku vidi tvoj klijent.')}
  ${raz(26)}
  ${parovi([
    ['par-program-serije', 'Program napraviš jednom, klijent ga otvori u telefonu',
      'Složiš dane i vežbe iz biblioteke od 4.699 vežbi, upišeš serije, kilažu i ponavljanja i dodeliš program jednim dodirom.',
      'Otvori trening, vidi vežbu sa animacijom i upisuje kilažu i ponavljanja za svaku seriju.',
      'Program sa serijama i kilažom kod trenera i trening sa serijama kod vežbača'],
    ['par-ishrana', 'Plan ishrane do grama',
      'Složiš obroke iz više od 1.000 namirnica, u gramima ili na komad, posebno za dan sa treningom i za dan odmora.',
      'Vidi plan za danas i upisuje obroke, a kalorije i proteini se sabiraju sami.',
      'Plan ishrane kod trenera i ishrana za danas kod vežbača'],
    ['par-termini', 'Otvoriš termine, klijenti rezervišu sami',
      'Individualni, mala grupa ili grupni trening. U kalendaru vidiš ko dolazi, koliko je mesta slobodno i ko čeka.',
      'Rezerviše, otkaže ili stane na listu čekanja. Otkazni rok određuješ ti.',
      'Kalendar trenera i rezervacija termina kod vežbača'],
  ])}
  ${raz(36)}
  ${crta()}
  ${raz(30)}
  ${nadnaslov('Unutra te čeka i')}
  ${raz(12)}
  ${stavke([
    'Članarine i uplate: znaš ko je platio, a ko nije',
    'Puls i kalorije svakog vežbača, uživo',
    'Spisak klijenata koji nisu trenirali više od 14 dana',
    'Aplikacija za iPhone i Android, i pregled na računaru',
  ])}
  ${raz(34)}
  ${crta()}
  ${raz(30)}
  ${nadnaslov('Kako da pokreneš')}
  ${raz(8)}
  ${naslov('Tri koraka i aplikacija je otključana', 21)}
  ${raz(20)}
  ${koraci([
    [`Otvori ${link('fitlink.rs/pretplata')}`, 'Prijavi se istim mejlom i lozinkom kao u aplikaciji.'],
    ['Izaberi plan', 'Mesečni ili godišnji. Mesečni kreće sa 30 dana besplatno.'],
    ['Vrati se u aplikaciju', 'Otključa se sama, za nekoliko sekundi.'],
  ])}
  ${raz(26)}
  ${dugme(POKRENI)}
  ${raz(18)}
  ${sitno(uslovi())}`,
    }),
  };
}

// ---- Mejl 2: tri dana kasnije, poslednji ----
export function mejl2(ime: string, veze: Veze): Mejl {
  PRETPLATA = veze.pretplata ?? BILLING_URL;
  const zdravo = ime ? `Zdravo ${ime}, ` : 'Zdravo, ';
  return {
    tema: 'Sveska, Viber i Excel, ili jedna aplikacija',
    html: mejl({
      pre: 'Šta se menja kad termine, uplate i programe prebaciš na jedno mesto.',
      dno: 'Ovo je poslednji podsetnik o pretplati.',
      veze,
      telo: `
  ${nadnaslov('Poslednji podsetnik')}
  ${raz(8)}
  ${naslov('Još vodiš klijente iz sveske, Vibera i Excela?')}
  ${raz(14)}
  ${tekst(`${zdravo}tvoj FitLink nalog i dalje čeka. Ovo se menja onog dana kad termine, uplate i programe prebaciš na jedno mesto.`)}
  ${raz(24)}
  ${zamene([
    ['Sveska za termine', 'Kalendar i rezervacije'],
    ['Excel za uplate', 'Članarine i finansije'],
    ['PDF sa programom', 'Program u aplikaciji'],
    ['“Jesi li uplatio?”', 'Podsetnik stiže sam'],
    ['Papir za kilažu', 'Serije i kilaža upisane'],
    ['Tabela za ishranu', 'Plan ishrane do grama'],
  ])}
  ${raz(26)}
  ${dugme(POKRENI)}
  ${raz(38)}
  ${nadnaslov('Kako to izgleda')}
  ${raz(8)}
  ${naslov('Šta vidiš ti, a šta tvoj klijent', 21)}
  ${raz(10)}
  ${tekst('Klijent ulazi tvojim kodom i ništa ne plaća. Jedna pretplata pokriva neograničen broj vežbača.')}
  ${raz(26)}
  ${parovi([
    ['par-uzivo', 'Vidiš puls dok treniraju',
      'Puls, zona i kalorije svakog vežbača, na telefonu, satu i zaključanom ekranu. Serije i kilažu možeš da ispraviš usred treninga.',
      'Trenira sa Apple Watch-om ili Bluetooth trakom, a aplikacija radi i bez uređaja.',
      'Puls vežbača uživo kod trenera i trening kod vežbača'],
    ['par-clanarine', 'Znaš ko je platio, klijent zna koliko mu je ostalo',
      'Paketi na mesec ili na broj treninga, keš ili račun. Zahtev potvrdiš jednim dodirom i vidiš ko još nije platio.',
      'Na početnoj vidi koliko treninga mu je ostalo, a podsetnik pred istek stiže sam.',
      'Uplate i članarine kod trenera i početni ekran vežbača'],
    ['par-napredak', 'Vidiš ko dolazi, a ko je stao',
      'Spisak pokazuje ko je aktivan, a ko nije trenirao više od 14 dana, pa znaš kome da se javiš.',
      'Prati svoje treninge i lične rekorde.',
      'Spisak vežbača kod trenera i napredak kod vežbača'],
  ])}
  ${raz(36)}
  ${crta()}
  ${raz(30)}
  ${nadnaslov('Pre nego što kreneš')}
  ${raz(8)}
  ${naslov('Ono što treneri najčešće pitaju', 21)}
  ${raz(22)}
  ${pitanja([
    ['“Klijenti neće da instaliraju aplikaciju”', 'Aplikacija je za njih besplatna, na App Store-u i na Google Play-u. Klijente bez aplikacije i goste u termin upisuješ ti.'],
    ['“Nemam vremena da prebacim sve”', 'Program praviš jednom kao šablon. Nov klijent uđe kodom i odmah je na tvom spisku.'],
    ['“Nemam Apple Watch”', 'Ne treba ti. Puls ide i preko Bluetooth trake, a aplikacija radi i bez uređaja.'],
    ['“Šta posle 30 dana?”', `Ako ne otkažeš, kreće mesečna pretplata. Otkazuješ kad hoćeš na ${link('fitlink.rs/pretplata')}`],
  ])}
  ${raz(30)}
  ${dugme(POKRENI)}
  ${raz(18)}
  ${sitno('Za probu se unosi kartica. Više ti nećemo pisati o pretplati, a nalog ostaje tvoj i čeka kad god odlučiš.')}`,
    }),
  };
}
