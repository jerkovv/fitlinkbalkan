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

// Postgres timestamptz preko realtime-a zna da stigne kao "2026-06-22 13:05:57.12+00"
// (razmak umesto 'T', offset "+00" umesto "+00:00"). Safari/WKWebView Date.parse je
// strog i to ume da vrati NaN -> normalizujemo u ISO pre parsiranja. Vraca server
// epoch ms (NE klijent - pozivalac oduzme clockOffset), ili null ako ne uspe.
export function pgTsToMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(" ", "T");
  const off = s.match(/([+-])(\d{2})(?::?(\d{2}))?$/);   // "+00" / "+0000" / "+02:00"
  if (off) s = s.slice(0, off.index) + `${off[1]}${off[2]}:${off[3] ?? "00"}`;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}
