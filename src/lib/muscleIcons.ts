// Ikonice misicnih grupa (48x48 kruzni SVG, fiksne boje) za trenerov flow dodavanja vezbi.
// Vite bundluje SVG kao asset URL (string). Kljucevi = exercises.primary_muscle (enum, srpski).
import grudi from "@/assets/muscle-chips/ic_chip_chest_b.svg";
import ledja from "@/assets/muscle-chips/ic_chip_back_b.svg";
import ramena from "@/assets/muscle-chips/ic_chip_shoulders_b.svg";
import biceps from "@/assets/muscle-chips/chip_biceps_b.svg";
import triceps from "@/assets/muscle-chips/chip_triceps_b.svg";
import podlaktice from "@/assets/muscle-chips/ic_chip_forearms_b.svg";
import kvadriceps from "@/assets/muscle-chips/chip_quadriceps_b.svg";
import zadnja_loza from "@/assets/muscle-chips/chip_hamstrings_b.svg";
import glutei from "@/assets/muscle-chips/ic_chip_hips_b.svg";
import listovi from "@/assets/muscle-chips/ic_chip_calves_b.svg";
import core from "@/assets/muscle-chips/chip_abs_b.svg";
import kardio from "@/assets/muscle-chips/chip_cardio.svg";

export const MUSCLE_ICON: Record<string, string> = {
  grudi, ledja, ramena, biceps, triceps, podlaktice,
  kvadriceps, zadnja_loza, glutei, listovi, core, kardio,
};

export function muscleIcon(primaryMuscle?: string | null): string | null {
  if (!primaryMuscle) return null;
  return MUSCLE_ICON[primaryMuscle] ?? null;
}
