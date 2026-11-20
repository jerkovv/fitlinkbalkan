// Mejlovi probe bez kartice: trener dobija 30 dana cim potvrdi nalog, a pretplatu pokrece
// na sajtu tek pred kraj probe. Redosled:
//   dobrodoslica      cim proba pocne (sta sve aplikacija radi i kako na racunaru)
//   proba7            7 dana pre kraja
//   proba3            3 dana pre kraja
//   probaDanas        na dan kraja
//   probaIstekla      dan posle kraja (poslednji o probi)
//   pretplataAktivna  kad plati (sta sve dobija i dashboard na racunaru)
// Sablon je isti kao u ostalim mejlovima: Poppins, zvanican logo kao slika, svetla kartica sa
// tamnom temom. Bez cena. Slike su pravi ekrani i zive na fitlink.rs/slike/mejl/ (landing repo).
// Pregled bez slanja: node design/mejlovi/proba/proba.cjs. Ovaj fajl ne koristi Deno, da bi ga
// pregled mogao da ucita.

export type Mejl = { tema: string; html: string };
// Linkovi jednog mejla. Kad mejl ide po rasporedu, "pretplata" i "app" vode kroz fitlink.rs/api/mejl
// (belezi klik pa salje dalje), "piksel" belezi otvaranje, a "odjava" nosi kljuc reda iz dnevnika.
export type Veze = { odjava: string; pretplata?: string; app?: string; piksel?: string };
// Sta se zna o treneru. Brojke su za vreme probe; nula znaci da toga jos nema.
export type Trener = {
  ime: string;
  kraj: Date; // poslednji dan probe
  vezbaca: number;
  treninga: number; // zavrseni treninzi njegovih vezbaca od pocetka probe
  programa: number;
};

const SLIKE = "https://fitlink.rs/slike/mejl/";
const PRETPLATA_URL = "https://fitlink.rs/pretplata";
const APP_URL = "https://app.fitlink.rs";
const DASHBOARD = "fitlink.rs/dashboard";
const LOGO_SVETLA = "https://fitlink.rs/slike/mejl-logo-svetla.png";
const LOGO_TAMNA = "https://fitlink.rs/slike/mejl-logo-tamna.png";
const FONT = "'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LJUBICASTA = "#8a36e8";

// ---- Delovi sablona ----

const raz = (h: number) => `<div style="height:${h}px; line-height:${h}px; font-size:0;">&nbsp;</div>`;
const veza = (href: string, t: string) =>
  `<a class="t-accent" href="${href}" style="color:${LJUBICASTA}; text-decoration:none; font-weight:500;">${t}</a>`;
const dugme = (href: string, t: string) =>
  `<a href="${href}" style="display:block; text-align:center; background-color:${LJUBICASTA}; background-image:linear-gradient(135deg,#8a36e8 0%,#603dea 55%,#e84bae 100%); color:#ffffff; font-family:${FONT}; font-size:16px; font-weight:600; text-decoration:none; padding:16px 32px; border-radius:12px; box-shadow:0 8px 22px -8px rgba(138,54,232,0.5);">${t}</a>`;
const dugmeTiho = (href: string, t: string) =>
  `<a class="panel t-accent" href="${href}" style="display:block; text-align:center; background-color:#f6f6fa; border:1px solid #e8e8f0; color:${LJUBICASTA}; font-family:${FONT}; font-size:15px; font-weight:600; text-decoration:none; padding:14px 28px; border-radius:12px;">${t}</a>`;
const nadnaslov = (t: string) =>
  `<div class="t-accent" style="font-size:12px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:${LJUBICASTA};">${t}</div>`;
const naslov = (t: string, px = 26) =>
  `<div class="t-primary" style="font-family:${FONT}; font-size:${px}px; font-weight:600; letter-spacing:-0.4px; color:#16161f; line-height:1.25;">${t}</div>`;
