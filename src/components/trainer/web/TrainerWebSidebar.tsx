import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Radio, Users, CalendarClock, CalendarCog, BarChart3,
  Dumbbell, ClipboardList, Apple, Wallet, IdCard, MessageCircle, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandGlyph } from "@/components/BrandMark";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

type Znacka = "uzivo" | "uplate" | "poruke";

interface Item {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  znacka?: Znacka;
  /** Putanje bez svoje stavke koje isticu ovu (npr. ceo trening pod Uzivo). */
  takodje?: RegExp;
}

// Sve trenerske rute iz App.tsx, grupisane onako kako trener stvarno misli o
// poslu - ne abecedno, ne redom kojim su rute deklarisane.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Pregled",
    items: [
      { to: "/trener", label: "Početna", icon: Home, end: true },
      { to: "/trener/uzivo", label: "Uživo", icon: Radio, znacka: "uzivo", takodje: /^\/trener\/vezbac\/[^/]+\/live/ },
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
      { to: "/trener/uplate", label: "Uplate", icon: Wallet, znacka: "uplate" },
    ],
  },
  {
    title: "Komunikacija",
    items: [
      { to: "/trener/chat", label: "Poruke", icon: MessageCircle, znacka: "poruke" },
      { to: "/trener/notifikacije", label: "Obaveštenja", icon: Bell, takodje: /^\/trener\/podesavanja-obavestenja/ },
    ],
  },
];

// Brojevi u meniju: ko trenira, zahtevi za uplatu, neprocitane poruke. Obicno
// osvezavanje na 30 s, bez Realtime kanala: stranice i zvonca vec drze svoje
// kanale imenovane po korisniku, a dva ista kanala se sudaraju.
function useBrojevi(): Record<Znacka, number> {
  const { user } = useAuth();
  const [b, setB] = useState<Record<Znacka, number>>({ uzivo: 0, uplate: 0, poruke: 0 });
  useEffect(() => {
    if (!user) return;
    let ziv = true;
    const povuci = async () => {
      const [uz, up, po] = await Promise.all([
        supabase.rpc("get_active_athletes_for_trainer" as any),
        supabase
          .from("membership_purchases")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id)
          .eq("status", "pending"),
        supabase.rpc("get_unread_chat_count" as any),
      ]);
      if (!ziv) return;
      setB({
        uzivo: Array.isArray(uz.data) ? uz.data.length : 0,
        uplate: up.count ?? 0,
        poruke: typeof po.data === "number" ? po.data : 0,
      });
    };
    povuci();
    const id = setInterval(povuci, 30000);
    return () => {
      ziv = false;
      clearInterval(id);
    };
  }, [user]);
  return b;
}

export const TrainerWebSidebar = () => {
  const brojevi = useBrojevi();
  const { pathname } = useLocation();
  return (
    <aside className="relative hidden lg:flex w-[236px] shrink-0 flex-col overflow-hidden border-r border-hairline bg-surface/55 h-screen sticky top-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[260px]"
        style={{ background: "radial-gradient(220px 200px at 10% -20px, hsl(267 81% 58% / 0.4), transparent 72%)" }}
      />
      <div className="relative flex items-center gap-2.5 px-5 h-16 shrink-0">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-gradient-brand shadow-brand">
          <BrandGlyph className="h-3 text-white" />
        </div>
        <span className="font-display font-bold text-[17px] tracking-tight">FitLink</span>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3.5 pb-6 pt-1 space-y-5">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-2.5 mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end, znacka, takodje }) => {
                const n = znacka ? brojevi[znacka] : 0;
                // Podstrane bez svoje stavke (ceo trening, podesavanja obavestenja) isticu roditelja.
                const iPodstrana = !!takodje && takodje.test(pathname);
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        cn(
                          "flex h-[38px] items-center gap-[11px] rounded-xl px-2.5 text-[13.5px] font-semibold transition",
                          isActive || iPodstrana
                            ? "bg-gradient-brand text-white shadow-brand"
                            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )
                      }
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                      <span className="flex-1">{label}</span>
                      {n > 0 &&
                        (znacka === "uzivo" ? (
                          <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-success-soft px-2 text-[10.5px] font-bold text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            {n}
                          </span>
                        ) : (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-brand px-1.5 text-[10.5px] font-bold text-white">
                            {n > 9 ? "9+" : n}
                          </span>
                        ))}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default TrainerWebSidebar;
