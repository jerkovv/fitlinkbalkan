import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";

interface PhoneShellProps {
  /** Large title (Apple-style). Pass a string for default styling, or any node. */
  title: ReactNode;
  /** Optional small eyebrow above the title */
  eyebrow?: ReactNode;
  /** Back link target */
  back?: string;
  /** Right-side action (icon button etc.) */
  rightSlot?: ReactNode;
  /** Whether the page uses the bottom nav (adds bottom padding) */
  hasBottomNav?: boolean;
  children: ReactNode;
}

export const PhoneShell = ({
  title,
  eyebrow,
  back,
  rightSlot,
  hasBottomNav = false,
  children,
}: PhoneShellProps) => {
  // Desktop web (app.fitlink.rs u pregledaču, ne native app): isti sadržaj,
  // ali bez mobilnog 440px "telefona" nasred širokog ekrana i bez fiksnog
  // dvh scroll-kontejnera - TrainerWebShell već daje scroll okvir. Native i
  // uzak web (telefon otvara app.fitlink.rs) ne diramo, identično kao pre.
  const desktop = useDesktopWeb();

  return (
    <div
      className={cn(
        desktop
          ? "w-full max-w-[860px] mx-auto animate-fade-in"
          : `phone-shell ${hasBottomNav ? "pb-36" : "pb-10"} animate-fade-in`,
      )}
    >
      <div className={desktop ? undefined : "phone-shell-sticky"}>
        {/* Top bar - back + right action */}
        {(back || rightSlot) && (
          <div className={cn("flex items-center justify-between", desktop ? "pt-1" : "px-6 pt-1")}>
            {back ? (
              <Link
                to={back}
                aria-label="Nazad"
                className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 transition active:scale-95"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
              </Link>
            ) : <span />}
            {rightSlot}
          </div>
        )}

        {/* Large Apple-style title */}
        <header className={desktop ? "pt-2 pb-5" : "px-6 pt-2 pb-3"}>
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
              {eyebrow}
            </div>
          )}
          {typeof title === "string" ? (
            <h1 className="font-display text-[34px] leading-[1.1] font-bold tracking-tightest">
              {title}
            </h1>
          ) : (
            title
          )}
        </header>
      </div>

      <main className={desktop ? "space-y-4" : "px-6 pt-3 space-y-4"}>{children}</main>
    </div>
  );
};
