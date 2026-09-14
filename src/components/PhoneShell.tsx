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
  /**
   * Akcija same stranice (npr. "+ novi program"). Renderuje se i na mobilnom i
   * na desktopu - za razliku od rightSlot-a, koji desktop namerno gasi.
   */
  action?: ReactNode;
  /**
   * Traka gore desno koju desktop NE renderuje. Samo za ChatBell/
   * NotificationBell/UserMenu (vidi objasnjenje kod top bar-a nize).
   * Za dugmad stranice koristi `action`.
   */
  rightSlot?: ReactNode;
  /** Whether the page uses the bottom nav (adds bottom padding) */
  hasBottomNav?: boolean;
  /**
   * Sirina sadrzaja na racunaru. "narrow" (default) za stranice koje su jedna
   * kolona; "wide" za stranice koje na racunaru imaju mrezu ili dve kolone.
   */
  desktopWidth?: "narrow" | "wide";
  children: ReactNode;
}

export const PhoneShell = ({
  title,
  eyebrow,
  back,
  action,
  rightSlot,
  hasBottomNav = false,
  desktopWidth = "narrow",
  children,
}: PhoneShellProps) => {
  // fitlink.rs/dashboard (proksiran isti bundle, vidi useDesktopWeb): isti
  // sadržaj, ali bez mobilnog 440px "telefona" nasred širokog ekrana i bez
  // fiksnog dvh scroll-kontejnera - TrainerWebShell već daje scroll okvir.
  // app.fitlink.rs (native i web) ovo NIKAD ne pogađa, identično kao pre.
  const desktop = useDesktopWeb();

  if (desktop) {
    // Na racunaru je sidebar stalno tu, pa "nazad" na pocetnu (/trener) samo zauzima
    // mesto; nazad ostaje za podstranice (npr. program -> spisak programa).
    //
    // Zaglavlje je jedan red: naslov levo, dugme stranice desno u visini naslova.
    // Ranije je dugme visilo iznad naslova na suprotnom kraju ekrana.
    //
    // rightSlot se ovde NE renderuje: TrainerWebShell vec ima stalnu traku sa
    // ChatBell/NotificationBell/UserMenu, a te komponente drze sopstvene Realtime
    // kanale imenovane po korisniku (chat-bell:<uid>, notif:<uid>) - dve
    // istovremene instance se sudaraju na isti kanal i ruse stranicu.
    const showBack = !!back && back !== "/trener";
    return (
      <div
        className={cn(
          "w-full mx-auto animate-fade-in",
          desktopWidth === "wide" ? "max-w-[1120px]" : "max-w-[880px]",
        )}
      >
        <header className="flex items-end justify-between gap-6 pb-6">
          <div className="flex min-w-0 items-start gap-3">
            {showBack && (
              <Link
                to={back!}
                aria-label="Nazad"
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface transition hover:bg-surface-2 active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
              </Link>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {eyebrow}
                </div>
              )}
              {typeof title === "string" ? (
                <h1 className="font-display text-[30px] leading-[1.1] font-bold tracking-tightest truncate">
                  {title}
                </h1>
              ) : (
                title
              )}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>

        <main className="space-y-4">{children}</main>
      </div>
    );
  }

  return (
    <div className={`phone-shell ${hasBottomNav ? "pb-36" : "pb-10"} animate-fade-in`}>
      <div className="phone-shell-sticky">
        {(back || action || rightSlot) && (
          <div className="flex items-center justify-between px-6 pt-1">
            {back ? (
              <Link
                to={back}
                aria-label="Nazad"
                className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 transition active:scale-95"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
              </Link>
            ) : <span />}
            <div className="flex items-center gap-2">
              {action}
              {rightSlot}
            </div>
          </div>
        )}

        {/* Large Apple-style title */}
        <header className="px-6 pt-2 pb-3">
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

      <main className="px-6 pt-3 space-y-4">{children}</main>
    </div>
  );
};
