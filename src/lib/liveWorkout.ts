// Deljeni prag "ziv puls" za trenerske prikaze (lista aktivnih + detalj jednog vezbaca),
// da se OBA ponasaju identicno: isti izvor (workout_live_state.current_hr + watch_last_hr_at,
// vraceno i kroz get_active_athletes_for_trainer) i isti prag svezine.
//
// Sat upisuje current_hr + watch_last_hr_at na svaki HealthKit HR uzorak i keep-alive ~5s.
// Ako watch_last_hr_at nije osvezen u poslednjih HR_FRESH_SECONDS, puls tretiramo kao
// zastareo (sat ne salje) -> ne prikazujemo zivu vrednost.
//
// Vrednost usaglasena sa watch-presence pragom na atleti strani (WATCH_FRESH_MS = 15000 u
// ActiveWorkout.tsx). LiveWorkoutView ranije nije imao eksplicitan prag za bpm.
export const HR_FRESH_SECONDS = 15;

/// true ako je puls "ziv" (sat ga je osvezio u poslednjih HR_FRESH_SECONDS). null/nevalidno -> false.
export function isHrLive(watchLastHrAt: string | null): boolean {
  if (!watchLastHrAt) return false;
  const ts = new Date(watchLastHrAt).getTime();
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) / 1000 <= HR_FRESH_SECONDS;
}
