import { useId } from "react";
import { cn } from "@/lib/utils";

// Zvanicni FitLink znak i horizontalni lockup (znak + "FITLINK" + TM), iz
// originalnih vektora. Jedno mesto za oba - da se putanje ne prepisuju po
// ekranima i da nigde ne zavrsi lazni "brend" (bucica, aktovka, munja).
//
// Znak je siri nego visi (828.12 x 517.2). Nikad mu ne zadaji I sirinu I visinu
// - podrazumevani preserveAspectRatio ga uklapa bez izduzivanja.

const GLYPH_VIEWBOX = "0 0 828.12 517.2";
const GLYPH_PATH =
  "M662.2.44l-142.2,81.41v76.48l117.57-67.31,99.98,174.63-255.11,146.05c-10.34,5.92-19.44,1.93-22.88-.06-3.43-1.99-11.42-7.91-11.42-19.82v-36.17s198.53-113.66,198.53-113.66l-32.97-57.6-165.59,94.8-.02-79.69.05-.03v-76.48l-.09.05c-.61-31.48-17.15-59.58-44.49-75.43-27.86-16.15-61.18-16.24-89.13-.24L0,227.37l165.92,289.83,150.04-85.9v-76.48l-125.42,71.8-99.98-174.63L347.39,104.97c10.34-5.92,19.44-1.93,22.87.06,3.43,1.99,11.42,7.91,11.42,19.82v36.17s-189.19,108.31-189.19,108.31l32.97,57.6,156.25-89.45.02,79.69-.23.13v76.48l.27-.15c.61,31.48,17.15,59.58,44.49,75.43,27.86,16.15,61.18,16.24,89.13.24l312.71-179.02L662.2.44Z";

// Sam znak. Boju nasledjuje (fill="currentColor"), pa radi i na svetloj i na tamnoj.
export const BrandGlyph = ({ className }: { className?: string }) => (
  <svg
    viewBox={GLYPH_VIEWBOX}
    className={cn("w-auto", className)}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={GLYPH_PATH} />
  </svg>
);

// Znak u zaobljenom kvadratu sa brend gradijentom - isto kao ikonica aplikacije.
// Za ekrane gde treba "logo aplikacije", ne dekorativna ikonica.
export const BrandBadge = ({
  className,
  glyphClassName,
}: {
  className?: string;
  glyphClassName?: string;
}) => (
  <div
    className={cn(
      "flex items-center justify-center rounded-2xl bg-gradient-brand shadow-brand",
      className,
    )}
  >
    <BrandGlyph className={cn("text-white", glyphClassName)} />
  </div>
);

// Horizontalni lockup: znak + "FITLINK" + TM.
// Podrazumevano nasledjuje boju (currentColor). Uz gradient=true koristi brend
// gradijent - id se pravi preko useId, da se dve instance na istom ekranu ne
// pregaze (isti id bi znacio da obe crtaju prvi gradijent).
export const BrandWordmark = ({
  className,
  gradient = false,
}: {
  className?: string;
  gradient?: boolean;
}) => {
  const gid = useId();
  return (
  <svg
    viewBox="0 0 1012.12 152.08"
    className={cn("w-auto", className)}
    fill={gradient ? `url(#${gid})` : "currentColor"}
    aria-hidden="true"
  >
    {gradient && (
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8935E9" />
          <stop offset="55%" stopColor="#603EEA" />
          <stop offset="100%" stopColor="#E949AE" />
        </linearGradient>
      </defs>
    )}
    <path d="M985.49,19.31h-4.73v-2.78h12.87v2.78h-4.73v11.98h-3.42v-11.98Z" />
    <path d="M1008.92,31.3l-.02-8.86-4.35,7.3h-1.54l-4.32-7.11v8.67h-3.21v-14.77h2.83l5.53,9.18,5.44-9.18h2.81l.04,14.77h-3.21Z" />
    <path d="M281.18,119.51V16.17h64.96v17.72h-45.47v24.95h41.93v17.72h-41.93v42.96h-19.49Z" />
    <path d="M389.55,119.51V16.17h19.49v103.34h-19.49Z" />
    <path d="M481.96,119.51V33.89h-30.12v-17.72h79.72v17.72h-30.12v85.63h-19.49Z" />
    <path d="M574.38,119.51V16.17h19.49v85.63h47.24v17.72h-66.73Z" />
    <path d="M683.92,119.51V16.17h19.49v103.34h-19.49Z" />
    <path d="M752.42,119.51V16.17h37.06l20.52,90.05h2.66V16.17h19.19v103.34h-37.06l-20.52-90.05h-2.66v90.05h-19.19Z" />
    <path d="M880.86,119.51V16.17h19.49v41.04h2.66l33.51-41.04h24.95l-43.11,50.93,44.58,52.41h-25.69l-34.25-41.93h-2.66v41.93h-19.49Z" />
    <path d="M194.88,0l-41.85,23.96v22.51l34.6-19.81,29.42,51.39-75.08,42.98c-3.04,1.74-5.72.57-6.73-.02-1.01-.59-3.36-2.33-3.36-5.83v-10.64s58.43-33.45,58.43-33.45l-9.7-16.95-48.73,27.9v-23.45s0,0,0,0v-22.51l-.03.02c-.18-9.26-5.05-17.54-13.09-22.2-8.2-4.75-18.01-4.78-26.23-.07L0,66.78l48.83,85.3,44.16-25.28v-22.51l-36.91,21.13-29.42-51.39L102.24,30.76c3.04-1.74,5.72-.57,6.73.02s3.36,2.33,3.36,5.83v10.64s-55.68,31.88-55.68,31.88l9.7,16.95,45.98-26.32v23.45s-.06.04-.06.04v22.51l.08-.04c.18,9.26,5.05,17.54,13.09,22.2,8.2,4.75,18.01,4.78,26.23.07l92.03-52.68L194.88,0Z" />
  </svg>
  );
};

