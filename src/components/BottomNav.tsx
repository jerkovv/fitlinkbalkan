import { NavLink } from "react-router-dom";
import {
  Home, Users, CalendarClock, BarChart3,
  Dumbbell, TrendingUp, IdCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  role: "trainer" | "athlete";
}

const trainerLinks = [
  { to: "/trener", icon: Home, label: "Početna", end: true },
  { to: "/trener/vezbaci", icon: Users, label: "Vežbači" },
  { to: "/trener/kalendar", icon: CalendarClock, label: "Kalendar" },
  { to: "/trener/finansije", icon: BarChart3, label: "Finansije" },
];

const athleteLinks = [
  { to: "/vezbac", icon: Home, label: "Početna", end: true },
  { to: "/vezbac/trening", icon: Dumbbell, label: "Trening" },
  { to: "/vezbac/napredak", icon: TrendingUp, label: "Napredak" },
  { to: "/vezbac/clanarina", icon: IdCard, label: "Članarina" },
];

export const BottomNav = ({ role }: BottomNavProps) => {
  const links = role === "trainer" ? trainerLinks : athleteLinks;

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-30 pb-[env(safe-area-inset-bottom)]"
      aria-label="Glavna navigacija"
    >
      {/* Subtle gradient fade so content fades into nav, not abrupt */}
      <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent" />

      <div className="mx-3 mb-3 rounded-3xl bg-surface/90 backdrop-blur-xl border border-hairline shadow-large">
        <ul className="grid grid-cols-4 px-2 py-2">
          {links.map(({ to, icon: Icon, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "group flex flex-col items-center gap-1 py-2 rounded-2xl text-[10.5px] font-semibold transition",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-xl transition",
                        isActive
                          ? "bg-gradient-brand text-white shadow-brand"
                          : "bg-transparent group-hover:bg-surface-2",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 2} />
                    </span>
                    <span className="leading-none">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};
