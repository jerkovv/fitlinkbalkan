import type { HrSource } from "@/lib/liveWorkout";

// Sat koji emituje puls (Huawei, Amazfit, Garmin i slicni) stize istim BLE putem kao
// pojas za grudi, pa se razlikuje samo po nazivu koji uredjaj javi u skeniranju.
const SAT_RE = /watch|band|huawei|amazfit|galaxy|forerunner|venu|vivoactive|fenix|instinct|\bgt\s?\d/i;

export const jeSatUredjaj = (naziv?: string | null): boolean => !!naziv && SAT_RE.test(naziv);

/**
 * Uredno ime uredjaja iz naziva koji javi Bluetooth ("HUAWEI WATCH GT 5-ABC" ->
 * "Huawei Watch"). Pun naziv je duzi od reda i nista vise ne kaze.
 */
const MARKE: { re: RegExp; naziv: string }[] = [
  { re: /huawei|watch gt|watch fit/i, naziv: "Huawei Watch" },
  { re: /amazfit|zepp/i, naziv: "Amazfit" },
  { re: /garmin|forerunner|venu|vivoactive|fenix|instinct/i, naziv: "Garmin" },
  { re: /polar/i, naziv: "Polar" },
  { re: /coospo/i, naziv: "Coospo" },
  { re: /wahoo|tickr/i, naziv: "Wahoo" },
  { re: /magene/i, naziv: "Magene" },
  { re: /galaxy|samsung/i, naziv: "Galaxy Watch" },
  { re: /xiaomi|mi band|smart band/i, naziv: "Xiaomi" },
];

export const nazivUredjaja = (sensorName?: string | null): string => {
  const naziv = (sensorName ?? "").trim();
  if (!naziv) return "Senzor pulsa";
  const marka = MARKE.find((m) => m.re.test(naziv));
  if (marka) return marka.naziv;
  return jeSatUredjaj(naziv) ? "Sat" : "Senzor pulsa";
};

/** Pun naziv izvora pulsa za trenerski prikaz ("Huawei Watch", "Apple Watch"). */
export const nazivIzvora = (source: HrSource, sensorName?: string | null): string | null => {
  if (source === "watch") return "Apple Watch";
  if (source === "phone") return "Telefon";
  if (source !== "sensor") return null;
  return nazivUredjaja(sensorName);
};

/** Kratka oznaka za pilulu u spiskovima: HUAWEI, GARMIN, SAT, TELEFON. */
export const kratkaOznakaIzvora = (source: HrSource, sensorName?: string | null): string | null => {
  if (source === "watch") return "SAT";
  if (source === "phone") return "TELEFON";
  if (source !== "sensor") return null;
  return nazivUredjaja(sensorName).split(" ")[0].toUpperCase();
};