const tekst = (t: string) => `<div class="t-body" style="font-size:15px; color:#4b4b57; line-height:1.7;">${t}</div>`;
const sitno = (t: string) => `<div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">${t}</div>`;
const crta = () => `<div class="hairline" style="border-top:1px solid #ececf2; font-size:0; line-height:0;">&nbsp;</div>`;
const slika = (href: string, ime: string, alt: string) =>
  `<a href="${href}" style="text-decoration:none;"><img src="${SLIKE}${ime}.jpg" width="512" alt="${alt}" style="display:block; width:100%; max-width:512px; height:auto; border:0; outline:none; border-radius:16px;"></a>`;

// Par ekrana: levo sta trener pravi, desno sta klijent vidi.
const par = (href: string, ime: string, n: string, ti: string, klijent: string, alt: string) => `${slika(href, ime, alt)}
  ${raz(18)}
  <div class="t-primary" style="font-size:19px; font-weight:600; letter-spacing:-0.3px; color:#16161f; line-height:1.3;">${n}</div>
  ${raz(8)}
  <div class="t-body" style="font-size:14px; color:#4b4b57; line-height:1.65;"><span class="t-accent" style="font-weight:600; color:${LJUBICASTA};">Ti:</span> ${ti}</div>
  ${raz(6)}
  <div class="t-body" style="font-size:14px; color:#4b4b57; line-height:1.65;"><span class="t-primary" style="font-weight:600; color:#16161f;">Klijent:</span> ${klijent}</div>`;

