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

export const sessionColorClasses = (color: string) => {
  const c = (sessionColors.find((s) => s.value === color)?.value ?? "violet") as SessionColor;
  return {
    bg: `bg-[hsl(var(--session-${c}-bg))]`,
    fg: `text-[hsl(var(--session-${c}-fg))]`,
    dot: `bg-[hsl(var(--session-${c}-fg))]`,
    border: `border-[hsl(var(--session-${c}-fg)/0.2)]`,
  };
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
