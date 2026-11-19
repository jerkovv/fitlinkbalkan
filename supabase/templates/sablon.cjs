// Sablon za mejlove koje salje Supabase Auth (potvrda naloga, pozivnica, kod za prijavu,
// promena mejla, lozinka, potvrda identiteta). Isti izgled kao mejlovi iz send-app-email:
// Poppins, zvanican logo kao slika, kartica koja se skuplja na sirinu telefona.
// Supabase cuva ove sablone samo u kontrolnoj tabli (Authentication > Emails), pa je ovo
// njihov izvor u repou: `node supabase/templates/gradi.cjs` pravi .html fajlove.
// Funkcija je namerno cist JS bez uvoza, da ista moze da se pokrene i u pregledacu.
function fitlinkMejl(o) {
  var F = "font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  var raz = function (n) {
    return '  <div style="height:' + n + 'px; line-height:' + n + 'px; font-size:0;">&nbsp;</div>';
  };
  var logo = function (klasa, slika, prikaz) {
    return '<img class="' + klasa + '" src="https://fitlink.rs/slike/' + slika + '" width="148" height="25" alt="FitLink" style="display:' + prikaz + '; border:0; outline:none; width:148px; height:25px; margin-left:-2px;">';
  };
  var r = [];
  r.push('<!DOCTYPE html>', '<html lang="sr">', '<head>', '<meta charset="utf-8">');
  r.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">', '<title>FitLink</title>');
  r.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
  r.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  r.push('<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">');
  r.push('<meta name="color-scheme" content="light dark">', '<meta name="supported-color-schemes" content="light dark">');
  r.push('<style>');
  r.push('  :root { color-scheme: light dark; supported-color-schemes: light dark; }');
  r.push('  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }');
  r.push('  @media (prefers-color-scheme: dark) {');
  r.push('    .email-bg { background-color: #0d0d12 !important; }');
  r.push('    .email-card { background-color: #14141a !important; border-color: #292932 !important; }');
  r.push('    .t-primary { color: #f3f3f7 !important; }');
  r.push('    .t-body { color: #c2c2cd !important; }');
  r.push('    .t-muted { color: #9a9aa6 !important; }');
  r.push('    .t-footer { color: #74747f !important; }');
  r.push('    .panel { background-color: #1b1b22 !important; border-color: #292932 !important; }');
  r.push('    .hairline { border-color: #292932 !important; }');
  r.push('    .t-accent { color: #b58cff !important; }');
  r.push('    .logo-svetla { display: none !important; }');
  r.push('    .logo-tamna { display: block !important; }');
  r.push('  }');
  r.push('  @media (max-width: 620px) {');
  r.push('    .pad { padding: 32px 26px 30px 26px !important; }');
  r.push('    .pad-foot { padding: 20px 26px 24px 26px !important; }');
  r.push('    .email-wrap { padding: 18px 14px !important; }');
  r.push('  }');
  r.push('</style>', '</head>');
  r.push('<body class="email-bg" style="margin:0; padding:0; background-color:#ededf3; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">');
  r.push('<div style="display:none; max-height:0; overflow:hidden; opacity:0;">' + o.pre + '</div>', '');
  r.push('<table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ededf3;">');
  r.push('<tr>', '<td align="center" class="email-wrap" style="padding:40px 16px;">', '');
  r.push('<table role="presentation" class="email-card" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:20px; border:1px solid #e6e6ee; box-shadow:0 4px 28px rgba(22,22,38,0.07); overflow:hidden;">');
  r.push('', '<tr><td class="pad" style="padding:44px 44px 38px 44px; ' + F + '">', '');
  r.push('  ' + logo('logo-svetla', 'mejl-logo-svetla.png', 'block'));
  r.push('  <!--[if !mso]><!-->' + logo('logo-tamna', 'mejl-logo-tamna.png', 'none') + '<!--<![endif]-->', '');
  r.push(raz(22));
  r.push('  <div class="hairline" style="border-top:1px solid #ececf2; font-size:0; line-height:0;">&nbsp;</div>');
  r.push(raz(30), '');
  r.push('  <div class="t-accent" style="font-size:12px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8a36e8;">' + o.nadnaslov + '</div>');
  r.push(raz(8));
  r.push('  <div class="t-primary" style="' + F + ' font-size:24px; font-weight:600; letter-spacing:-0.4px; color:#16161f; line-height:1.25;">' + o.naslov + '</div>', '');
  r.push(raz(14));
  r.push('  <div class="t-body" style="font-size:15px; color:#4b4b57; line-height:1.7;">' + o.tekst + '</div>');
  if (o.kod) {
    r.push(raz(24));
    r.push('  <table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">');
    r.push('    <tr><td align="center" class="t-primary" style="padding:' + (o.vaziKod ? '22px 12px 6px 20px' : '20px 12px 20px 20px') + '; ' + F + ' font-size:32px; font-weight:600; letter-spacing:8px; color:#16161f;">{{ .Token }}</td></tr>');
    if (o.vaziKod) {
      r.push('    <tr><td align="center" class="t-muted" style="padding:0 12px 20px 12px; font-size:13px; color:#8c8c99;">' + o.vaziKod + '</td></tr>');
    }
    r.push('  </table>');
  }
  if (o.dugme) {
    r.push(raz(28));
    r.push('  <a href="{{ .ConfirmationURL }}" style="display:inline-block; background-color:#8a36e8; background-image:linear-gradient(135deg,#8a36e8 0%,#603dea 55%,#e84bae 100%); color:#ffffff; ' + F + ' font-size:15px; font-weight:600; text-decoration:none; padding:15px 32px; border-radius:12px; box-shadow:0 8px 22px -8px rgba(138,54,232,0.5);">' + o.dugme + '</a>');
  }
  if (o.napomena) {
    r.push(raz(18));
    r.push('  <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">' + o.napomena + '</div>');
  }
  r.push('', '</td></tr>', '');
  r.push('<tr><td class="hairline pad-foot" style="padding:24px 44px 30px 44px; border-top:1px solid #eeeef4; ' + F + '">');
  r.push('  <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">FitLink, tvoj trening na jednom mestu.</div>');
  r.push(raz(3));
  r.push('  <div class="t-footer" style="font-size:12px; color:#abacb6; line-height:1.6;">Ovo je automatska poruka, ne odgovaraj na ovaj mejl.</div>');
  r.push('</td></tr>', '', '</table>', '</td>', '</tr>', '</table>', '</body>', '</html>');
  return r.join('\n');
}

