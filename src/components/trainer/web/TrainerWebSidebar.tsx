import { NavLink } from "react-router-dom";
import {
  Home, Radio, Users, CalendarClock, CalendarCog, BarChart3,
  Dumbbell, ClipboardList, Apple, Wallet, IdCard, MessageCircle, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandGlyph } from "@/components/BrandMark";

interface Item {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

// Sve trenerske rute iz App.tsx, grupisane onako kako trener stvarno misli o
// poslu - ne abecedno, ne redom kojim su rute deklarisane.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Pregled",
    items: [
      { to: "/trener", label: "Početna", icon: Home, end: true },
      { to: "/trener/uzivo", label: "Uživo", icon: Radio },
      { to: "/trener/vezbaci", label: "Vežbači", icon: Users },
    ],
  },
  {
    title: "Raspored",
    items: [
      { to: "/trener/kalendar", label: "Kalendar", icon: CalendarClock },
      { to: "/trener/termini", label: "Termini", icon: CalendarCog },
    ],
  },
  {
    title: "Sadržaj",
    items: [
      { to: "/trener/biblioteka", label: "Biblioteka vežbi", icon: Dumbbell },
      { to: "/trener/programi", label: "Programi treninga", icon: ClipboardList },
      { to: "/trener/ishrana", label: "Planovi ishrane", icon: Apple },
    ],
  },
  {
    title: "Poslovanje",
    items: [
      { to: "/trener/finansije", label: "Finansije", icon: BarChart3 },
      { to: "/trener/paketi", label: "Paketi članarina", icon: IdCard },
      { to: "/trener/uplate", label: "Uplate", icon: Wallet },
    ],
  },
  {
    title: "Komunikacija",
    items: [
      { to: "/trener/chat", label: "Poruke", icon: MessageCircle },
      { to: "/trener/notifikacije", label: "Obaveštenja", icon: Bell },
    ],
  },
];

export const TrainerWebSidebar = () => {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-hairline bg-surface/60 h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-6 h-16 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand shadow-brand">
          <BrandGlyph className="h-4 text-white" />
        </div>
        <span className="font-display font-bold text-[17px] tracking-tightest">FitLink</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition",
                        isActive
                          ? "bg-primary-soft text-primary-soft-foreground"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2.1} />
                    <span className="truncate">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default TrainerWebSidebar;
