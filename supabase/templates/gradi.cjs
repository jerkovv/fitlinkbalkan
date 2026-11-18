// Pravi .html sablone za Supabase Auth mejlove iz sablon.cjs i ispisuje njihov SHA-256,
// da moze da se uporedi sa onim sto stoji u kontrolnoj tabli (Authentication > Emails).
//   node supabase/templates/gradi.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fitlinkMejl, FITLINK_MEJLOVI } = require('./sablon.cjs');

for (const [ime, o] of Object.entries(FITLINK_MEJLOVI)) {
  const html = fitlinkMejl(o);
  fs.writeFileSync(path.join(__dirname, ime + '.html'), html);
  const sha = crypto.createHash('sha256').update(html, 'utf8').digest('hex').slice(0, 16);
  console.log(ime.padEnd(22), String(html.length).padStart(5), sha, '|', o.tema);
}
