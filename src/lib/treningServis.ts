import { Capacitor, registerPlugin } from "@capacitor/core";

type TreningServisPlugin = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

const Servis = registerPlugin<TreningServisPlugin>("TreningServis");

// Samo Android: iOS aplikaciju u pozadini budi sam Bluetooth (bluetooth-central u
// Info.plist), dok Android bez obavestenja u statusnoj traci uspava proces.
const dostupan = Capacitor.getPlatform() === "android";

/** Pali obavestenje "Trening u toku" koje drzi trening zivim dok je telefon u dzepu. */
export const pokreniTreningServis = async (): Promise<void> => {
  if (!dostupan) return;
  try {
    await Servis.start();
  } catch (e) {
    // Servis je pomoc, ne uslov: trening radi i bez njega dok je ekran upaljen.
    console.warn("[trening servis] start:", e);
  }
};

export const zaustaviTreningServis = async (): Promise<void> => {
  if (!dostupan) return;
  try {
    await Servis.stop();
  } catch (e) {
    console.warn("[trening servis] stop:", e);
  }
};
