// Deljeni format proteklog vremena/trajanja iz CISTIH SEKUNDI.
// Prelama u sate kad je >= 60min, da nigde ne stoji npr "64:10" ili "120:39".
// 64:10 -> "1:04:10", 120:39 -> "2:00:39", 25:25 -> "25:25", 0 -> "0:00".
// Napomena: za stat "Xh Ymin" koristi se formatDuration; ovo je za sat-stil MM:SS / H:MM:SS.
export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
