// Znakovi na kartici kao vektor u polju 24 x 24. Oblici su iz lucide (ISC, vec u projektu),
// a da lice na pune SF Symbols sa telefona, glavni deo znaka se puni bojom.
// puno: ispunjeno, linija: potez iste boje, rez: potez u boji podloge (kazaljke, kvacica).

type Znak = { puno?: string[]; linija?: string[]; rez?: string[] };

const krug = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

const ZNAKOVI = {
  trophy: {
    puno: [
      "M18 2H6v7a6 6 0 0 0 12 0V2Z",
      "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22h10c0-1.76-.85-3.25-2.03-3.79-.5-.23-.97-.66-.97-1.21v-2.34Z",
    ],
    linija: ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16"],
  },
  check: { puno: [krug(12, 12, 10)], rez: ["m8.5 12 2.5 2.5 4.5-5"] },
  calendar: {
    puno: ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"],
    linija: ["M8 2v4", "M16 2v4"],
    rez: ["M3 10h18"],
  },
  chart: { puno: ["M3 13h4.5v8H3Z", "M9.75 8h4.5v13h-4.5Z", "M16.5 3H21v18h-4.5Z"] },
  arrows: { linija: ["M8 3 4 7l4 4", "M4 7h16", "m16 21 4-4-4-4", "M20 17H4"] },
  arrowUp: { linija: ["M7 7h10v10", "M7 17 17 7"] },
  clock: { puno: [krug(12, 12, 10)], rez: ["M12 6v6l4 2"] },
  flame: {
    puno: [
      "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
    ],
  },
  heart: {
    puno: [
      "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
    ],
  },
  layers: {
    puno: ["m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"],
    linija: ["m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65", "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"],
  },
  activity: {
    linija: ["M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"],
  },
  send: {
    puno: ["M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"],
    rez: ["m21.854 2.147-10.94 10.939"],
  },
  users: {
    puno: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2Z", krug(9, 7, 4)],
    linija: ["M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  },
  badge: {
    puno: [
      "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
    ],
    rez: ["m9 12 2 2 4-4"],
  },
  ruler: {
    puno: ["M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"],
    rez: ["m14.5 12.5 2-2", "m11.5 9.5 2-2", "m8.5 6.5 2-2", "m17.5 15.5 2-2"],
  },
  drop: { puno: ["M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"] },
  dumbbell: {
    puno: [
      "M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z",
      "M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z",
    ],
    linija: ["M14.4 14.4 9.6 9.6", "m21.5 21.5-1.4-1.4", "M3.9 3.9 2.5 2.5"],
  },
  weight: {
    puno: ["M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z"],
    linija: [krug(12, 5, 3)],
  },
  sigma: {
    linija: ["M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"],
  },
} satisfies Record<string, Znak>;

export type NazivZnaka = keyof typeof ZNAKOVI;

const kes = new Map<string, Path2D>();
const put = (d: string) => {
  let p = kes.get(d);
  if (!p) {
    p = new Path2D(d);
    kes.set(d, p);
  }
  return p;
};

export const crtajZnak = (
  c: CanvasRenderingContext2D,
  naziv: NazivZnaka,
  x: number,
  y: number,
  vel: number,
  boja: string,
  rez: string,
) => {
  const z: Znak = ZNAKOVI[naziv];
  c.save();
  c.translate(x, y);
  c.scale(vel / 24, vel / 24);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = 2.4;
  c.fillStyle = boja;
  c.strokeStyle = boja;
  for (const d of z.puno ?? []) {
    const p = put(d);
    c.fill(p);
    c.stroke(p);
  }
  for (const d of z.linija ?? []) c.stroke(put(d));
  c.strokeStyle = rez;
  for (const d of z.rez ?? []) c.stroke(put(d));
  c.restore();
};
