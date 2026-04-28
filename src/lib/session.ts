// Helper za session type boje (booking sistem)
// Koristi semantic CSS varijable iz index.css

export type SessionColor = "violet" | "indigo" | "emerald" | "amber" | "rose" | "sky";

export const sessionColors: { value: SessionColor; label: string }[] = [
  { value: "violet", label: "Ljubičasta" },
  { value: "indigo", label: "Indigo" },
  { value: "emerald", label: "Zelena" },
  { value: "amber", label: "Narandžasta" },
  { value: "rose", label: "Roze" },
  { value: "sky", label: "Plava" },
];

// VAŽNO: Tailwind ne može da generiše dinamičke klase iz interpolacije.
// Sve klase moraju biti kompletni literali da bi ih scanner pokupio.
const SESSION_COLOR_MAP: Record<SessionColor, { bg: string; fg: string; dot: string; border: string }> = {
  violet: {
    bg: "bg-[hsl(var(--session-violet-bg))]",
    fg: "text-[hsl(var(--session-violet-fg))]",
    dot: "bg-[hsl(var(--session-violet-fg))]",
    border: "border-[hsl(var(--session-violet-fg)/0.2)]",
  },
  indigo: {
    bg: "bg-[hsl(var(--session-indigo-bg))]",
    fg: "text-[hsl(var(--session-indigo-fg))]",
    dot: "bg-[hsl(var(--session-indigo-fg))]",
    border: "border-[hsl(var(--session-indigo-fg)/0.2)]",
  },
  emerald: {
    bg: "bg-[hsl(var(--session-emerald-bg))]",
    fg: "text-[hsl(var(--session-emerald-fg))]",
    dot: "bg-[hsl(var(--session-emerald-fg))]",
    border: "border-[hsl(var(--session-emerald-fg)/0.2)]",
  },
  amber: {
    bg: "bg-[hsl(var(--session-amber-bg))]",
    fg: "text-[hsl(var(--session-amber-fg))]",
    dot: "bg-[hsl(var(--session-amber-fg))]",
    border: "border-[hsl(var(--session-amber-fg)/0.2)]",
  },
  rose: {
    bg: "bg-[hsl(var(--session-rose-bg))]",
    fg: "text-[hsl(var(--session-rose-fg))]",
    dot: "bg-[hsl(var(--session-rose-fg))]",
    border: "border-[hsl(var(--session-rose-fg)/0.2)]",
  },
  sky: {
    bg: "bg-[hsl(var(--session-sky-bg))]",
    fg: "text-[hsl(var(--session-sky-fg))]",
    dot: "bg-[hsl(var(--session-sky-fg))]",
    border: "border-[hsl(var(--session-sky-fg)/0.2)]",
  },
};

export const sessionColorClasses = (color: string) => {
  const c = (sessionColors.find((s) => s.value === color)?.value ?? "violet") as SessionColor;
  return SESSION_COLOR_MAP[c];
};

export const weekdayLabelsShort = ["PON", "UTO", "SRE", "ČET", "PET", "SUB", "NED"];
export const weekdayLabelsLong = [
  "Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja",
];

// Date(): getDay() vraca 0=Sun..6=Sat. Mi želimo 0=Pon..6=Ned.
export const dateToWeekday = (d: Date) => (d.getDay() + 6) % 7;

export const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const formatTime = (t: string) => t.slice(0, 5); // "07:00:00" → "07:00"

export const addMinutesToTime = (t: string, mins: number) => {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
};
