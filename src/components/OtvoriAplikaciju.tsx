import { useEffect } from "react";
import natpis from "@/assets/fitlink-wordmark.svg";

const APP_STORE = "https://apps.apple.com/rs/app/fitlink-trener-i-ve%C5%BEba%C4%8Di/id6766111046";
const GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=rs.fitlink.app";

// Na fitlink.rs/dashboard stari svetli izgled za telefon se vise ne prikazuje: kad je prozor
// uzak (telefon ili skupljen prozor na racunaru), ili kad dashboard otvori vezbac, stoji ovaj
// ekran i salje na aplikaciju. app.fitlink.rs i aplikacije u prodavnicama ga nikad ne vide.
export function OtvoriAplikaciju({ zaVezbaca = false }: { zaVezbaca?: boolean }) {
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
          {zaVezbaca ? "FitLink za vežbače" : "FitLink na telefonu"}
        </div>
        <h1 className="mt-3 text-[34px] leading-[1.12] font-bold" style={{ letterSpacing: "-0.6px" }}>
          Otvori aplikaciju na telefonu
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.65]" style={{ color: "#B9B4C8" }}>
          {zaVezbaca
            ? "Treninzi, ishrana, termini i članarina su u aplikaciji. Prijavi se istim mejlom i lozinkom."
            : "Na ovoj širini ekrana FitLink radi u aplikaciji. Dashboard se otvara na računaru, u širem prozoru."}
        </p>

        <div className="mt-9 flex flex-col gap-3">
          <a
            href={APP_STORE}
            className="h-14 rounded-2xl flex items-center justify-center text-[16px] font-semibold text-white"
            style={{
              backgroundImage: "linear-gradient(135deg,#8A36E8 0%,#603DEA 55%,#E84BAE 100%)",
              boxShadow: "0 14px 34px -14px rgba(138,54,232,0.75)",
            }}
          >
            Preuzmi za iPhone
          </a>
          <a
            href={GOOGLE_PLAY}
            className="h-14 rounded-2xl flex items-center justify-center text-[16px] font-semibold"
            style={{ backgroundColor: "#1B1333", border: "1px solid #2E2350", color: "#F3F1F8" }}
          >
            Preuzmi za Android
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
