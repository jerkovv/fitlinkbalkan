// Shared mock data for FitLink — used by all screens until Supabase is wired up.

export type AthleteStatus = "active" | "expiring" | "expired";

export interface Athlete {
  id: string;
  initials: string;
  name: string;
  program: string;
  status: AthleteStatus;
  expiresLabel: string;
  prs: { lift: string; weight: number; progress: number }[];
}

export interface SessionItem {
  id: string;
  time: string;
  athleteName: string;
  workout: string;
  status: "active" | "confirmed" | "pending";
}

export const trainerProfile = {
  name: "Marko",
  fullName: "Marko Jovanović",
  studio: "Iron Lab Studio",
  city: "Beograd",
  inviteCode: "MARKO-2025",
};

export const athleteProfile = {
  name: "Nikola",
  fullName: "Nikola Petrović",
  trainerName: "Marko Jovanović",
  planName: "Mesečna",
  planPrice: 5000,
  daysLeft: 14,
  daysTotal: 30,
  expiresOn: "30. April 2025",
};

export const athletes: Athlete[] = [
  {
    id: "np",
    initials: "NP",
    name: "Nikola Petrović",
    program: "PPL Program",
    status: "active",
    expiresLabel: "ističe 30. Apr",
    prs: [
      { lift: "Bench Press", weight: 95, progress: 75 },
      { lift: "Squat", weight: 120, progress: 87 },
      { lift: "Deadlift", weight: 145, progress: 92 },
    ],
  },
  {
    id: "am",
    initials: "AM",
    name: "Ana Marković",
    program: "Kardio + Core",
    status: "expiring",
    expiresLabel: "ističe 20. Apr",
    prs: [
      { lift: "Bench Press", weight: 45, progress: 60 },
      { lift: "Squat", weight: 70, progress: 70 },
      { lift: "Deadlift", weight: 90, progress: 65 },
    ],
  },
  {
    id: "js",
    initials: "JS",
    name: "Jovan Stanić",
    program: "Hipertrofija A",
    status: "expired",
    expiresLabel: "istekla 10. Apr",
    prs: [
      { lift: "Bench Press", weight: 110, progress: 80 },
      { lift: "Squat", weight: 140, progress: 88 },
      { lift: "Deadlift", weight: 170, progress: 95 },
    ],
  },
  {
    id: "mp",
    initials: "MP",
    name: "Mila Pavlović",
    program: "Početni paket",
    status: "active",
    expiresLabel: "ističe 02. Maj",
    prs: [
      { lift: "Bench Press", weight: 30, progress: 40 },
      { lift: "Squat", weight: 50, progress: 50 },
      { lift: "Deadlift", weight: 65, progress: 55 },
    ],
  },
];

export const todaySessions: SessionItem[] = [
  { id: "s1", time: "10:00", athleteName: "Nikola P.", workout: "PPL Snaga, Dan 3", status: "active" },
  { id: "s2", time: "13:00", athleteName: "Ana M.", workout: "Kardio + Core", status: "confirmed" },
  { id: "s3", time: "16:30", athleteName: "Jovan S.", workout: "Hipertrofija A", status: "pending" },
];

export const recentPayments = [
  { id: "p1", name: "Nikola P.", amount: 5000, when: "danas", method: "keš" },
  { id: "p2", name: "Ana M.", amount: 5000, when: "juče", method: "uplatnica" },
  { id: "p3", name: "Mila P.", amount: 4000, when: "pre 3 dana", method: "QR" },
];

export const monthlyRevenueBars = [50, 65, 55, 80, 100];

export const programDays = [
  {
    title: "DAN 1 — PUSH 💪",
    exercises: [
      { name: "Bench Press", sets: 4, reps: "8–10", rest: "90s" },
      { name: "OHP", sets: 3, reps: "10", rest: "60s" },
      { name: "Tricep PD", sets: 3, reps: "12", rest: "45s" },
    ],
  },
];

export const athleteWorkout = {
  title: "Dan 3 — Legs 🦵",
  progressLabel: "Dan 3 od 6",
  progressPct: 42,
  current: "Squat 🏋️",
  exerciseProgress: "2 / 4 vežbe",
  sets: [
    { kg: 100, reps: 8, rpe: 7, done: true },
    { kg: 105, reps: 7, rpe: 8, done: true },
    { kg: null as number | null, reps: null as number | null, rpe: null as number | null, done: false },
  ],
  restSeconds: 83,
};

export const calendarDays = [
  { d: 1 }, { d: 2, type: "busy" as const }, { d: 3 }, { d: 4, type: "busy" as const },
  { d: 5 }, { d: 6 }, { d: 7 },
  { d: 8, type: "busy" as const }, { d: 9 }, { d: 10, type: "busy" as const },
  { d: 11 }, { d: 12, type: "busy" as const }, { d: 13 }, { d: 14 },
  { d: 15 }, { d: 16, type: "today" as const }, { d: 17, type: "free" as const },
  { d: 18, type: "free" as const }, { d: 19, type: "busy" as const }, { d: 20 }, { d: 21 },
  { d: 22, type: "busy" as const }, { d: 23, type: "free" as const }, { d: 24, type: "busy" as const },
  { d: 25 }, { d: 26, type: "free" as const }, { d: 27 }, { d: 28 },
];

export const bookingSlots = [
  { time: "10:00", state: "free" as const },
  { time: "12:00", state: "busy" as const },
  { time: "17:00", state: "free" as const },
  { time: "18:30", state: "free" as const },
  { time: "20:00", state: "busy" as const },
];