const stavke = (niz: string[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${niz.map((t) => `<tr>
      <td valign="top" width="26" style="padding:5px 0; font-size:15px; font-weight:600; color:#1f9d63;">&#10003;</td>
      <td valign="top" class="t-body" style="padding:5px 0; font-size:15px; color:#4b4b57; line-height:1.6;">${t}</td>
    </tr>`).join("")}
  </table>`;

// Numerisani koraci u sivom okviru.
const koraci = (niz: [string, string][]) => `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">
    ${niz.map(([n, t], i) => `<tr>
      <td valign="top" width="44" class="${i ? "hairline" : ""}" style="padding:16px 0 16px 18px; ${i ? "border-top:1px solid #e8e8f0;" : ""}">
        <div class="krug" style="width:28px; height:28px; border-radius:14px; background-color:#efe6fd; color:${LJUBICASTA}; font-size:13px; font-weight:600; line-height:28px; text-align:center;">${i + 1}</div>
      </td>
      <td valign="top" class="${i ? "hairline" : ""}" style="padding:16px 18px 16px 12px; ${i ? "border-top:1px solid #e8e8f0;" : ""}">
        <div class="t-primary" style="font-size:15px; font-weight:600; color:#16161f; line-height:1.35;">${n}</div>
        <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.55; padding-top:2px;">${t}</div>
      </td>
    </tr>`).join("")}
  </table>`;

// Do tri krupne brojke u jednom redu (vezbaci, treninzi, programi).
const brojke = (niz: [number, string][]) => `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">
    <tr>
    ${niz.map(([b, t], i) => `<td align="center" valign="top" width="${Math.floor(100 / niz.length)}%" class="${i ? "hairline" : ""}" style="padding:18px 6px 16px 6px; ${i ? "border-left:1px solid #e8e8f0;" : ""}">
        <div class="t-primary" style="font-size:28px; font-weight:600; letter-spacing:-0.6px; color:#16161f; line-height:1.1;">${b}</div>
        <div class="t-muted" style="font-size:12px; color:#8c8c99; line-height:1.4; padding-top:4px;">${t}</div>
      </td>`).join("")}
    </tr>
  </table>`;

// Istaknut okvir sa upozorenjem (sta se desava kad proba istekne).
const okvir = (t: string) => `<table role="presentation" class="okvir" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff6ec; border:1px solid #f6dcbc; border-radius:14px;">
    <tr><td class="t-body" style="padding:16px 18px; font-size:14px; color:#4b4b57; line-height:1.65;">${t}</td></tr>
  </table>`;

function mejl(o: { pre: string; dno: string; telo: string; veze: Veze; odjava?: boolean }): string {
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
    .okvir { background-color: #2a2015 !important; border-color: #4a3620 !important; }
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
  <div class="t-footer" style="font-size:12px; color:#abacb6; line-height:1.6;">${o.dno}${o.odjava === false ? "" : ` <a class="t-footer" href="${o.veze.odjava}" style="color:#abacb6; text-decoration:underline;">Odjavi se od podsetnika</a>`}</div>
</td></tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

// ---- Pomocno ----

const MESECI = ["januara", "februara", "marta", "aprila", "maja", "juna", "jula", "avgusta", "septembra", "oktobra", "novembra", "decembra"];
// "20. decembra" po Beogradu.
export function datum(d: Date): string {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [, m, dan] = s.split("-").map(Number);
  return `${dan}. ${MESECI[m - 1]}`;
}

// Srpski oblik reci uz broj: 1 vezbac, 2 vezbaca, 5 vezbaca; 1 trening, 2 treninga, 5 treninga.
function oblik(n: number, jedan: string, dva: string, pet: string): string {
  const d = n % 10, s = n % 100;
  if (d === 1 && s !== 11) return jedan;
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return dva;
  return pet;
}
const vezbaca = (n: number) => `${n} ${oblik(n, "vežbač", "vežbača", "vežbača")}`;
const zdravo = (ime: string) => (ime ? `Zdravo ${ime}, ` : "Zdravo, ");

// Sta se desava kad proba istekne, sa brojem vezbaca kad ga ima.
function posledica(t: Trener): string {
  return t.vezbaca > 0
    ? `izmene u aplikaciji se zaključavaju, a ${vezbaca(t.vezbaca)} ${t.vezbaca === 1 ? "gubi" : "gube"} pristup svojim treninzima, ishrani i terminima`
    : "izmene u aplikaciji se zaključavaju";
}

// Brojke iz probe; prazno kad jos nema nicega.
function doSada(t: Trener): string {
  if (t.vezbaca === 0 && t.treninga === 0 && t.programa === 0) return "";
  return brojke([
    [t.vezbaca, oblik(t.vezbaca, "vežbač", "vežbača", "vežbača")],
    [t.treninga, oblik(t.treninga, "trening", "treninga", "treninga")],
    [t.programa, oblik(t.programa, "program", "programa", "programa")],
  ]);
}

// Kako se pokrece pretplata; kartica se unosi tek ovde.
const kakoPretplata = (pretplata: string) => koraci([
  [`Otvori ${veza(pretplata, "fitlink.rs/pretplata")}`, "Prijavi se istim mejlom i lozinkom kao u aplikaciji."],
  ["Izaberi plan i unesi karticu", "Mesečni ili godišnji. Otkazuješ kad hoćeš."],
  ["Nastavi u aplikaciji", "Sve ostaje kako jeste, ti i tvoji vežbači ništa ne primećujete."],
]);

// Isti nalog i na racunaru.
function racunar(app: string): string {
  return `${nadnaslov("I na računaru")}
  ${raz(8)}
  ${naslov("Tvoj studio na velikom ekranu", 21)}
  ${raz(10)}
  ${tekst(`Otvori ${veza(`https://${DASHBOARD}`, DASHBOARD)} i prijavi se istim mejlom i lozinkom. Programe, planove ishrane i kalendar slažeš uz miš i tastaturu, a sve što promeniš odmah je i u telefonu, kod tebe i kod klijenata.`)}
  ${raz(20)}
  ${slika(`https://${DASHBOARD}`, "dashboard-racunar", "FitLink na računaru: početna trenera")}
  ${raz(16)}
  ${sitno(`Sačuvaj adresu ${veza(`https://${DASHBOARD}`, DASHBOARD)} u pregledaču. Telefon i računar mogu da budu otvoreni u isto vreme.`)}`;
}

// ---- Mejl: proba je pocela ----
export function dobrodoslica(t: Trener, veze: Veze): Mejl {
  const app = veze.app ?? APP_URL;
  return {
    tema: "Tvojih 30 dana je počelo",
    html: mejl({
      pre: `Aplikacija je otključana do ${datum(t.kraj)}. Evo kako da uvedeš prvog klijenta još danas.`,
      dno: "Ovaj mejl stiže jer imaš FitLink nalog za trenera.",
      odjava: false,
      veze,
      telo: `
  ${nadnaslov("Proba je počela")}
  ${raz(8)}
  ${naslov("Imaš 30 dana da probaš sve")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}nalog je potvrđen i aplikacija je otključana do <strong class="t-primary" style="color:#16161f; font-weight:600;">${datum(t.kraj)}</strong>. Kartica ti ne treba. Sve radi odmah, a o pretplati ti pišemo pred kraj probe.`)}
  ${raz(26)}
  ${koraci([
    ["Pozovi prve klijente", "Na ekranu Vežbači dodirni znak za poziv i upiši mejl. Klijentu stiže mejl sa kodom i linkom za aplikaciju, za njega besplatnu."],
    ["Napravi program ili plan ishrane", "Složiš ga jednom kao šablon i dodeliš kome hoćeš."],
    ["Otvori termine", "Klijenti rezervišu sami, a ti u kalendaru vidiš ko dolazi."],
  ])}
  ${raz(26)}
  ${dugme(app, "Otvori FitLink")}
  ${raz(38)}
  ${nadnaslov("Šta sve dobijaš")}
  ${raz(8)}
  ${naslov("Ti napraviš, klijent dobije u telefon", 21)}
  ${raz(10)}
  ${tekst("Na svakoj slici levo je tvoj ekran, a desno ono što u istom trenutku vidi tvoj klijent.")}
  ${raz(26)}
  ${[
    ["par-program-serije", "Programi sa serijama i kilažom",
      "Složiš dane i vežbe iz biblioteke od 4.699 vežbi sa animacijom, upišeš serije, kilažu i ponavljanja.",
      "Otvori trening u telefonu i upisuje šta je uradio, serija po serija.",
      "Program sa serijama i kilažom kod trenera i trening kod vežbača"],
    ["par-uzivo", "Puls i kalorije uživo",
      "Vidiš puls, zonu i kalorije svakog vežbača dok trenira, i ispraviš seriju usred treninga.",
      "Trenira sa satom ili trakom za puls, a aplikacija radi i bez uređaja.",
      "Puls vežbača uživo kod trenera i trening kod vežbača"],
    ["par-clanarine", "Članarine i uplate",
      "Paketi na mesec ili na broj treninga. Zahtev potvrdiš jednim dodirom i vidiš ko još nije platio.",
      "Vidi koliko mu je treninga ostalo, a podsetnik pred istek stiže sam.",
      "Uplate i članarine kod trenera i početni ekran vežbača"],
  ].map((c) => par(app, ...(c as [string, string, string, string, string]))).join(raz(38))}
  ${raz(36)}
  ${crta()}
  ${raz(30)}
  ${nadnaslov("Unutra te čeka i")}
  ${raz(12)}
  ${stavke([
    "Plan ishrane do grama, iz više od 1.000 namirnica",
    "Termini i rezervacije, sa listom čekanja i otkaznim rokom",
    "Spisak klijenata koji nisu trenirali više od 14 dana",
    "Slike za Instagram iz rekorda i treninga tvojih klijenata",
  ])}
  ${raz(34)}
  ${crta()}
  ${raz(30)}
  ${racunar(app)}
  ${raz(34)}
  ${crta()}
  ${raz(24)}
  ${sitno(`Proba traje do ${datum(t.kraj)}. Nastavak posle toga pokrećeš na ${veza(veze.pretplata ?? PRETPLATA_URL, "fitlink.rs/pretplata")}, a ako ne pokreneš, ništa se ne naplaćuje.`)}`,
    }),
  };
}

// ---- Mejl: 7 dana pre kraja ----
export function proba7(t: Trener, veze: Veze): Mejl {
  const pretplata = veze.pretplata ?? PRETPLATA_URL;
  const app = veze.app ?? APP_URL;
  const ima = t.vezbaca > 0;
  return {
    tema: "Još 7 dana probe",
    html: mejl({
      pre: ima
        ? `Pokreni pretplatu do ${datum(t.kraj)} i ${vezbaca(t.vezbaca)} nastavlja bez prekida.`
        : "Najbolje se vidi sa pravim klijentom. Pozovi prvog još danas.",
      dno: "Ovaj podsetnik stiže jer se tvoja proba bliži kraju.",
      veze,
      telo: ima ? `
  ${nadnaslov("Još 7 dana")}
  ${raz(8)}
  ${naslov("Tvoj studio za tri nedelje")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}proba traje do <strong class="t-primary" style="color:#16161f; font-weight:600;">${datum(t.kraj)}</strong>. Ovo je urađeno do sada:`)}
  ${raz(18)}
  ${doSada(t)}
  ${raz(22)}
  ${tekst("Da bi sve nastavilo da radi i posle probe, pokreni pretplatu na sajtu. Tvoji vežbači ne primete ništa: isti programi, isti termini, ista aplikacija.")}
  ${raz(24)}
  ${dugme(pretplata, "Pokreni pretplatu")}
  ${raz(34)}
  ${crta()}
  ${raz(30)}
  ${nadnaslov("Kako")}
  ${raz(8)}
  ${naslov("Tri koraka na sajtu", 21)}
  ${raz(20)}
  ${kakoPretplata(pretplata)}` : `
  ${nadnaslov("Još 7 dana")}
  ${raz(8)}
  ${naslov("Probaj sa pravim klijentom")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}proba traje do <strong class="t-primary" style="color:#16161f; font-weight:600;">${datum(t.kraj)}</strong>, a na tvom spisku još nema vežbača. FitLink se najbolje vidi kad klijent trenira iz telefona, a ti gledaš uživo.`)}
  ${raz(24)}
  ${koraci([
    ["Pozovi klijenta", "Na ekranu Vežbači dodirni znak za poziv i upiši njegov mejl. Stiže mu kod i link za aplikaciju, za njega besplatnu."],
    ["Dodeli mu program", "Ili uzmi šablon koji već imaš."],
    ["Otvori Uživo dok trenira", "Vidiš seriju, kilažu i puls u istom trenutku."],
  ])}
  ${raz(26)}
  ${dugme(app, "Pozovi prvog klijenta")}
  ${raz(18)}
  ${sitno(`Za nastavak posle probe, pretplata se pokreće na ${veza(pretplata, "fitlink.rs/pretplata")}`)}`,
    }),
  };
}

// ---- Mejl: 3 dana pre kraja ----
export function proba3(t: Trener, veze: Veze): Mejl {
  const pretplata = veze.pretplata ?? PRETPLATA_URL;
  return {
    tema: "Proba ističe za 3 dana",
    html: mejl({
      pre: `Pokreni pretplatu do ${datum(t.kraj)} i nastavi bez prekida.`,
      dno: "Ovaj podsetnik stiže jer se tvoja proba bliži kraju.",
      veze,
      telo: `
  ${nadnaslov("Podsetnik")}
  ${raz(8)}
  ${naslov("Proba ističe za 3 dana")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}tvoja proba traje do <strong class="t-primary" style="color:#16161f; font-weight:600;">${datum(t.kraj)}</strong>.`)}
  ${raz(18)}
  ${okvir(`Kad proba istekne, ${posledica(t)}. Sve što je uneto ostaje sačuvano.`)}
  ${raz(18)}
  ${doSada(t) ? `${doSada(t)}${raz(24)}` : ""}
  ${dugme(pretplata, "Pokreni pretplatu")}
  ${raz(30)}
  ${kakoPretplata(pretplata)}`,
    }),
  };
}

// ---- Mejl: na dan kraja ----
export function probaDanas(t: Trener, veze: Veze): Mejl {
  const pretplata = veze.pretplata ?? PRETPLATA_URL;
  return {
    tema: "Proba ističe danas",
    html: mejl({
      pre: "Pokreni pretplatu danas i sutra sve radi kao i do sada.",
      dno: "Ovaj podsetnik stiže jer tvoja proba ističe danas.",
      veze,
      telo: `
  ${nadnaslov("Danas")}
  ${raz(8)}
  ${naslov("Poslednji dan probe")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}tvoja proba ističe danas. Pokreni pretplatu i sutra sve radi kao i do sada${t.vezbaca > 0 ? `, za tebe i za ${vezbaca(t.vezbaca)}` : ""}.`)}
  ${raz(18)}
  ${okvir(`Bez pretplate, od sutra ${posledica(t)}.`)}
  ${raz(24)}
  ${dugme(pretplata, "Pokreni pretplatu")}
  ${raz(18)}
  ${sitno(`Plan, kartica i fakture su uvek na ${veza(pretplata, "fitlink.rs/pretplata")}`)}`,
    }),
  };
}

// ---- Mejl: dan posle kraja, poslednji o probi ----
export function probaIstekla(t: Trener, veze: Veze): Mejl {
  const pretplata = veze.pretplata ?? PRETPLATA_URL;
  return {
    tema: "Proba je istekla, tvoji podaci su sačuvani",
    html: mejl({
      pre: "Pokreni pretplatu i sve se otključa za nekoliko sekundi.",
      dno: "Ovo je poslednji mejl o probi.",
      veze,
      telo: `
  ${nadnaslov("Proba je istekla")}
  ${raz(8)}
  ${naslov("Sve je tu, samo zaključano")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}proba je istekla ${datum(t.kraj)}. Klijenti, programi, planovi ishrane i uplate su sačuvani, ali ${t.vezbaca > 0 ? `${vezbaca(t.vezbaca)} trenutno ne ${t.vezbaca === 1 ? "može" : "mogu"} da trenira${t.vezbaca === 1 ? "" : "ju"} iz aplikacije, a ti ne možeš da menjaš ništa` : "izmene u aplikaciji su zaključane"}.`)}
  ${raz(18)}
  ${doSada(t) ? `${doSada(t)}${raz(24)}` : ""}
  ${dugme(pretplata, "Pokreni pretplatu")}
  ${raz(18)}
  ${tekst("Čim pokreneš pretplatu, aplikacija se otključa sama, za nekoliko sekundi, kod tebe i kod tvojih vežbača.")}
  ${raz(24)}
  ${sitno("Više ti nećemo pisati o probi. Nalog ostaje tvoj i čeka kad god odlučiš.")}`,
    }),
  };
}

