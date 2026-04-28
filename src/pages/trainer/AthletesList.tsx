import { useState } from "react";
import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Chip } from "@/components/ui-bits";
import { Search, Plus, ChevronRight } from "lucide-react";
import { athletes, AthleteStatus } from "@/data/mock";
import { cn } from "@/lib/utils";

const filters: { key: "all" | AthleteStatus; label: string; count?: number }[] = [
  { key: "all", label: "Svi" },
  { key: "active", label: "Aktivni" },
  { key: "expiring", label: "Uskoro" },
  { key: "expired", label: "Istekli" },
];

const statusChip = {
  active: <Chip tone="success">Aktivan</Chip>,
  expiring: <Chip tone="warning">Uskoro</Chip>,
  expired: <Chip tone="danger">Istekao</Chip>,
};

const AthletesList = () => {
  const [filter, setFilter] = useState<"all" | AthleteStatus>("all");
  const [q, setQ] = useState("");

  const filtered = athletes.filter(
    (a) => (filter === "all" || a.status === filter) && a.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PhoneShell hasBottomNav title="Vežbači" eyebrow={`${athletes.length} ukupno`}>
        {/* Search */}
        <div className="flex items-center gap-2 card-premium px-4 py-3 focus-within:ring-2 focus-within:ring-primary/40 transition">
          <Search className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pretraži ime..."
            className="bg-transparent flex-1 text-[15px] placeholder:text-muted-foreground/70 focus:outline-none"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "pill px-4 py-2 text-[13px] whitespace-nowrap transition",
                filter === f.key
                  ? "bg-foreground text-background"
                  : "bg-surface border border-hairline text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <ul className="space-y-2">
          {filtered.map((a) => (
            <li key={a.id}>
              <Link
                to={`/trener/vezbaci/${a.id}`}
                className="flex items-center gap-3 card-premium-hover px-4 py-3"
              >
                <Avatar initials={a.initials} tone={a.status === "expiring" ? "athlete" : "brand"} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold tracking-tight">{a.name}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">
                    {a.program} · {a.expiresLabel}
                  </div>
                </div>
                {statusChip[a.status]}
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="text-center text-[13px] text-muted-foreground py-10">Nema rezultata.</li>
          )}
        </ul>

        <button className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition">
          <Plus className="h-4 w-4" /> Dodaj novog vežbača
        </button>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default AthletesList;
