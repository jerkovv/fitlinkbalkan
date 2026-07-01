// Sesije treninga u koje je vezbac vec usao (auto ili rucnim klikom "Pocni trening").
// Home (WorkoutHome) ih NE otvara ponovo automatski - da povratak na home posle
// napustanja ili greske ne baca korisnika nazad u istu sesiju (bez "trap"-a) i da se
// telefon-pokrenut trening ne otvori duplo. Modul-nivo skup traje koliko i app sesija
// (session_log_id je jedinstven UUID; ciscenje na reload aplikacije je u redu).
const enteredWorkoutSessions = new Set<string>();

export function markWorkoutEntered(sessionId: string | null | undefined): void {
  if (sessionId) enteredWorkoutSessions.add(sessionId);
}

export function hasEnteredWorkout(sessionId: string | null | undefined): boolean {
  return !!sessionId && enteredWorkoutSessions.has(sessionId);
}
