import { NavLink } from "react-router-dom";
import { Home, Users, Calendar, Wallet, BarChart3, Dumbbell, TrendingUp, CreditCard } from "lucide-react";

interface BottomNavProps {
  role: "trainer" | "athlete";
}

const trainerLinks = [
  { to: "/trener", icon: Home, label: "Home", end: true },
  { to: "/trener/vezbaci", icon: Users, label: "Vežbači" },
  { to: "/trener/kalendar", icon: Calendar, label: "Kalendar" },
  { to: "/trener/finansije", icon: BarChart3, label: "Finansije" },
];

const athleteLinks = [
  { to: "/vezbac", icon: Home, label: "Home", end: true },
  { to: "/vezbac/trening", icon: Dumbbell, label: "Trening" },
  { to: "/vezbac/napredak", icon: TrendingUp, label: "Napredak" },
  { to: "/vezbac/clanarina", icon: CreditCard, label: "Članarina" },
];

export const BottomNav = ({ role }: BottomNavProps) => {
  const links = role === "trainer" ? trainerLinks : athleteLinks;
  const activeColor = role === "trainer" ? "text-primary" : "text-accent-bright";

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-30">
      <div className="mx-3 mb-3 rounded-2xl border border-border/80 bg-surface/95 backdrop-blur-xl shadow-card">
        <ul className="grid grid-cols-4">
          {links.map(({ to, icon: Icon, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition ${
                    isActive ? activeColor : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};
