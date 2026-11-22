import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePretplataLock } from "./usePretplataLock";

// Mala oznaka ispred labele na zakljucanom dugmetu. Boju uzima od dugmeta, pa stoji
// isto na ljubicastom i na tamnom. Sama proverava stanje, pa se pise samo <LockMark />.
// Van trenerskog dela context je otkljucan, pa ne renderuje nista.
export const LockMark = ({ className }: { className?: string }) => {
  const { locked } = usePretplataLock();
  if (!locked) return null;
  return (
    <span className={cn("relative inline-flex h-[18px] w-[18px] flex-none items-center justify-center", className)}>
      <span aria-hidden className="absolute inset-0 rounded-full bg-current opacity-[0.16]" />
      {/* Button svim svg-ovima daje size-4, a katanac mora da ostane mali u svom krugu. */}
      <Lock className="relative !h-2.5 !w-2.5" strokeWidth={2.8} aria-label="Zaključano" />
    </span>
  );
};
