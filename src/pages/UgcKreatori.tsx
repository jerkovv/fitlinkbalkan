import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Clapperboard, BadgeEuro, Dumbbell, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_BASE } from "@/lib/publicUrl";
import { BrandWordmark } from "@/components/BrandMark";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// Javna landing stranica fitlink.rs/ugc-kreatori (zaseban entry, vidi
// src/ugc-kreatori.tsx). Anon insert u ugc_prijave; mejl obavestenje salje
// trigger na bazi, klijent ne zna za njega.

const LS_KEY = "fitlink_ugc_prijava_sent_at";
const COOLDOWN_MS = 60_000;

const DOSTUPNOST = ["Odmah", "U roku od 7 dana", "U roku od 30 dana"] as const;

// ---- validacija ------------------------------------------------------------

const REQ = "Obavezno polje";
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

// "@ime", "instagram.com/ime/", "https://www.instagram.com/ime?x=1" -> "ime"
const toHandle = (raw: string, hosts: RegExp) =>
  raw
    .trim()
    .replace(hosts, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();

const igHandle = (v: string) => toHandle(v, /^(https?:\/\/)?(www\.)?instagram\.com\//i);
const ttHandle = (v: string) => toHandle(v, /^(https?:\/\/)?(www\.)?tiktok\.com\/@?/i);

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), { message: "Link mora da počinje sa http:// ili https://" });

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const money = (required: boolean) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(String(v).replace(",", "."))),
    required
      ? z.number({ required_error: REQ, invalid_type_error: "Unesi broj" }).min(0, "Cena ne može biti negativna")
      : z.number({ invalid_type_error: "Unesi broj" }).min(0, "Cena ne može biti negativna").optional(),
  );

const schema = z.object({
  // 1. Osnovno
  ime_prezime: z.string().trim().min(2, REQ).max(120, "Najviše 120 karaktera"),
  telefon: z
    .string()
    .trim()
    .min(1, REQ)
    .regex(/^\+?[0-9 ()/.-]{6,20}$/, "Unesi ispravan broj telefona"),
  email: z.string().trim().min(1, REQ).email("Unesi ispravnu email adresu"),
  grad_drzava: z.string().trim().min(2, REQ).max(120, "Najviše 120 karaktera"),

  // 2. Profili
  instagram: z
    .string()
    .trim()
    .min(1, REQ)
    .transform(igHandle)
    .refine((v) => HANDLE_RE.test(v), { message: "Unesi ispravno Instagram korisničko ime" }),
  tiktok: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? ttHandle(v) : undefined))
    .refine((v) => !v || HANDLE_RE.test(v), { message: "Unesi ispravno TikTok korisničko ime" }),
  portfolio_link: optionalUrl,

  // 3. Sadrzaj
  linkovi_klipova: z
    .string()
    .superRefine((s, ctx) => {
      const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 1) ctx.addIssue({ code: "custom", message: "Unesi bar jedan link" });
      else if (lines.length > 10) ctx.addIssue({ code: "custom", message: "Najviše 10 linkova" });
      else if (lines.some((l) => !/^https?:\/\//i.test(l)))
        ctx.addIssue({ code: "custom", message: "Svaki red mora da bude link koji počinje sa http" });
    })
    .transform((s) => s.split("\n").map((l) => l.trim()).filter(Boolean)),
  upload_link: optionalUrl,
  fitness_pozadina: z.string().trim().min(1, REQ).max(400, "Najviše 400 karaktera"),

  // 4. Cenovnik
  cena_1_klip: money(true),
  cena_paket_3: money(false),
  cena_paket_5: money(false),
  sta_ulazi_u_cenu: z.string().trim().min(1, REQ).max(1000, "Najviše 1000 karaktera"),
  rok_isporuke_dana: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ required_error: REQ, invalid_type_error: "Unesi broj dana" })
      .int("Unesi ceo broj dana")
      .min(1, "Najmanje 1 dan")
      .max(365, "Najviše 365 dana"),
  ),
  oprema: optionalText,
  dostupnost: z.enum(DOSTUPNOST, { errorMap: () => ({ message: "Izaberi dostupnost" }) }),

  // 5. Ostalo
  napomena: optionalText,
  saglasnost: z.literal(true, { errorMap: () => ({ message: "Potrebna je saglasnost da bismo te kontaktirali" }) }),
  // honeypot - pravi korisnik ga ne vidi
  website: z.string().optional(),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

