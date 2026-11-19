// Pregled dva mejla za povratak trenera, bez slanja. Tekst i sablon su u
// supabase/functions/trainer-recovery-email/mejlovi.ts (jedan izvor); ovde se samo ucita i snimi u HTML.
//   node povratak.cjs [ime]   -> mejl-1.html, mejl-2.html (slike iz ./slike), pa python3 snimi.py
const fs = require('fs');
const path = require('path');
const koren = path.join(__dirname, '../../..');
const ts = require(path.join(koren, 'node_modules/typescript'));
const izvor = fs.readFileSync(path.join(koren, 'supabase/functions/trainer-recovery-email/mejlovi.ts'), 'utf8')
  .replace('const SLIKE = "https://fitlink.rs/slike/mejl/";', 'const SLIKE = "slike/";');
const js = ts.transpileModule(izvor, { compilerOptions: { target: 'ES2022', module: 'CommonJS' } }).outputText;
const m = { exports: {} };
new Function('module', 'exports', js)(m, m.exports);
const ime = process.argv[2] || 'Marko';
for (const [f, x] of [['mejl-1.html', m.exports.mejl1(ime, { odjava: '#' })], ['mejl-2.html', m.exports.mejl2(ime, { odjava: '#' })]]) {
  fs.writeFileSync(path.join(__dirname, f), x.html);
  console.log(f, '|', x.tema, '|', x.html.length);
}
