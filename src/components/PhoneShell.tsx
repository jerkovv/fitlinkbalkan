import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";

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
  return (
    <div className={`phone-shell ${hasBottomNav ? "pb-32" : "pb-10"} animate-fade-in`}>

      {/* Top bar - back + right action */}
      {(back || rightSlot) && (
        <div className="phone-shell-header flex items-center justify-between px-6">
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
      <header className={`${back || rightSlot ? "pt-3" : "phone-shell-header"} px-6 pb-5`}>
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

      <main className="px-6 space-y-5">{children}</main>
    </div>
  );
};
