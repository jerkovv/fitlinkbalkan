// Deljeni prag "ziv puls" za trenerske prikaze (lista aktivnih + detalj jednog vezbaca),
// da se OBA ponasaju identicno: isti izvor (workout_live_state.current_hr + watch_last_hr_at,
// vraceno i kroz get_active_athletes_for_trainer) i isti prag svezine.
//
// Sat upisuje current_hr + watch_last_hr_at na svaki HealthKit HR uzorak i keep-alive ~5s.
// Ako watch_last_hr_at nije osvezen u poslednjih HR_FRESH_SECONDS, puls tretiramo kao
// zastareo (sat ne salje) -> ne prikazujemo zivu vrednost.
//
// Ovo je prag za SVEZINU HR BROJA. Status KONEKCIJE (povezan/nije) ide preko WATCH_GRACE_MS (40s)
// + isFreshWithinGrace, isto svuda (trener lista/detalj + atleta ActiveWorkout.tsx).
export const HR_FRESH_SECONDS = 15;

/// true ako je puls "ziv" (sat ga je osvezio u poslednjih HR_FRESH_SECONDS). null/nevalidno -> false.
/// Sluzi za SVEZINU HR BROJA (npr. rang intenziteta), NE za status konekcije.
export function isHrLive(watchLastHrAt: string | null): boolean {
  if (!watchLastHrAt) return false;
  const ts = new Date(watchLastHrAt).getTime();
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) / 1000 <= HR_FRESH_SECONDS;
}

// ---- Status KONEKCIJE sata ("jedan mozak") ----------------------------------------------------
// Jedan prag + jedna grace/debounce logika za "sat povezan", koriscena SVUDA identicno (trener
// lista + detalj + atleta). Grace je namerno siri od HR_FRESH_SECONDS (svezina broja): sat salje
// ~5s (keep-alive) ali HK zna da cuti 15-30s u mirovanju, pa uzak prag treperi. Sirok grace =
// ugradjeni debounce: jedan propusten uzorak NIKAD ne flipuje; "nije povezan" tek posle ODRZANE
// zastarelosti (>= WATCH_GRACE_MS). Oporavak je instant (cim stigne svez signal).
export const WATCH_GRACE_MS = 40000;

// JEZGRO: povezan ako je poslednji SVEZ signal (lokalni epoch ms) unutar grace prozora.
// Ulaz je vec u lokalnom vremenu (Date.now()) - bez parsiranja serverskog timestampa, pa je
// bezbedno i na atleta strani (WKWebView clock skew bi na parsiranju serverskog vremena dao
// lazni "izgubljen"). Monoton izvor + sirok prozor => bez treptanja, bez potrebe za state-om.
export function isFreshWithinGrace(
  lastFreshAtMs: number | null,
  nowMs: number,
  graceMs: number = WATCH_GRACE_MS,
): boolean {
  return lastFreshAtMs != null && lastFreshAtMs > 0 && nowMs - lastFreshAtMs <= graceMs;
}

// Serverski timestamp (ISO) kroz isto jezgro: parsiraj pa proveri grace.
function isServerSignalFresh(iso: string | null, nowMs: number): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return isFreshWithinGrace(ts, nowMs);
}

// Trenerski prikazi (browser, ispravan sat): parsiraju serverski watch_last_hr_at i provere grace.
// Isto jezgro (isFreshWithinGrace) + isti prag (WATCH_GRACE_MS) kao atleta strana.
export function isWatchConnected(watchLastHrAt: string | null, nowMs: number = Date.now()): boolean {
  return isServerSignalFresh(watchLastHrAt, nowMs);
}

// ---- "Puls stize" bez obzira odakle ----------------------------------------------------------
// workout_live_state.hr_last_at pisu OBA izvora (sat kroz watch_update_workout_hr, telefon/BLE
// traka kroz athlete_heartbeat), dok watch_last_hr_at ostaje iskljucivo satov - da indikator
// sata ne bi lagao kad vezbac ima samo traku. Prikaz pulsa gleda ovo, status sata i dalje
// isWatchConnected.
export type HrSource = "watch" | "sensor" | "phone" | null;

export function isHrSignalLive(
  hrLastAt: string | null,
  watchLastHrAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  return isServerSignalFresh(hrLastAt, nowMs) || isWatchConnected(watchLastHrAt, nowMs);
}

/** Kratka oznaka izvora za trenerski prikaz. Sat se ne ispisuje - on je podrazumevan. */
export function hrSourceLabel(source: HrSource): string | null {
  if (source === "sensor") return "traka";
  if (source === "phone") return "telefon";
  return null;
}
