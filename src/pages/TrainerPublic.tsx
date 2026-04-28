import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Loader2, MapPin, Sparkles, Instagram, Award, ChevronRight,
  Check, ArrowRight, Dumbbell,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PublicProfile = {
  trainer_id: string;
  full_name: string | null;
  studio_name: string | null;
  city: string | null;
  bio: string | null;
  headline: string | null;
  avatar_url: string | null;
  specialties: string[] | null;
  years_experience: number | null;
  instagram_handle: string | null;
  invite_code: string | null;
  packages: Array<{
    id: string;
    name: string;
    sessions_count: number;
    duration_days: number;
    price_rsd: number;
  }>;
};

const initials = (name: string | null) => {
  if (!name) return "T";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "T";
};

const fmtPrice = (n: number) =>
  new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 }).format(n);

const TrainerPublic = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_trainer_public_profile", { p_slug: slug } as any);
      if (error || !data || (data as any[]).length === 0) {
        setProfile(null);
      } else {
        setProfile((data as any[])[0] as PublicProfile);
      }
      setLoading(false);
    };
    load();
    document.title = slug ? `${slug} · FitLink` : "FitLink";
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <div className="h-16 w-16 rounded-3xl bg-muted flex items-center justify-center">
          <Dumbbell className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold">Trener nije pronađen</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Link je možda pogrešan ili je trener sakrio svoj profil.
        </p>
        <Link to="/">
          <Button variant="outline">Na početnu</Button>
        </Link>
      </div>
    );
  }

  const inviteUrl = profile.invite_code
    ? `${window.location.origin}/invite/${profile.invite_code}?source=public`
    : null;

  const studioLine = [profile.studio_name, profile.city].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-brand text-white">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative max-w-2xl mx-auto px-6 pt-12 pb-10">
          <div className="flex items-center gap-4 mb-6">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? "Trener"}
                className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/30 shadow-soft"
              />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center font-display text-2xl font-bold ring-2 ring-white/30">
                {initials(profile.full_name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {studioLine && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  {studioLine}
                </div>
              )}
              <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
                {profile.full_name ?? "Trener"}
              </h1>
            </div>
          </div>

          {profile.headline && (
            <p className="text-[18px] leading-snug text-white/95 font-medium tracking-tight max-w-xl">
              {profile.headline}
            </p>
          )}

          {inviteUrl && (
            <a
              href={inviteUrl}
              className="mt-6 inline-flex items-center gap-2 bg-white text-foreground rounded-full pl-5 pr-4 py-3 text-[14px] font-bold shadow-brand active:scale-[0.99] transition"
            >
              Postani moj vežbač <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Bio */}
        {profile.bio && (
          <section className="space-y-3">
            <div className="eyebrow text-muted-foreground">O meni</div>
            <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line">
              {profile.bio}
            </p>
          </section>
        )}

        {/* Specijalnosti / iskustvo */}
        {((profile.specialties?.length ?? 0) > 0 || profile.years_experience != null) && (
          <section className="space-y-3">
            <div className="eyebrow text-muted-foreground">Specijalnost</div>
            <div className="flex flex-wrap gap-2">
              {profile.years_experience != null && profile.years_experience > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft text-primary-soft-foreground px-3 py-1.5 text-[12.5px] font-semibold">
                  <Award className="h-3.5 w-3.5" />
                  {profile.years_experience}+ godina iskustva
                </span>
              )}
              {(profile.specialties ?? []).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 text-foreground px-3 py-1.5 text-[12.5px] font-semibold border border-hairline"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Paketi */}
        {profile.packages.length > 0 && (
          <section className="space-y-3">
            <div className="eyebrow text-muted-foreground">Paketi članarine</div>
            <div className="grid gap-3">
              {profile.packages.map((p, idx) => (
                <div
                  key={p.id}
                  className={cn(
                    "card-premium p-5 relative overflow-hidden",
                    idx === 1 && "ring-2 ring-primary/40"
                  )}
                >
                  {idx === 1 && (
                    <div className="absolute top-3 right-3 rounded-full bg-gradient-brand text-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-brand">
                      Popularno
                    </div>
                  )}
                  <div className="font-display text-[18px] font-bold tracking-tight">{p.name}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">
                    {p.sessions_count} {p.sessions_count === 1 ? "termin" : "termina"} · važi {p.duration_days} {p.duration_days === 1 ? "dan" : "dana"}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[26px] font-bold tracking-tightest tnum">
                      {fmtPrice(p.price_rsd)}
                    </span>
                    <span className="text-[13px] font-semibold text-muted-foreground">RSD</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA + IG */}
        <section className="space-y-3 pt-2">
          {inviteUrl && (
            <Button asChild className="w-full h-12 text-[14px] font-bold shadow-brand">
              <a href={inviteUrl}>
                Probaj besplatno · postani vežbač <ChevronRight className="h-4 w-4 ml-1" />
              </a>
            </Button>
          )}
          {profile.instagram_handle && (
            <a
              href={`https://instagram.com/${profile.instagram_handle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-hairline py-3 text-[13.5px] font-semibold text-foreground/80 hover:text-foreground hover:bg-surface-2 transition"
            >
              <Instagram className="h-4 w-4" />
              @{profile.instagram_handle.replace(/^@/, "")}
            </a>
          )}
        </section>

        {/* Why FitLink */}
        <section className="card-premium p-5 bg-gradient-brand-soft border-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary mb-2">
            Šta dobijaš
          </div>
          <ul className="space-y-2 text-[13.5px] text-foreground/85">
            {[
              "Personalizovan plan treninga",
              "Praćenje napretka i ličnih rekorda",
              "Rezervacija termina iz aplikacije",
              "Direktna komunikacija sa trenerom",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" strokeWidth={2.5} />
                {line}
              </li>
            ))}
          </ul>
        </section>

        <footer className="text-center text-[11px] text-muted-foreground py-6">
          Powered by <Link to="/" className="font-semibold text-foreground/70 hover:text-primary">FitLink</Link>
        </footer>
      </main>
    </div>
  );
};

export default TrainerPublic;
