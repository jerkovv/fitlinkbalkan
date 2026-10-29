import { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { TrainerWebSidebar } from "./TrainerWebSidebar";
import { usePonoc } from "./usePonoc";
import { ChatBell } from "@/components/ChatBell";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";

// Desktop hromiranje oko istih ruta/stranica koje koristi i app - ništa se ne
// duplira. Montira se SAMO kad je isDashboardHost() (fitlink.rs/dashboard,
// vidi useDesktopWeb) - app.fitlink.rs ovo nikad ne renderuje.
//
// html/body/#root su GLOBALNO zakljucani (height:100%; overflow:hidden) jer se
// mobilni .phone-shell oslanja da je on JEDINI scroll kontejner (WKWebView:
// sticky ne pinuje ako scroll-uje dokument). Desktop PhoneShell grana ne
// dobija tu klasu, pa ova desna kolona MORA sama da preuzme skrolovanje -
// bez ovoga nema nista sto skroluje i stranica se secne na visinu ekrana.
const DANI = ["Nedelja", "Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota"];
const MESECI = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar", "novembar", "decembar"];

const danas = () => {
  const d = new Date();
  return `${DANI[d.getDay()]}, ${d.getDate()}. ${MESECI[d.getMonth()]}`;
};

export const TrainerWebShell = ({ children }: { children: ReactNode }) => {
  usePonoc();
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TrainerWebSidebar />
      <div className="relative flex-1 min-w-0 h-screen overflow-y-auto">
        {/* Sjaj u vrhu kao na mockupu; skroluje zajedno sa sadrzajem. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
          style={{
            background:
              "radial-gradient(520px 300px at 22% -60px, hsl(267 81% 58% / 0.34), transparent 72%), radial-gradient(380px 260px at 100% -40px, hsl(322 72% 59% / 0.18), transparent 70%)",
          }}
        />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 h-16 px-8 border-b border-hairline bg-background/50 backdrop-blur-xl">
          <span className="inline-flex h-[38px] items-center gap-2 rounded-full border border-hairline bg-surface px-4 text-[13px] font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4" strokeWidth={1.9} />
            {danas()}
          </span>
          <div className="flex items-center gap-2.5">
            <ChatBell />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="relative px-8 py-7">{children}</main>
      </div>
    </div>
  );
};

export default TrainerWebShell;
