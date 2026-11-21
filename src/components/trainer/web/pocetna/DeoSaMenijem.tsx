import type { ReactNode } from "react";
import { EyeOff, LayoutGrid, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Racunarski par dugog drzanja sa telefona: dugme na uglu dela, vidi se na prelaz
// misem i na fokus tastature. Stoji preko ivice da ne pokrije dugmad u zaglavlju dela.
export function DeoSaMenijem({
  naziv,
  onSakrij,
  onUredi,
  className,
  children,
}: {
  naziv: string;
  onSakrij: () => void;
  onUredi: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("group/deo relative min-w-0", className)}>
      {children}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Opcije: ${naziv}`}
            className="absolute -right-2 -top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-hairline bg-surface-2 text-muted-foreground opacity-0 shadow-md transition hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover/deo:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[190px]">
          <DropdownMenuItem onSelect={onSakrij} className="gap-2">
            <EyeOff className="h-4 w-4" />
            Sakrij sa početne
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onUredi} className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Uredi početnu
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
