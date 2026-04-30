import { Capacitor } from "@capacitor/core";
import {
  Activity,
  Watch,
  Heart,
  Footprints,
  Mountain,
  Flame,
  type LucideIcon,
} from "lucide-react";

export type Provider =
  | "apple_health"
  | "health_connect"
  | "fitbit"
  | "google_fit"
  | "garmin"
  | "strava"
  | "polar"
  | "whoop";

export type Platform = "ios" | "android" | "web";

export interface ProviderMeta {
  id: Provider;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind gradient klase za badge ikonice (semantic, ne hex) */
  accent: string;
  supportedPlatforms: Platform[];
  /** Da li koristi nativni SDK (HealthKit / Health Connect) */
  isNativeOnly: boolean;
}

export const PROVIDER_META: Record<Provider, ProviderMeta> = {
  apple_health: {
    id: "apple_health",
    name: "Apple Health",
    description: "Sat, telefon i sve aplikacije povezane sa Apple Health-om",
    icon: Heart,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["ios"],
    isNativeOnly: true,
  },
  health_connect: {
    id: "health_connect",
    name: "Health Connect",
    description: "Android centralni hub za zdravstvene podatke (Samsung, Xiaomi, Google)",
    icon: Activity,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["android"],
    isNativeOnly: true,
  },
  fitbit: {
    id: "fitbit",
    name: "Fitbit",
    description: "Sat i narukvica, san i puls",
    icon: Watch,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["ios", "android", "web"],
    isNativeOnly: false,
  },
  google_fit: {
    id: "google_fit",
    name: "Google Fit",
    description: "Aktivnost i koraci sa Android telefona",
    icon: Footprints,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["android", "web"],
    isNativeOnly: false,
  },
  garmin: {
    id: "garmin",
    name: "Garmin",
    description: "Garmin satovi i Garmin Connect",
    icon: Mountain,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["ios", "android", "web"],
    isNativeOnly: false,
  },
  strava: {
    id: "strava",
    name: "Strava",
    description: "Trening sesije, trčanje i biciklizam",
    icon: Flame,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["ios", "android", "web"],
    isNativeOnly: false,
  },
  polar: {
    id: "polar",
    name: "Polar",
    description: "Polar satovi i Polar Flow",
    icon: Watch,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["ios", "android", "web"],
    isNativeOnly: false,
  },
  whoop: {
    id: "whoop",
    name: "WHOOP",
    description: "Recovery, opterećenje i san",
    icon: Heart,
    accent: "from-primary to-primary-glow",
    supportedPlatforms: ["ios", "android", "web"],
    isNativeOnly: false,
  },
};

export const detectPlatform = (): Platform => {
  try {
    if (Capacitor.isNativePlatform()) {
      const p = Capacitor.getPlatform();
      if (p === "ios") return "ios";
      if (p === "android") return "android";
    }
  } catch {
    /* noop */
  }
  return "web";
};

export interface AvailableProvider {
  meta: ProviderMeta;
  comingSoon: boolean;
}

/**
 * Vraća listu provajdera za trenutno okruženje.
 * Apple Health i Health Connect su uvek prikazani na nativnoj
 * odgovarajućoj platformi, a na webu su "Uskoro".
 */
export const getAvailableProviders = (
  platform: Platform = detectPlatform(),
): AvailableProvider[] => {
  const isIOS = platform === "ios";
  const isAndroid = platform === "android";

  const list: AvailableProvider[] = [];

  // Apple Health
  list.push({
    meta: PROVIDER_META.apple_health,
    comingSoon: !isIOS,
  });

  // Health Connect
  list.push({
    meta: PROVIDER_META.health_connect,
    comingSoon: !isAndroid,
  });

  // OAuth provideri (rade i na webu i na native-u)
  (["fitbit", "google_fit", "strava", "garmin", "polar", "whoop"] as Provider[]).forEach((id) => {
    const meta = PROVIDER_META[id];
    if (meta.supportedPlatforms.includes(platform)) {
      list.push({ meta, comingSoon: false });
    } else {
      list.push({ meta, comingSoon: true });
    }
  });

  return list;
};

export const isNativeProvider = (p: Provider) =>
  p === "apple_health" || p === "health_connect";

export const dataTypeLabel: Record<string, { label: string; unit: string }> = {
  heart_rate_resting: { label: "Puls u mirovanju", unit: "bpm" },
  heart_rate_avg: { label: "Prosečan puls", unit: "bpm" },
  heart_rate_max: { label: "Maks puls", unit: "bpm" },
  hrv: { label: "HRV", unit: "ms" },
  steps: { label: "Koraci danas", unit: "" },
  calories_active: { label: "Aktivne kalorije", unit: "kcal" },
  calories_total: { label: "Ukupno kalorija", unit: "kcal" },
  sleep_minutes: { label: "San poslednje noći", unit: "h" },
  sleep_deep_minutes: { label: "Dubok san", unit: "h" },
  sleep_rem_minutes: { label: "REM san", unit: "h" },
  recovery_score: { label: "Oporavak", unit: "%" },
  readiness_score: { label: "Spremnost", unit: "%" },
  vo2_max: { label: "VO2 max", unit: "" },
  workout_duration: { label: "Trajanje treninga", unit: "min" },
  distance_meters: { label: "Distanca", unit: "m" },
  spo2: { label: "SpO2", unit: "%" },
  body_temp: { label: "Telesna temperatura", unit: "°C" },
};
