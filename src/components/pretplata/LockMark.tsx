import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePretplataLock } from "./usePretplataLock";

// Sitna katanca ispred labele na zakljucanom dugmetu. Sama proverava stanje, pa
// se pise samo <LockMark /> - bez ponavljanja `locked &&` na svakom mestu. Van
// trenerskog dela context je otkljucan, pa ne renderuje nista.
export const LockMark = ({ className }: { className?: string }) => {
  const { locked } = usePretplataLock();
  if (!locked) return null;
  return (
    <Lock
      className={cn("h-3.5 w-3.5 flex-none", className)}
      strokeWidth={2.5}
      aria-label="Zaključano"
    />
  );
};

export default LockMark;
