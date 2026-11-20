// Pregled mejlova probe bez kartice, bez slanja. Tekst i sablon su u
// supabase/functions/trainer-trial-email/mejlovi.ts (jedan izvor); ovde se samo ucita i snimi u HTML.
//   node proba.cjs   -> mejl-*.html (slike iz ./slike), pa python3 snimi.py
const fs = require('fs');
const path = require('path');
const koren = path.join(__dirname, '../../..');
const ts = require(path.join(koren, 'node_modules/typescript'));
const izvor = fs.readFileSync(path.join(koren, 'supabase/functions/trainer-trial-email/mejlovi.ts'), 'utf8')
  .replace('const SLIKE = "https://fitlink.rs/slike/mejl/";', 'const SLIKE = "slike/";');
const js = ts.transpileModule(izvor, { compilerOptions: { target: 'ES2022', module: 'CommonJS' } }).outputText;
const m = { exports: {} };
new Function('module', 'exports', 'require', js)(m, m.exports, require);
const M = m.exports;
const kraj = new Date('2026-12-20T12:00:00Z');
const sa = { ime: 'Marko', kraj, vezbaca: 6, treninga: 41, programa: 3 };
const bez = { ime: 'Marko', kraj, vezbaca: 0, treninga: 0, programa: 1 };
const v = { odjava: '#' };
const spisak = [
  ['1-dobrodoslica', M.dobrodoslica(sa, v)],
  ['2-proba7', M.proba7(sa, v)],
  ['2b-proba7-bez-klijenata', M.proba7(bez, v)],
  ['3-proba3', M.proba3(sa, v)],
  ['4-proba-danas', M.probaDanas(sa, v)],
  ['5-proba-istekla', M.probaIstekla(sa, v)],
  ['6-pretplata-aktivna', M.pretplataAktivna(sa, v)],
];
for (const [ime, x] of spisak) {
  fs.writeFileSync(path.join(__dirname, `mejl-${ime}.html`), x.html);
  console.log(ime, '|', x.tema);
}
