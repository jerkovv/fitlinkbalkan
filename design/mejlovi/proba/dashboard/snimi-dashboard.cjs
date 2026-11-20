// Snimci pravog trenerskog dashboarda (fitlink.rs/dashboard) sa LAZNIM podacima, za mejlove.
// Nista ne ide ka Supabase-u: svaki zahtev ka *.supabase.co presrece se kroz CDP Fetch i
// odgovara se lokalno iz podaci.cjs; DNS za *.supabase.co je dodatno ugasen (host-resolver-rules),
// pa ni promaseni zahtev ni realtime websocket ne mogu da stignu do produkcije.
//
//   node design/mejlovi/proba/dashboard/snimi-dashboard.cjs            -> pocetna.png, uzivo.png, kalendar.png + slike/dashboard.jpg
//   node design/mejlovi/proba/dashboard/snimi-dashboard.cjs uzivo      -> samo jedna strana (pocetna | uzivo | kalendar | ...)
//   SAMO_LOG=1 ...                                                      -> samo spisak zahteva (zahtevi.log), bez slika
//
// Pretpostavka: Vite dev server vec radi na http://localhost:8080 (ovaj skript ga ne pokrece).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const koren = path.join(__dirname, '../../../..');
const WebSocket = require(path.join(koren, 'node_modules/ws'));
const podaci = require('./podaci.cjs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9347;
const BAZA = 'http://localhost:8080';
const SUPA_HOST = 'iyvvskywmqtudafapxdk.supabase.co';
const SIRINA = 1440;
const VISINA = 900;

const STRANE = {
  pocetna: '/dashboard/trener',
  uzivo: '/dashboard/trener/uzivo',
  kalendar: '/dashboard/trener/kalendar',
  vezbaci: '/dashboard/trener/vezbaci',
  finansije: '/dashboard/trener/finansije',
  uplate: '/dashboard/trener/uplate',
  programi: '/dashboard/trener/programi',
  paketi: '/dashboard/trener/paketi',
  ishrana: '/dashboard/trener/ishrana',
  termini: '/dashboard/trener/termini',
  chat: '/dashboard/trener/chat',
  profil: '/dashboard/trener/profil',
};

const izabrane = process.argv.slice(2).length ? process.argv.slice(2) : ['pocetna', 'uzivo', 'kalendar'];
const SAMO_LOG = !!process.env.SAMO_LOG;
const logFajl = path.join(__dirname, 'zahtevi.log');
fs.writeFileSync(logFajl, '');
const log = (s) => fs.appendFileSync(logFajl, s + '\n');

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlink-snimak-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profil}`,
    `--window-size=${SIRINA},${VISINA}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--lang=sr-Latn-RS',
    // Bezbednosna mreza: Supabase ime se nikad ne razresi u adresu.
    '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND, MAP supabase.co ~NOTFOUND',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let ugasen = false;
  const ugasi = () => {
    if (ugasen) return;
    ugasen = true;
    try { chrome.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { fs.rmSync(profil, { recursive: true, force: true }); } catch {} }, 800);
  };
  process.on('exit', ugasi);
  process.on('SIGINT', () => { ugasi(); process.exit(1); });

  // Cekaj DevTools
  let cilj;
  for (let i = 0; i < 60 && !cilj; i++) {
    await pauza(250);
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      cilj = lista.find((t) => t.type === 'page');
    } catch {}
  }
  if (!cilj) throw new Error('Chrome DevTools nije odgovorio');

  const ws = new WebSocket(cilj.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let sled = 0;
  const cekaju = new Map();
  const slusaoci = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && cekaju.has(m.id)) {
      const { r, j } = cekaju.get(m.id);
      cekaju.delete(m.id);
      m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result);
    } else if (m.method) {
      for (const f of slusaoci) f(m);
    }
  });
  const cdp = (method, params = {}) => new Promise((r, j) => {
    const id = ++sled;
    cekaju.set(id, { r, j });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Brojac otvorenih Supabase zahteva, za "mirno stanje" pre snimka
  let poslednjiZahtev = Date.now();
  const greske = [];

  slusaoci.push(async (m) => {
    if (m.method === 'Runtime.exceptionThrown') {
      greske.push('EXC ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300);
      greske.push('ERR ' + t);
    }
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const u = new URL(request.url);
    try {
      if (u.hostname === SUPA_HOST || u.hostname.endsWith('.supabase.co')) {
        if (!podaci.ANKETNI.some((x) => u.pathname.endsWith('/' + x))) poslednjiZahtev = Date.now();
        let telo = request.postData;
        if (!telo && request.hasPostData) {
          try { telo = (await cdp('Fetch.getRequestPostData', { requestId })).postData; } catch {}
        }
        const odg = podaci.odgovor({
          method: request.method,
          url: u,
          headers: request.headers,
          body: telo,
        });
        log(`${request.method} ${odg.status} ${decodeURIComponent(u.pathname + u.search)}${telo ? '  BODY ' + telo.slice(0, 400) : ''}${odg.napomena ? '  <' + odg.napomena + '>' : ''}`);
        const hdr = {
          'Access-Control-Allow-Origin': BAZA,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Profile, X-Supabase-Api-Version, Range',
          ...(odg.headers || {}),
        };
        let telo64 = '';
        if (odg.body !== undefined && odg.body !== null && request.method !== 'HEAD') {
          const buf = Buffer.isBuffer(odg.body) ? odg.body : Buffer.from(typeof odg.body === 'string' ? odg.body : JSON.stringify(odg.body));
          telo64 = buf.toString('base64');
          if (!hdr['Content-Type']) hdr['Content-Type'] = 'application/json; charset=utf-8';
        }
        await cdp('Fetch.fulfillRequest', {
          requestId,
          responseCode: odg.status,
          responseHeaders: Object.entries(hdr).map(([name, value]) => ({ name, value: String(value) })),
          body: telo64,
        });
        return;
      }
      const dozvoljen = u.hostname === 'localhost' || u.hostname === '127.0.0.1' ||
        u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' ||
        u.protocol === 'data:' || u.protocol === 'blob:';
      if (dozvoljen) {
        await cdp('Fetch.continueRequest', { requestId });
      } else {
        log(`BLOKIRANO ${request.method} ${request.url.slice(0, 200)}`);
        await cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      }
    } catch (e) {
      log(`GRESKA ${request.method} ${request.url}: ${e.stack || e.message}`);
      try { await cdp('Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch {}
    }
  });

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: SIRINA, height: VISINA, deviceScaleFactor: 2, mobile: false });
  await cdp('Emulation.setLocaleOverride', { locale: 'sr-Latn-RS' }).catch(() => {});
  await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Belgrade' });

  // Lazna sesija pre nego sto se app ucita + websocket ka Supabase-u nikad ne krece
  const sesija = podaci.sesija();
  const pripremi = `
    (() => {
      if (location.origin !== ${JSON.stringify(BAZA)}) return;
      try {
        localStorage.setItem('sb-iyvvskywmqtudafapxdk-auth-token', ${JSON.stringify(JSON.stringify(sesija))});
        const dodatno = ${JSON.stringify(podaci.localStorageDodatno ? podaci.localStorageDodatno() : {})};
        for (const k in dodatno) localStorage.setItem(k, dodatno[k]);
      } catch (e) {}
      const PraviWS = window.WebSocket;
      window.WebSocket = function (url, p) {
        if (String(url).includes('supabase.co')) url = 'ws://127.0.0.1:9/zatvoreno';
        return p === undefined ? new PraviWS(url) : new PraviWS(url, p);
      };
      window.WebSocket.prototype = PraviWS.prototype;
      Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
      // "Trenira uzivo": kriva pulsa se gradi od 10-sekundnih osvezavanja. Prvih ~12 s
      // ta osvezavanja idu na 300 ms da kriva bude puna pre snimka, posle normalno.
      if (location.pathname.endsWith('/uzivo')) {
        const praviSI = window.setInterval.bind(window);
        const t0 = Date.now();
        window.setInterval = (fn, ms, ...rest) => {
          if (ms !== 10000 || typeof fn !== 'function') return praviSI(fn, ms, ...rest);
          let tik = 0;
          return praviSI(() => { tik++; if (Date.now() - t0 < 12000 || tik % 33 === 0) fn(...rest); }, 300);
        };
      }
    })();
  `;
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: pripremi });

  const eval_ = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

  for (const ime of izabrane) {
    const putanja = STRANE[ime] || ime;
    log(`\n===== ${ime} ${putanja} =====`);
    greske.length = 0;
    await cdp('Page.navigate', { url: BAZA + putanja });
    poslednjiZahtev = Date.now();
    // mirno stanje: 2.5 s bez novog Supabase zahteva (max 30 s)
    const pocetak = Date.now();
    await pauza(2500);
    while (Date.now() - poslednjiZahtev < 2500 && Date.now() - pocetak < 30000) await pauza(300);
    if (putanja.endsWith('/uzivo')) await pauza(Math.max(0, 13000 - (Date.now() - pocetak)));
    await eval_(`document.fonts.ready.then(() => true)`);
    await eval_(`Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 5000); })))`);
    await pauza(1200); // animacije ulaska
    for (const g of greske) log('  ' + g);
    const tekst = await eval_(`document.body.innerText.slice(0, 3000)`);
    log('--- TEKST ---\n' + tekst + '\n--- /TEKST ---');
    if (!SAMO_LOG) {
      const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const fajl = path.join(__dirname, `${ime}.png`);
      fs.writeFileSync(fajl, Buffer.from(shot.data, 'base64'));
      console.log('snimljeno', fajl);
    }
  }

  ws.close();
  ugasi();

  if (!SAMO_LOG && izabrane.includes('pocetna')) {
    const jpg = path.join(__dirname, '../slike/dashboard.jpg');
    // 1440x900 @2x = 2880x1800 -> 1536 sirine, isti odnos
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '--resampleWidth', '1536',
      path.join(__dirname, 'pocetna.png'), '--out', jpg], { stdio: 'ignore' });
    console.log('snimljeno', jpg);
  }
  console.log('zahtevi:', logFajl);
}

main().catch((e) => { console.error(e); process.exit(1); });