// Tekstovi su isti kao u sablonima koji su stajali u kontrolnoj tabli do 2026-11-18.
var FITLINK_MEJLOVI = {
  'confirm-sign-up': {
    tema: 'Potvrdi svoj nalog',
    pre: 'Potvrdi email adresu i aktiviraj svoj FitLink nalog.',
    nadnaslov: 'Dobro došao', naslov: 'Potvrdi svoj nalog',
    tekst: 'Hvala što si se pridružio FitLink-u. Klikni dugme ispod da potvrdiš email adresu i aktiviraš svoj nalog.',
    dugme: 'Potvrdi nalog',
  },
  'invite-user': {
    // Ime trenera stize iz pozivnice (send-invite ga upisuje u podatke naloga kao trainer_name).
    tema: '{{ if .Data.trainer_name }}{{ .Data.trainer_name }} te poziva na FitLink{{ else }}Pozvan si na FitLink{{ end }}',
    pre: '{{ if .Data.trainer_name }}Trener {{ .Data.trainer_name }} te poziva na FitLink.{{ else }}Tvoj trener te poziva na FitLink.{{ end }}',
    nadnaslov: 'Pozivnica', naslov: 'Pozvan si na FitLink',
    tekst: '{{ if .Data.trainer_name }}Trener <b>{{ .Data.trainer_name }}</b> te poziva{{ else }}Tvoj trener te poziva{{ end }} na FitLink. Otvori FitLink aplikaciju, izaberi <b>Ja sam vežbač</b> i unesi ovaj kod:',
    kod: true, vaziKod: 'Kod važi 24 sata',
    napomena: 'Kod je istekao? Traži od trenera da ti pošalje novi.',
  },
  'magic-link-or-otp': {
    tema: 'Tvoj kod za FitLink',
    pre: 'Tvoj kod za prijavu na FitLink.',
    nadnaslov: 'Prijava', naslov: 'Tvoj kod za FitLink',
    tekst: 'Otvori FitLink aplikaciju, izaberi <b>Ja sam vežbač</b> i unesi ovaj kod:',
    kod: true, vaziKod: 'Kod važi 24 sata',
    napomena: 'Kod je istekao? Traži od trenera da ti pošalje novi.',
  },
  'change-email-address': {
    tema: 'Potvrdi novu email adresu',
    pre: 'Potvrdi novu email adresu za svoj FitLink nalog.',
    nadnaslov: 'Promena mejla', naslov: 'Potvrdi novu adresu',
    tekst: 'Stigao je zahtev da email adresu naloga promeniš na <span class="t-primary" style="font-weight:600; color:#16161f;">{{ .NewEmail }}</span>. Klikni dugme ispod da potvrdiš novu adresu. Ako ovo nisi ti, slobodno ignoriši ovaj mejl.',
    dugme: 'Potvrdi adresu',
  },
  'reset-password': {
    tema: 'Resetuj lozinku',
    pre: 'Tvoj kod za promenu lozinke.',
    nadnaslov: 'Lozinka', naslov: 'Resetuj lozinku',
    tekst: 'Stigao je zahtev za promenu lozinke za tvoj FitLink nalog. Unesi ovaj kod u aplikaciji da postaviš novu lozinku. Ako ti nisi poslao ovaj zahtev, slobodno ignoriši ovaj mejl.',
    kod: true,
    napomena: 'Kod važi 1 sat. Ne deli ga ni sa kim.',
  },
  'reauthentication': {
    tema: 'Kod za potvrdu identiteta',
    pre: 'Tvoj kod za potvrdu identiteta na FitLink-u.',
    nadnaslov: 'Potvrda identiteta', naslov: 'Tvoj kod za potvrdu',
    tekst: 'Unesi ovaj kod u aplikaciji da potvrdiš identitet pre nastavka. Kod važi kratko i koristi se jednom.',
    kod: true,
  },
};

if (typeof module !== 'undefined') module.exports = { fitlinkMejl: fitlinkMejl, FITLINK_MEJLOVI: FITLINK_MEJLOVI };