// ---- UI primitive (48px visina, 16px font da iOS ne zumira) ----------------

const fieldCls =
  "w-full min-h-12 rounded-xl border border-hairline bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/70 shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/25";

type FieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
  counter?: string;
};

const Field = ({ label, htmlFor, required, helper, error, children, counter }: FieldProps) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
      {label}
      {required ? <span className="text-primary"> *</span> : null}
    </label>
    {children}
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : helper ? (
          <p className="text-sm text-muted-foreground">{helper}</p>
        ) : null}
      </div>
      {counter ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{counter}</span> : null}
    </div>
  </div>
);

const Section = ({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="card-premium p-5 sm:p-7">
    <div className="mb-6 flex items-baseline justify-between gap-3 border-b border-hairline pb-4">
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      <span className="eyebrow text-muted-foreground">0{n}</span>
    </div>
    <div className="space-y-5">{children}</div>
  </section>
);

// Zrno preko hero mesh-a: SVG feTurbulence kao data URI, bez dodatnih fajlova.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const MESH = [
  "radial-gradient(60% 70% at 12% 18%, hsl(var(--brand-1) / 0.70) 0%, transparent 60%)",
  "radial-gradient(55% 65% at 85% 25%, hsl(var(--brand-2) / 0.55) 0%, transparent 60%)",
  "radial-gradient(60% 60% at 75% 95%, hsl(var(--brand-3) / 0.45) 0%, transparent 62%)",
  "radial-gradient(45% 50% at 30% 100%, hsl(var(--brand-2) / 0.35) 0%, transparent 60%)",
].join(", ");

const STA_RADIMO = [
  { icon: Clapperboard, text: "Kratki vertikalni video za Instagram i TikTok" },
  { icon: BadgeEuro, text: "Plaćena saradnja, po klipu ili po paketu" },
  { icon: Dumbbell, text: "Sadržaj mora biti iz fitness niše" },
];

// ---- stranica --------------------------------------------------------------