// ---- Mejl: pretplata je pokrenuta ----
export function pretplataAktivna(t: Trener, veze: Veze): Mejl {
  const pretplata = veze.pretplata ?? PRETPLATA_URL;
  const app = veze.app ?? APP_URL;
  return {
    tema: "Pretplata je aktivna",
    html: mejl({
      pre: "Hvala ti. Evo šta sve imaš, i kako da otvoriš FitLink na računaru.",
      dno: "Ovaj mejl stiže jer je na tvom nalogu pokrenuta FitLink pretplata.",
      odjava: false,
      veze,
      telo: `
  ${nadnaslov("Pretplata je aktivna")}
  ${raz(8)}
  ${naslov("Hvala ti, sve radi bez prekida")}
  ${raz(14)}
  ${tekst(`${zdravo(t.ime)}pretplata je pokrenuta. Ti${t.vezbaca > 0 ? ` i ${vezbaca(t.vezbaca)}` : ""} nastavljate tačno tamo gde ste stali.`)}
  ${raz(30)}
  ${nadnaslov("Šta sve imaš")}
  ${raz(12)}
  ${stavke([
    "Programi sa serijama i kilažom, iz biblioteke od 4.699 vežbi",
    "Planovi ishrane do grama, iz više od 1.000 namirnica",
    "Termini i rezervacije, sa listom čekanja i otkaznim rokom",
    "Članarine i uplate: znaš ko je platio, a ko nije",
    "Puls i kalorije svakog vežbača, uživo",
    "Slike za Instagram iz rekorda i treninga tvojih klijenata",
    "Neograničen broj vežbača, za njih je aplikacija besplatna",
  ])}
  ${raz(34)}
  ${crta()}
  ${raz(30)}
  ${racunar(app)}
  ${raz(34)}
  ${crta()}
  ${raz(30)}
  ${nadnaslov("Pretplata")}
  ${raz(8)}
  ${tekst(`Plan, karticu i fakture menjaš na ${veza(pretplata, "fitlink.rs/pretplata")}. Tamo možeš i da otkažeš, kad god hoćeš.`)}
  ${raz(26)}
  ${dugmeTiho(app, "Otvori FitLink")}`,
    }),
  };
}
