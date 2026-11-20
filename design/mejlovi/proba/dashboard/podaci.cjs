// Lazni podaci za snimke dashboarda. Sve je izmisljeno: trener, studio, vezbaci, uplate.
// Vremena se racunaju od trenutka pokretanja (Beograd), pa "danas" i "uzivo" uvek stoje.
const { Baza } = require('./postgrest.cjs');

const TRENER_ID = '7a1c0e52-4b7e-4f0a-9c1d-5e2f3a4b6c7d';
const MEJL = 'marko@studioforma.rs';
const TZ = 'Europe/Belgrade';

// ---------- pomocno ----------
function b64url(o) {
  return Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slucaj = rng(20261120);
const uuid = (pref, n) => `${pref}-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Datum u Beogradu kao YYYY-MM-DD
const lokalniDatum = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dodajDane = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const danUNedelji = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = pon
const sad = () => Date.now();
const pre = (ms) => new Date(sad() - ms).toISOString();
const MIN = 60 * 1000;

const DANAS = lokalniDatum(new Date());
const DANAS_UTC = new Date().toISOString().slice(0, 10);

// ---------- trener ----------
const korisnik = () => ({
  id: TRENER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: MEJL,
  email_confirmed_at: '2026-03-02T09:14:00Z',
  phone: '',
  confirmed_at: '2026-03-02T09:14:00Z',
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Marko Jovanović', role: 'trainer' },
  identities: [],
  created_at: '2026-03-02T09:10:00Z',
  updated_at: new Date().toISOString(),
  is_anonymous: false,
});

function sesija() {
  const t = Math.floor(Date.now() / 1000);
  const exp = t + 60 * 60 * 24 * 7;
  const token = [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({
    iss: 'https://iyvvskywmqtudafapxdk.supabase.co/auth/v1', sub: TRENER_ID, aud: 'authenticated', exp, iat: t,
    email: MEJL, role: 'authenticated', aal: 'aal1', session_id: 'lazna-sesija',
  }), b64url('potpis')].join('.');
  return { access_token: token, token_type: 'bearer', expires_in: exp - t, expires_at: exp, refresh_token: 'lazni-refresh', user: korisnik() };
}

// ---------- vezbaci ----------
const IMENA = [
  'Ana Marković', 'Luka Petrović', 'Jovana Nikolić', 'Stefan Ilić', 'Nikola Savić', 'Mila Jović',
  'Milica Stanković', 'Marija Popović', 'Nemanja Đorđević', 'Teodora Lazić', 'Filip Kostić', 'Sara Pavlović',
  'Uroš Milošević', 'Katarina Todorović', 'Aleksa Ristić', 'Ivana Simić', 'Vuk Stojanović', 'Jelena Mitrović',
  'Dušan Obradović', 'Tamara Vasić', 'Lazar Živković', 'Nina Radovanović',
  // bez aktivne clanarine (na spisku, ali istekla)
  'Bojan Kovačević', 'Sanja Perić',
];
const vezbaci = IMENA.map((ime, i) => ({ id: uuid('a1b2c3d4', i + 1), ime, aktivan: i < 22 }));
const poImenu = (ime) => vezbaci.find((v) => v.ime === ime);

const profiles = [
  { id: TRENER_ID, full_name: 'Marko Jovanović', avatar_url: null, email: MEJL, phone: '+381 64 218 4471' },
  ...vezbaci.map((v, i) => ({
    id: v.id, full_name: v.ime, avatar_url: null,
    email: v.ime.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').replace(' ', '.') + '@mail.rs',
    phone: null, created_at: `2026-0${3 + (i % 6)}-1${i % 9}T10:00:00Z`,
  })),
];

const athletes = vezbaci.map((v, i) => ({
  id: v.id, trainer_id: TRENER_ID, created_at: `2026-0${3 + (i % 6)}-1${i % 9}T10:00:00Z`,
  goal: null, status: v.aktivan ? 'active' : 'inactive',
}));

// ---------- paketi ----------
const PAKETI = [
  { id: uuid('9a8b7c6d', 1), name: 'Mesečna članarina - 12 treninga', price_rsd: 9500, sessions: 12, days: 30 },
  { id: uuid('9a8b7c6d', 2), name: 'Personalni paket - 8 treninga', price_rsd: 19200, sessions: 8, days: 30 },
  { id: uuid('9a8b7c6d', 3), name: 'Mala grupa - 8 treninga', price_rsd: 11000, sessions: 8, days: 30 },
  { id: uuid('9a8b7c6d', 4), name: 'Neograničeno mesečno', price_rsd: 13500, sessions: null, days: 30 },
  { id: uuid('9a8b7c6d', 5), name: 'Personalni paket - 4 treninga', price_rsd: 10400, sessions: 4, days: 30 },
];
const membership_packages = PAKETI.map((p, i) => ({
  id: p.id, trainer_id: TRENER_ID, name: p.name, price_rsd: p.price_rsd, price: p.price_rsd,
  sessions_count: p.sessions, duration_days: p.days, is_active: true, sort_order: i, created_at: '2026-03-05T10:00:00Z',
}));

// ---------- clanarine ----------
// 4 isticu u narednih 14 dana, ostale aktivne duze, 2 istekle.
const memberships = vezbaci.map((v, i) => {
  const p = PAKETI[i % PAKETI.length];
  let kraj;
  if (!v.aktivan) kraj = dodajDane(DANAS, -9 - i);
  else if ([3, 8, 13, 19].includes(i)) kraj = dodajDane(DANAS, [2, 5, 9, 12][[3, 8, 13, 19].indexOf(i)]);
  else kraj = dodajDane(DANAS, 16 + ((i * 7) % 14));
  return {
    id: uuid('5e6f7a8b', i + 1), athlete_id: v.id, trainer_id: TRENER_ID, package_id: p.id, plan_name: p.name,
    price: p.price_rsd, starts_on: dodajDane(kraj, -30), ends_on: kraj, status: 'active',
    sessions_total: p.sessions, sessions_used: p.sessions ? Math.floor(p.sessions * 0.4 + (i % 4)) : null,
    created_at: dodajDane(kraj, -30) + 'T09:00:00Z',
  };
});

// ---------- uplate ----------
// Prihod po mesecu (placeno), od juna do danas, sa rastom.
const membership_purchases = [];
{
  const sadD = new Date();
  const ciljevi = [118600, 131900, 126300, 168800, 214500, 268300];
  let n = 1;
  for (let k = 0; k < 6; k++) {
    const m = new Date(sadD.getFullYear(), sadD.getMonth() - 5 + k, 1);
    const daniUMesecu = k === 5 ? Math.max(1, sadD.getDate()) : new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let zbir = 0;
    while (zbir < ciljevi[k] - 9000) {
      const p = PAKETI[Math.floor(slucaj() * PAKETI.length)];
      const v = vezbaci[Math.floor(slucaj() * 22)];
      const dan = 1 + Math.floor(slucaj() * daniUMesecu);
      const paid = new Date(m.getFullYear(), m.getMonth(), dan, 9 + Math.floor(slucaj() * 10), Math.floor(slucaj() * 60));
      if (paid.getTime() > sadD.getTime()) continue;
      membership_purchases.push({
        id: uuid('7c8d9e0f', n++), trainer_id: TRENER_ID, athlete_id: v.id, package_id: p.id, package_name: p.name,
        price_rsd: p.price_rsd, status: 'confirmed', payment_method: slucaj() < 0.55 ? 'cash' : 'bank',
        created_at: paid.toISOString(), paid_at: paid.toISOString(), confirmed_at: paid.toISOString(),
      });
      zbir += p.price_rsd;
    }
    // poslednja dopuna do cilja (zaokruzeno na stotinu)
    const ostatak = ciljevi[k] - zbir;
    if (ostatak > 0) {
      const paid = new Date(m.getFullYear(), m.getMonth(), Math.min(daniUMesecu, 3), 11, 20);
      membership_purchases.push({
        id: uuid('7c8d9e0f', n++), trainer_id: TRENER_ID, athlete_id: vezbaci[k].id, package_id: PAKETI[0].id,
        package_name: 'Dnevni dolazak', price_rsd: ostatak, status: 'confirmed', payment_method: 'cash',
        created_at: paid.toISOString(), paid_at: paid.toISOString(), confirmed_at: paid.toISOString(),
      });
    }
  }
  // na cekanju
  [['Milica Stanković', 0, 3 * 60], ['Nemanja Đorđević', 1, 26 * 60], ['Sara Pavlović', 2, 50 * 60]].forEach(([ime, pi, minPre], j) => {
    const p = PAKETI[pi];
    membership_purchases.push({
      id: uuid('7c8d9e0f', 900 + j), trainer_id: TRENER_ID, athlete_id: poImenu(ime).id, package_id: p.id, package_name: p.name,
      price_rsd: p.price_rsd, status: 'pending', payment_method: j === 1 ? 'bank' : 'cash',
      created_at: pre(minPre * MIN), paid_at: null, confirmed_at: null,
    });
  });
}

// ---------- termini ----------
const TIPOVI = {
  personalni: { id: uuid('3c4d5e6f', 1), name: 'Personalni trening', color: 'violet', duration_min: 60, capacity: 1 },
  mala: { id: uuid('3c4d5e6f', 2), name: 'Mala grupa', color: 'indigo', duration_min: 60, capacity: 4 },
  grupni: { id: uuid('3c4d5e6f', 3), name: 'Funkcionalni grupni', color: 'emerald', duration_min: 45, capacity: 8 },
  mobilnost: { id: uuid('3c4d5e6f', 4), name: 'Mobilnost i core', color: 'sky', duration_min: 45, capacity: 6 },
};
const session_types = Object.values(TIPOVI).map((t) => ({ ...t, trainer_id: TRENER_ID, is_active: true }));

// Nedeljni raspored: [vreme, tip]
const RASPORED_RADNI = [
  ['07:00', 'grupni'], ['08:30', 'mala'], ['10:00', 'personalni'], ['12:30', 'personalni'],
  ['16:00', 'personalni'], ['17:00', 'personalni'], ['18:00', 'mala'], ['19:15', 'personalni'],
];
// utorkom i cetvrtkom jos i mobilnost
const RASPORED_UT_CET = [...RASPORED_RADNI.slice(0, 3), ['11:00', 'mobilnost'], ...RASPORED_RADNI.slice(3)];
const RASPORED_SUBOTA = [['09:00', 'grupni'], ['10:15', 'mobilnost'], ['11:30', 'personalni']];
const rasporedZaDan = (d) => (d === 6 ? [] : d === 5 ? RASPORED_SUBOTA : d === 1 || d === 3 ? RASPORED_UT_CET : RASPORED_RADNI);
const rasporedZa = (iso) => rasporedZaDan(danUNedelji(iso));
const session_slot_templates = [];
for (let d = 0; d < 6; d++) {
  for (const [vreme, tip] of rasporedZaDan(d)) {
    session_slot_templates.push({
      id: uuid('2b3c4d5e', session_slot_templates.length + 1), trainer_id: TRENER_ID, weekday: d,
      start_time: vreme + ':00', session_type_id: TIPOVI[tip].id, is_active: true,
    });
  }
}

// Rezervacije: od pre 14 dana do 28 dana napred. Popunjenost raste ka danasnjem danu.
const session_bookings = [];
const listaCekanja = {}; // kljuc datum|vreme|tip -> broj
{
  let n = 1;
  const uzetiDanas = new Set(); // danas svako dolazi jednom
  for (let off = -14; off <= 28; off++) {
    const iso = dodajDane(DANAS, off);
    const r = rng(1000 + off + 50);
    for (const [vreme, tipK] of rasporedZa(iso)) {
      const tip = TIPOVI[tipK];
      let popuna = tip.capacity === 1 ? (r() < (off > 7 ? 0.55 : 0.9) ? 1 : 0) : Math.round(tip.capacity * (off > 7 ? 0.35 + r() * 0.3 : 0.6 + r() * 0.4));
      // danas: pun jutarnji grupni (i lista cekanja), mala grupa 3/4 i 4/4, svi personalni zauzeti
      if (off === 0) popuna = { grupni: 8, personalni: 1, mala: vreme === '08:30' ? 3 : 4, mobilnost: 4 }[tipK];
      const izabrani = [...vezbaci.slice(0, 22)].filter((v) => off !== 0 || !uzetiDanas.has(v.id)).sort(() => r() - 0.5).slice(0, popuna);
      if (off === 0) izabrani.forEach((v) => uzetiDanas.add(v.id));
      izabrani.forEach((v, j) => {
        const gost = tip.capacity > 1 && j === popuna - 1 && r() < 0.3;
        session_bookings.push({
          id: uuid('4d5e6f7a', n++), trainer_id: TRENER_ID, athlete_id: gost ? null : v.id,
          guest_name: gost ? ['Petar (proba)', 'Đorđe Lukić', 'Maja (prvi dolazak)'][n % 3] : null,
          added_by: gost ? TRENER_ID : null, charged: gost ? false : true,
          date: iso, start_time: vreme + ':00', session_type_id: tip.id, type_name: tip.name, type_color: tip.color,
          duration_min: tip.duration_min, capacity: tip.capacity, status: 'booked',
          created_at: pre(3 * 24 * 60 * MIN),
        });
      });
      if (popuna >= tip.capacity && tip.capacity > 1 && off >= 0) listaCekanja[`${iso}|${vreme}|${tip.id}`] = off === 0 ? (tipK === 'grupni' ? 3 : 1) : 1 + Math.floor(r() * 2);
    }
  }
  // dashboard trazi danasnji dan po UTC datumu; posle ponoci po Beogradu to je jos jucerasnji
  if (DANAS_UTC !== DANAS) {
    for (const b of session_bookings.filter((x) => x.date === DANAS)) session_bookings.push({ ...b, id: b.id.replace('4d5e', '4d5f'), date: DANAS_UTC });
  }
  // istorija: zavrseni termini se u nekim upitima traze kao 'booked'; dovoljno za brojke
}

// ---------- sadrzaj studija ----------
const PROGRAMI = [
  'Snaga 4 dana - gornji/donji', 'Hipertrofija PPL', 'Početnik - celo telo 3x', 'Mršavljenje + kondicija',
  'Glute focus 8 nedelja', 'Snaga 5x5', 'Kalistenika osnove', 'Priprema za trku 10 km', 'Rehab kolena - faza 2',
  'Funkcionalni HIIT', 'Mobilnost i core', 'Trudnice - drugi trimestar', 'Powerlifting blok A', 'Kettlebell 30 min',
];
const program_templates = PROGRAMI.map((ime, i) => ({
  id: uuid('6f7a8b9c', i + 1), trainer_id: TRENER_ID, name: ime, description: null, weeks: 4 + (i % 5) * 2,
  days_per_week: 3 + (i % 3), created_at: `2026-0${4 + (i % 6)}-0${1 + (i % 8)}T10:00:00Z`, updated_at: pre((i + 2) * 24 * 60 * MIN),
}));
const ISHRANA = [
  'Mršavljenje 1.800 kcal', 'Masa 3.000 kcal', 'Održavanje 2.200 kcal', 'Visoko proteinski 2.400 kcal',
  'Vegetarijanski 2.000 kcal', 'Posni režim 1.900 kcal', 'Sportista - dan treninga', 'Rekompozicija 2.100 kcal',
];
const nutrition_plan_templates = ISHRANA.map((ime, i) => ({
  id: uuid('8b9c0d1e', i + 1), trainer_id: TRENER_ID, name: ime, target_kcal: Number(ime.match(/(\d)\.(\d{3})/) ? ime.match(/(\d)\.(\d{3})/).slice(1).join('') : 2200),
  created_at: `2026-0${4 + (i % 6)}-1${i}T10:00:00Z`, updated_at: pre((i + 1) * 36 * 60 * MIN),
}));

const trainers = [{
  id: TRENER_ID, studio_name: 'Studio Forma', city: 'Beograd', slug: 'studio-forma', bio: null,
  instagram: 'studioforma.bg', phone: '+381 64 218 4471', created_at: '2026-03-02T09:10:00Z',
}];

const OBAVESTENJA = [
  ['payment_request', 'Milica Stanković traži članarinu', 'Mesečna članarina - 12 treninga · 9.500 RSD', 'Milica Stanković', 3 * MIN * 60, false],
  ['pr_set', 'Novi rekord: Luka Petrović', 'Mrtvo dizanje 140 kg x 3', 'Luka Petrović', 95 * MIN, false],
  ['booking_created', 'Nova rezervacija', 'Jovana Nikolić · Mala grupa, sutra 08:00', 'Jovana Nikolić', 140 * MIN, false],
  ['workout_completed', 'Trening završen', 'Teodora Lazić · Glute focus, dan 3 · 54 min', 'Teodora Lazić', 210 * MIN, false],
  ['waitlist_joined', 'Lista čekanja', 'Uroš Milošević čeka mesto na Funkcionalnom grupnom 18:00', 'Uroš Milošević', 260 * MIN, false],
  ['payment_request', 'Nemanja Đorđević traži članarinu', 'Personalni paket - 8 treninga · 19.200 RSD', 'Nemanja Đorđević', 26 * 60 * MIN, true],
  ['membership_expiring', 'Članarina ističe', 'Stefan Ilić · ističe za 2 dana', 'Stefan Ilić', 28 * 60 * MIN, true],
  ['workout_completed', 'Trening završen', 'Nikola Savić · Snaga 5x5, dan 2 · 61 min', 'Nikola Savić', 30 * 60 * MIN, true],
];
const notifications = OBAVESTENJA.map(([kind, title, body, ime, starost, procitano], i) => ({
  id: uuid('1e2f3a4b', i + 1), recipient_id: TRENER_ID, recipient_role: 'trainer', sender_id: poImenu(ime).id,
  athlete_id: poImenu(ime).id, kind, title, body, meta: {}, is_read: procitano, created_at: pre(starost),
}));

const workout_live_messages = [];
const trainer_subscriptions = [{ trainer_id: TRENER_ID, status: 'active', plan: 'pro', current_period_end: dodajDane(DANAS, 21) + 'T00:00:00Z' }];

const tabele = {
  user_roles: [{ user_id: TRENER_ID, role: 'trainer' }],
  profiles, athletes, trainers, memberships, membership_purchases, membership_packages,
  session_types, session_slot_templates, session_bookings, program_templates, nutrition_plan_templates,
  notifications, workout_live_messages, trainer_subscriptions, messages: [],
};
const relacije = [
  { iz: 'athletes', kolona: 'id', u: 'profiles' },
  { iz: 'memberships', kolona: 'athlete_id', u: 'profiles' },
  { iz: 'membership_purchases', kolona: 'athlete_id', u: 'profiles' },
  { iz: 'membership_purchases', kolona: 'package_id', u: 'membership_packages' },
  { iz: 'memberships', kolona: 'package_id', u: 'membership_packages' },
  { iz: 'session_bookings', kolona: 'athlete_id', u: 'profiles' },
  { iz: 'session_bookings', kolona: 'session_type_id', u: 'session_types' },
  { iz: 'session_slot_templates', kolona: 'session_type_id', u: 'session_types' },
];
const baza = new Baza(tabele, relacije);

// ---------- uzivo ----------
// Puls se pomera iz poziva u poziv (kriva u spisku "Trenira uzivo" se gradi od ovih brojki).
const UZIVO = [
  { ime: 'Luka Petrović', minuta: 52, hr: 168, amp: 7, vezba: 'Mrtvo dizanje', serija: 3, od: 5, kcal: 486, uradjeno: 14, izvor: 'watch', uredjaj: null, bat: 64 },
  { ime: 'Jovana Nikolić', minuta: 38, hr: 151, amp: 6, vezba: 'Bugarski čučanj', serija: 2, od: 4, kcal: 318, uradjeno: 9, izvor: 'sensor', uredjaj: 'HUAWEI WATCH GT 5-3A1F', bat: 81 },
  { ime: 'Stefan Ilić', minuta: 24, hr: 131, amp: 5, vezba: 'Veslanje na mašini', serija: 2, od: 3, kcal: 207, uradjeno: 6, izvor: 'sensor', uredjaj: 'Polar H10 8C2F1A07', bat: 92 },
  { ime: 'Ana Marković', minuta: 65, hr: 104, amp: 4, vezba: 'Potisak sa ravne klupe', serija: 4, od: 4, kcal: 541, uradjeno: 17, izvor: 'sensor', uredjaj: 'Forerunner 265', bat: 47, odmor: 72 },
];
let poziv = 0;
const pocetakUzivo = Date.now();
const hrRng = rng(77);
const hrStanje = UZIVO.map((u) => u.hr);
function aktivniVezbaci() {
  poziv++;
  const t = Date.now();
  return UZIVO.map((u, i) => {
    const v = poImenu(u.ime);
    hrStanje[i] += (u.hr - hrStanje[i]) * 0.3 + (hrRng() - 0.5) * u.amp * 1.6 + (hrRng() < 0.12 ? (hrRng() - 0.3) * u.amp * 2 : 0);
    const hr = Math.round(hrStanje[i]);
    const startedAt = new Date(pocetakUzivo - u.minuta * MIN).toISOString();
    const svez = new Date(t - 2000).toISOString();
    // odmor stoji fiksno od pokretanja, pa odbrojava kao pravi
    const krajOdmora = u.odmor ? new Date(pocetakUzivo + (u.odmor + 25) * 1000).toISOString() : null;
    return {
      athlete_id: v.id, athlete_name: u.ime, session_id: uuid('0d1e2f3a', i + 1), started_at: startedAt,
      current_exercise_idx: u.uradjeno % 6, current_exercise_name: u.vezba, current_set_number: u.serija, total_sets: u.od,
      current_hr: hr, current_active_calories: u.kcal + Math.round((t - pocetakUzivo) / 6000),
      watch_last_hr_at: u.izvor === 'watch' ? svez : null, hr_last_at: svez, hr_source: u.izvor,
      current_state: u.odmor ? 'rest' : 'exercise', rest_ends_at: krajOdmora, total_completed_sets: u.uradjeno,
      last_heartbeat: svez, sensor_name: u.uredjaj,
      sensor_battery: u.izvor === 'sensor' ? u.bat : null, sensor_battery_at: u.izvor === 'sensor' ? svez : null,
      watch_battery: u.izvor === 'watch' ? u.bat : null, watch_battery_at: u.izvor === 'watch' ? svez : null,
    };
  });
}

function danTermini(p_date) {
  return rasporedZa(p_date).map(([vreme, tipK]) => {
    const tip = TIPOVI[tipK];
    const booked = session_bookings.filter((b) => b.date === p_date && b.start_time.slice(0, 5) === vreme && b.session_type_id === tip.id && b.status === 'booked').length;
    return {
      session_type_id: tip.id, type_name: tip.name, type_color: tip.color, start_time: vreme + ':00',
      duration_min: tip.duration_min, capacity: tip.capacity, booked_count: booked, is_canceled: false,
      template_id: session_slot_templates.find((s) => s.start_time.startsWith(vreme) && s.weekday === danUNedelji(p_date))?.id ?? null,
      waitlist_count: listaCekanja[`${p_date}|${vreme}|${tip.id}`] || 0, my_waitlist_id: null, my_booking_id: null,
    };
  });
}

const rpc = {
  get_active_athletes_for_trainer: () => aktivniVezbaci(),
  get_unread_chat_count: () => 3,
  trainer_has_active_fitlink_sub: () => true,
  get_my_referral_stats: () => [
    { referrer_id: poImenu('Mila Jović').id, referrer_name: 'Mila Jović', referred_count: 4, referred_active: 3 },
    { referrer_id: poImenu('Nikola Savić').id, referrer_name: 'Nikola Savić', referred_count: 3, referred_active: 3 },
    { referrer_id: poImenu('Teodora Lazić').id, referrer_name: 'Teodora Lazić', referred_count: 2, referred_active: 1 },
  ],
  get_day_slots: ({ p_date }) => danTermini(p_date),
  get_slot_waitlist: () => [
    { waitlist_id: uuid('ffff0000', 1), athlete_id: poImenu('Uroš Milošević').id, athlete_name: 'Uroš Milošević', queue_position: 1, created_at: pre(260 * MIN) },
    { waitlist_id: uuid('ffff0000', 2), athlete_id: poImenu('Vuk Stojanović').id, athlete_name: 'Vuk Stojanović', queue_position: 2, created_at: pre(200 * MIN) },
    { waitlist_id: uuid('ffff0000', 3), athlete_id: poImenu('Ivana Simić').id, athlete_name: 'Ivana Simić', queue_position: 3, created_at: pre(90 * MIN) },
  ],
};

// RPC koji menjaju stanje: nikad se ne izvrsavaju, vracaju neutralan uspeh.
const UPISNI_RPC = /^(send_|broadcast_|trainer_add|trainer_set|trainer_la_|mark_|confirm_|reject_|cancel_|book_|delete_|stop_|zaustavi|update_|create_|upsert_)/;

function odgovor({ method, url, headers, body }) {
  const p = url.pathname;
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (method === 'OPTIONS') return { status: 204 };

  if (p.startsWith('/auth/v1/')) {
    if (p === '/auth/v1/user') return { status: 200, body: korisnik() };
    if (p === '/auth/v1/token') return { status: 200, body: sesija() };
    if (p === '/auth/v1/logout') return { status: 204 };
    return { status: 200, body: {} };
  }
  if (p.startsWith('/functions/v1/')) return { status: 200, body: {}, napomena: 'funkcija (ignorisano)' };
  if (p.startsWith('/storage/v1/')) return { status: 404, body: { error: 'not_found' }, napomena: 'storage' };

  if (p.startsWith('/rest/v1/rpc/')) {
    const ime = p.slice('/rest/v1/rpc/'.length);
    let args = {};
    try { args = body ? JSON.parse(body) : Object.fromEntries(url.searchParams); } catch {}
    if (rpc[ime]) return { status: 200, body: rpc[ime](args) ?? null };
    if (UPISNI_RPC.test(ime)) return { status: 200, body: { success: true }, napomena: 'UPISNI RPC IGNORISAN' };
    return { status: 200, body: null, napomena: 'NEPOZNAT RPC' };
  }

  if (p.startsWith('/rest/v1/')) {
    const tabela = p.slice('/rest/v1/'.length);
    if (method !== 'GET' && method !== 'HEAD') {
      let t = null;
      try { t = body ? JSON.parse(body) : null; } catch {}
      const vrati = (h['prefer'] || '').includes('return=representation');
      return { status: vrati ? 201 : 204, body: vrati ? (Array.isArray(t) ? t : t ? [t] : []) : null, napomena: 'UPIS IGNORISAN' };
    }
    const poznata = tabela in tabele;
    const { redovi, ukupno, od } = baza.upit(tabela, url.searchParams, h);
    const prefer = h['prefer'] || '';
    const hdr = {};
    const opseg = redovi.length ? `${od}-${od + redovi.length - 1}` : '*';
    hdr['Content-Range'] = `${opseg}/${prefer.includes('count=') ? ukupno : '*'}`;
    const napomena = poznata ? undefined : 'NEPOZNATA TABELA';
    if ((h['accept'] || '').includes('vnd.pgrst.object')) {
      if (redovi.length !== 1) return { status: 406, headers: hdr, body: { code: 'PGRST116', details: `The result contains ${redovi.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, napomena };
      return { status: 200, headers: hdr, body: redovi[0], napomena };
    }
    return { status: 200, headers: hdr, body: redovi, napomena };
  }
  return { status: 404, body: {}, napomena: 'NEPOZNATO' };
}

// Pozivi koji se ponavljaju na tajmeru; ne racunaju se kad se ceka "mirno stanje".
const ANKETNI = ['get_active_athletes_for_trainer', 'get_unread_chat_count', 'trainer_has_active_fitlink_sub'];

module.exports = { odgovor, sesija, TRENER_ID, ANKETNI };
