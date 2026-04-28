import { useState } from "react";
import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Chip } from "@/components/ui-bits";
import { Search, Plus } from "lucide-react";
import { athletes, AthleteStatus } from "@/data/mock";
import { cn } from "@/lib/utils";

const filters: { key: "all" | AthleteStatus; label: string }[] = [
  { key: "all", label: "Svi" },
  { key: "active", label: "Aktivni" },
  { key: "expiring", label: "Uskoro" },
  { key: "expired", label: "Istekli" },
];

const statusDot = {
  active: <Chip tone="success">●  Aktivan</Chip>,
  expiring: <Chip tone="warning">●  Uskoro</Chip>,
  expired: <Chip tone="danger">●  Istekao</Chip>,
};

const AthletesList = () => {
  const [filter, setFilter] = useState<"all" | AthleteStatus>("all");
  const [q, setQ] = useState("");

  const filtered = athletes.filter(
    (a) => (filter === "all" || a.status === filter) && a.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PhoneShell title={`Moji Vežbači (${athletes.length})`} variant="trainer">
        <div className="flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2.5 mb-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pretraži ime..."
            className="bg-transparent flex-1 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-3 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {filtered.map((a) => (
            <li key={a.id}>
              <Link
                to={`/trener/vezbaci/${a.id}`}
                className="flex items-center gap-3 rounded-xl bg-surface border border-border/60 p-3 hover:border-primary/50 transition"
              >
                <Avatar initials={a.initials} tone={a.status === "active" ? "trainer" : a.status === "expiring" ? "athlete" : "trainer"} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.expiresLabel}</div>
                </div>
                {statusDot[a.status]}
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="text-center text-xs text-muted-foreground py-8">Nema rezultata.</li>
          )}
        </ul>

        <button className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 py-3 text-sm font-semibold text-primary-soft-foreground hover:bg-primary-soft/40 transition">
          <Plus className="h-4 w-4" /> Dodaj novog vežbača
        </button>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default AthletesList;