const UgcKreatori = () => {
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    document.title = "Tražimo UGC fitness kreatore | FitLink";
  }, []);

  // Rate limit: 60s od poslednjeg slanja sa ovog uredjaja (localStorage).
  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(LS_KEY) ?? 0);
      setCooldown(Math.max(0, Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [done]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      dostupnost: "" as unknown as FormInput["dostupnost"],
      saglasnost: false as unknown as true,
      website: "",
    },
  });

  const pozadinaLen = (watch("fitness_pozadina") ?? "").length;

  const onSubmit = async (values: FormOutput) => {
    setSubmitError(null);

    // Honeypot: bot je popunio skriveno polje - tiho "uspeh", bez upisa.
    if (values.website) {
      setDone(true);
      return;
    }

    const last = Number(localStorage.getItem(LS_KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return;

    setSending(true);
    const { error } = await supabase.from("ugc_prijave").insert({
      ime_prezime: values.ime_prezime,
      telefon: values.telefon,
      email: values.email,
      grad_drzava: values.grad_drzava,
      instagram: values.instagram,
      tiktok: values.tiktok ?? null,
      portfolio_link: values.portfolio_link ?? null,
      linkovi_klipova: values.linkovi_klipova,
      upload_link: values.upload_link ?? null,
      fitness_pozadina: values.fitness_pozadina,
      cena_1_klip: values.cena_1_klip,
      cena_paket_3: values.cena_paket_3 ?? null,
      cena_paket_5: values.cena_paket_5 ?? null,
      sta_ulazi_u_cenu: values.sta_ulazi_u_cenu,
      rok_isporuke_dana: values.rok_isporuke_dana,
      oprema: values.oprema ?? null,
      dostupnost: values.dostupnost,
      napomena: values.napomena ?? null,
      saglasnost: true,
    });
    setSending(false);

    if (error) {
      setSubmitError("Slanje nije uspelo. Proveri internet i pokušaj ponovo.");
      return;
    }
    localStorage.setItem(LS_KEY, String(Date.now()));
    setDone(true);
  };

  const err = (k: keyof FormInput) => errors[k]?.message as string | undefined;
  const inv = (k: keyof FormInput) => (errors[k] ? true : undefined);

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* HERO */}
      <header
        className="relative overflow-hidden text-white"
        style={{ backgroundColor: "hsl(240 18% 6%)" }}
      >
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: MESH }} />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-8 sm:pb-24 sm:pt-10">
          <a href={SITE_BASE} className="inline-flex items-center text-white/90" aria-label="FitLink početna">
            <BrandWordmark className="h-5 sm:h-6" />
          </a>

          <p className="eyebrow mt-14 text-white/60 sm:mt-20">Saradnja sa kreatorima</p>
          <h1 className="mt-4 font-display text-[2.75rem] font-extrabold uppercase leading-[0.92] tracking-tightest sm:text-7xl lg:text-8xl">
            Tražimo UGC fitness kreatore
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            Snimaš i montiraš Reels i TikTok, a teretana ti je druga kuća? Broj pratilaca nam nije bitan,
            bitan je sadržaj.
          </p>
          <a
            href="#prijava"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-gradient-brand px-6 text-sm font-semibold uppercase tracking-wide text-white shadow-brand"
          >
            Prijavi se
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-5 pb-[calc(env(safe-area-inset-bottom)+3rem)] sm:px-8">
        {/* STA RADIMO */}
        <section className="-mt-6 sm:-mt-12" aria-labelledby="sta-radimo">
          <h2 id="sta-radimo" className="sr-only">
            Šta radimo
          </h2>
          <ul className="card-premium grid divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {STA_RADIMO.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-4 p-5 sm:flex-col sm:gap-5 sm:p-6">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0" strokeWidth={1.75} />
                <div>
                  <span className="eyebrow block text-muted-foreground">0{i + 1}</span>
                  <p className="mt-1.5 text-[15px] font-semibold leading-snug">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* FORMA / USPEH */}
        <div id="prijava" className="mt-12 scroll-mt-6 sm:mt-16">
          {done ? (
            <section className="card-premium p-7 text-center sm:p-12">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-brand">
                <Check className="h-7 w-7" />
              </div>
              <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tightest sm:text-5xl">
                Prijava poslata
              </h2>
              <p className="mt-4 text-base text-muted-foreground">Javljamo se svima koji uđu u uži izbor.</p>
              <a
                href={SITE_BASE}
                className="mt-8 inline-flex h-12 items-center justify-center rounded-xl border border-hairline bg-surface px-6 text-sm font-semibold text-foreground shadow-xs"
              >
                Nazad na početnu
              </a>
            </section>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              <div className="mb-2">
                <p className="eyebrow text-primary">Prijava</p>
                <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Pošalji nam svoj rad
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Polja sa <span className="text-primary">*</span> su obavezna.
                </p>
              </div>

              <Section n={1} title="Osnovno">
                <Field label="Ime i prezime" htmlFor="ime_prezime" required error={err("ime_prezime")}>
                  <input
                    id="ime_prezime"
                    type="text"
                    autoComplete="name"
                    className={fieldCls}
                    aria-invalid={inv("ime_prezime")}
                    {...register("ime_prezime")}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Telefon" htmlFor="telefon" required error={err("telefon")}>
                    <input
                      id="telefon"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="+381 6x xxx xxxx"
                      className={fieldCls}
                      aria-invalid={inv("telefon")}
                      {...register("telefon")}
                    />
                  </Field>
                  <Field label="Email" htmlFor="email" required error={err("email")}>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      className={fieldCls}
                      aria-invalid={inv("email")}
                      {...register("email")}
                    />
                  </Field>
                </div>
                <Field label="Grad i država" htmlFor="grad_drzava" required error={err("grad_drzava")}>
                  <input
                    id="grad_drzava"
                    type="text"
                    autoComplete="address-level2"
                    placeholder="Beograd, Srbija"
                    className={fieldCls}
                    aria-invalid={inv("grad_drzava")}
                    {...register("grad_drzava")}
                  />
                </Field>
              </Section>

              <Section n={2} title="Profili">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Instagram" htmlFor="instagram" required error={err("instagram")}>
                    <input
                      id="instagram"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="@korisnicko_ime"
                      className={fieldCls}
                      aria-invalid={inv("instagram")}
                      {...register("instagram")}
                    />
                  </Field>
                  <Field label="TikTok" htmlFor="tiktok" error={err("tiktok")}>
                    <input
                      id="tiktok"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="@korisnicko_ime"
                      className={fieldCls}
                      aria-invalid={inv("tiktok")}
                      {...register("tiktok")}
                    />
                  </Field>
                </div>
                <Field label="Portfolio" htmlFor="portfolio_link" error={err("portfolio_link")}>
                  <input
                    id="portfolio_link"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    placeholder="Drive, Notion, portfolio sajt"
                    className={fieldCls}
                    aria-invalid={inv("portfolio_link")}
                    {...register("portfolio_link")}
                  />
                </Field>
              </Section>

              <Section n={3} title="Sadržaj iz fitness niše">
                <Field
                  label="Linkovi ka klipovima koje si snimao. Reels, TikTok, YouTube Shorts"
                  htmlFor="linkovi_klipova"
                  required
                  helper="Isključivo sadržaj iz fitness niše. Ako imaš klipove iz drugih niša, njih ne šalji. Jedan link po redu, najviše 10."
                  error={err("linkovi_klipova")}
                >
                  <textarea
                    id="linkovi_klipova"
                    rows={5}
                    autoCapitalize="none"
                    placeholder={"https://www.instagram.com/reel/...\nhttps://www.tiktok.com/@.../video/..."}
                    className={cn(fieldCls, "resize-y")}
                    aria-invalid={inv("linkovi_klipova")}
                    {...register("linkovi_klipova")}
                  />
                </Field>
                <Field
                  label="Link ka fajlovima"
                  htmlFor="upload_link"
                  helper="Ako imaš raw materijale, okači ih na file.kiwi, WeTransfer ili Google Drive i nalepi link. Ne primamo attachmente."
                  error={err("upload_link")}
                >
                  <input
                    id="upload_link"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    placeholder="https://"
                    className={fieldCls}
                    aria-invalid={inv("upload_link")}
                    {...register("upload_link")}
                  />
                </Field>
                <Field
                  label="Tvoja veza sa fitnesom"
                  htmlFor="fitness_pozadina"
                  required
                  helper="Treniraš, treniraš druge, radiš u teretani. Kratko."
                  error={err("fitness_pozadina")}
                  counter={`${pozadinaLen}/400`}
                >
                  <textarea
                    id="fitness_pozadina"
                    rows={3}
                    maxLength={400}
                    className={cn(fieldCls, "resize-y")}
                    aria-invalid={inv("fitness_pozadina")}
                    {...register("fitness_pozadina")}
                  />
                </Field>
              </Section>

              <Section n={4} title="Cenovnik">
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Cena za 1 klip" htmlFor="cena_1_klip" required error={err("cena_1_klip")}>
                    <div className="relative">
                      <input
                        id="cena_1_klip"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="1"
                        className={cn(fieldCls, "pr-14")}
                        aria-invalid={inv("cena_1_klip")}
                        {...register("cena_1_klip")}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">
                        EUR
                      </span>
                    </div>
                  </Field>
                  <Field label="Cena za paket od 3 klipa" htmlFor="cena_paket_3" error={err("cena_paket_3")}>
                    <div className="relative">
                      <input
                        id="cena_paket_3"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="1"
                        className={cn(fieldCls, "pr-14")}
                        aria-invalid={inv("cena_paket_3")}
                        {...register("cena_paket_3")}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">
                        EUR
                      </span>
                    </div>
                  </Field>
                  <Field label="Cena za paket od 5 klipa" htmlFor="cena_paket_5" error={err("cena_paket_5")}>
                    <div className="relative">
                      <input
                        id="cena_paket_5"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="1"
                        className={cn(fieldCls, "pr-14")}
                        aria-invalid={inv("cena_paket_5")}
                        {...register("cena_paket_5")}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">
                        EUR
                      </span>
                    </div>
                  </Field>
                </div>
                <Field
                  label="Šta ulazi u cenu"
                  htmlFor="sta_ulazi_u_cenu"
                  required
                  helper="Snimanje, montaža, scenario, broj korekcija, da li je uključena tvoja pojava u kadru."
                  error={err("sta_ulazi_u_cenu")}
                >
                  <textarea
                    id="sta_ulazi_u_cenu"
                    rows={3}
                    className={cn(fieldCls, "resize-y")}
                    aria-invalid={inv("sta_ulazi_u_cenu")}
                    {...register("sta_ulazi_u_cenu")}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Rok isporuke u danima" htmlFor="rok_isporuke_dana" required error={err("rok_isporuke_dana")}>
                    <input
                      id="rok_isporuke_dana"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step="1"
                      className={fieldCls}
                      aria-invalid={inv("rok_isporuke_dana")}
                      {...register("rok_isporuke_dana")}
                    />
                  </Field>
                  <Field label="Čime snimaš" htmlFor="oprema" error={err("oprema")}>
                    <input
                      id="oprema"
                      type="text"
                      placeholder="iPhone 15 Pro, Sony ZV-E10..."
                      className={fieldCls}
                      aria-invalid={inv("oprema")}
                      {...register("oprema")}
                    />
                  </Field>
                </div>
                <Field label="Dostupnost" htmlFor="dostupnost" required error={err("dostupnost")}>
                  <select
                    id="dostupnost"
                    className={cn(fieldCls, "appearance-none bg-no-repeat pr-10")}
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23777' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
                      backgroundPosition: "right 1rem center",
                    }}
                    aria-invalid={inv("dostupnost")}
                    {...register("dostupnost")}
                  >
                    <option value="" disabled>
                      Izaberi
                    </option>
                    {DOSTUPNOST.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
              </Section>

              <Section n={5} title="Za kraj">
                <Field label="Napomena" htmlFor="napomena" error={err("napomena")}>
                  <textarea
                    id="napomena"
                    rows={3}
                    placeholder="Sve što misliš da treba da znamo."
                    className={cn(fieldCls, "resize-y")}
                    aria-invalid={inv("napomena")}
                    {...register("napomena")}
                  />
                </Field>

                <Controller
                  name="saglasnost"
                  control={control}
                  render={({ field }) => (
                    <div className="space-y-1.5">
                      <label htmlFor="saglasnost" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                        <Checkbox
                          id="saglasnost"
                          checked={field.value === true}
                          onCheckedChange={(v) => field.onChange(v === true)}
                          onBlur={field.onBlur}
                          className="mt-0.5 h-5 w-5 rounded-md"
                          aria-invalid={inv("saglasnost")}
                        />
                        <span>
                          Saglasan sam da FitLink obradi moje podatke radi kontakta u vezi sa saradnjom.
                          <span className="text-primary"> *</span>
                        </span>
                      </label>
                      {err("saglasnost") ? (
                        <p className="text-sm text-destructive" role="alert">
                          {err("saglasnost")}
                        </p>
                      ) : null}
                    </div>
                  )}
                />

                {/* Honeypot: van ekrana, bez tab fokusa, skriven za citace. */}
                <div
                  aria-hidden="true"
                  style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
                >
                  <label htmlFor="website">Website</label>
                  <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
                </div>
              </Section>

              {submitError ? (
                <p className="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground" role="alert">
                  {submitError}
                </p>
              ) : null}
              {cooldown > 0 ? (
                <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning-soft-foreground" role="status">
                  Prijava je već poslata sa ovog uređaja. Ponovno slanje je moguće za {cooldown}s.
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!isValid || sending || cooldown > 0}
                className={cn(
                  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand text-base font-bold uppercase tracking-wide text-white shadow-brand transition",
                  "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {sending ? "Slanje..." : "Pošalji prijavu"}
              </button>
            </form>
          )}
        </div>

        <footer className="mt-16 border-t border-hairline pt-6 text-center text-xs text-muted-foreground">
          FitLink, tvoj trening na jednom mestu.{" "}
          <a href={SITE_BASE} className="font-medium text-foreground">
            fitlink.rs
          </a>
        </footer>
      </main>
    </div>
  );
};

export default UgcKreatori;
