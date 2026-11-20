import { useEffect } from "react";
import natpis from "@/assets/fitlink-wordmark.svg";

const APP_STORE = "https://apps.apple.com/rs/app/fitlink-trener-i-ve%C5%BEba%C4%8Di/id6766111046";
const GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=rs.fitlink.app";
const DUGME = {
  backgroundImage: "linear-gradient(135deg,#8A36E8 0%,#603DEA 55%,#E84BAE 100%)",
  boxShadow: "0 14px 34px -14px rgba(138,54,232,0.75)",
};

// Na fitlink.rs/dashboard stari svetli izgled za telefon se vise ne prikazuje: kad je prozor
// uzak (telefon ili skupljen prozor na racunaru), ili kad dashboard otvori vezbac, stoji ovaj
// ekran i salje na aplikaciju. Od 2026-11-20 isti ekran stoji i na app.fitlink.rs (stara web
// aplikacija), osim stranica do kojih vode linkovi iz mejlova. Aplikacije u prodavnicama ga ne vide.
export function OtvoriAplikaciju({ zaVezbaca = false, naStarojAdresi = false }: { zaVezbaca?: boolean; naStarojAdresi?: boolean }) {
  // Pozadina iza ekrana (i "odskok" pri skrolu) ostaje tamna.
  useEffect(() => {
    const html = document.documentElement;
    const staro = html.style.backgroundColor;
    html.style.backgroundColor = "#0B0A10";
    return () => {
      html.style.backgroundColor = staro;
    };
  }, []);

  const belo = { filter: "brightness(0) invert(1)" };

  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-6 py-12"
      style={{
        backgroundColor: "#0B0A10",
        backgroundImage:
          "radial-gradient(720px 560px at 85% -10%, rgba(139,61,235,0.30), transparent 70%), radial-gradient(640px 560px at -10% 110%, rgba(91,75,239,0.24), transparent 70%)",
        color: "#F3F1F8",
        fontFamily: "'Poppins', system-ui, sans-serif",
      }}
    >
      <div className="w-full max-w-[420px]">
        {/* Zvanicni natpis vec nosi i znak. */}
        <img src={natpis} alt="FitLink" className="h-[22px] w-auto" style={belo} />

        <div className="mt-12 text-[12px] font-semibold uppercase" style={{ letterSpacing: "1.4px", color: "#B58CFF" }}>
          {zaVezbaca ? "FitLink za vežbače" : naStarojAdresi ? "FitLink aplikacija" : "FitLink na telefonu"}
        </div>
        <h1 className="mt-3 text-[34px] leading-[1.12] font-bold" style={{ letterSpacing: "-0.6px" }}>
          Otvori aplikaciju na telefonu
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.65]" style={{ color: "#B9B4C8" }}>
          {zaVezbaca
            ? "Treninzi, ishrana, termini i članarina su u aplikaciji. Prijavi se istim mejlom i lozinkom."
            : naStarojAdresi
            ? "FitLink radi u aplikaciji za iPhone i Android. Preuzmi je i prijavi se istim mejlom i lozinkom. Trener na računaru radi na fitlink.rs/dashboard."
            : "Na ovoj širini ekrana FitLink radi u aplikaciji. Dashboard se otvara na računaru, u širem prozoru."}
        </p>

        {/* Ista dugmad kao u mejlovima: App Store i Google Play jedno pored drugog, sa znakom. */}
        <div className="mt-9 grid grid-cols-2 gap-3">
          <a
            href={APP_STORE}
            className="h-14 rounded-2xl flex items-center justify-center gap-2 text-[15.5px] font-semibold text-white"
            style={DUGME}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true">
              <path d="M16.36 1.43c.06 1.02-.33 2.02-1 2.74-.69.74-1.83 1.31-2.92 1.22-.07-1 .39-2.04 1.03-2.7.71-.74 1.95-1.29 2.89-1.26ZM19.7 17.4c-.5 1.16-.74 1.67-1.39 2.69-.9 1.43-2.18 3.2-3.76 3.22-1.4.01-1.77-.92-3.67-.9-1.9.01-2.3.92-3.71.89-1.58-.01-2.79-1.62-3.69-3.04-2.52-3.98-2.79-8.66-1.23-11.14 1.1-1.77 2.85-2.81 4.5-2.81 1.67 0 2.73.92 4.11.92 1.34 0 2.16-.92 4.1-.92 1.46 0 3.01.8 4.11 2.18-3.61 1.98-3.02 7.15.32 8.92Z" />
            </svg>
            App Store
          </a>
          <a
            href={GOOGLE_PLAY}
            className="h-14 rounded-2xl flex items-center justify-center gap-2 text-[15.5px] font-semibold text-white"
            style={DUGME}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M3.6 1.84a1.5 1.5 0 0 0-.6 1.2v17.92c0 .5.24.94.6 1.2l10.06-10.16L3.6 1.84Z" fill="#34D399" />
              <path d="m17.9 8.42-3.36-1.94-2.7 2.72 2.7 2.72 3.4-1.96c.96-.56.96-1.98-.04-2.54Z" fill="#FACC15" />
              <path d="m14.54 6.48-10.94-4.7L13.66 12l2.7-2.72-1.82-2.8Z" fill="#F87171" />
              <path d="m3.6 22.16 10.94-4.74 1.82-2.78-2.7-2.72-10.06 10.24Z" fill="#60A5FA" />
            </svg>
            Google Play
          </a>
        </div>

        <p className="mt-6 text-[13px] leading-[1.6]" style={{ color: "#857F96" }}>
          Već imaš aplikaciju? Otvori je i prijavi se istim nalogom.
        </p>
      </div>
    </div>
  );
}

export default OtvoriAplikaciju;
