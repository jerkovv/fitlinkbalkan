import { Capacitor } from "@capacitor/core";

/**
 * Puls traka preko Bluetooth-a (bez sata).
 *
 * Trake (Coospo, Magene, Polar, Garmin, CL830/CL831 i slicne) sve pricaju isti
 * standardni GATT profil, pa nema SDK-a po proizvodjacu: servis 0x180D,
 * karakteristika 0x2A37 (notify). ANT+ koji neke od njih uz to imaju ne koristi
 * se - iPhone nema ANT+ radio, a na Androidu ga ima jos samo poneki stariji
 * telefon uz posebne servise.
 *
 * Uredjaj se pamti LOKALNO (ovaj telefon), ne u bazi: id koji vraca skeniranje
 * je po platformi razlicit (iOS daje sopstveni UUID po telefonu, Android MAC),
 * pa isti red u bazi ne bi vazio na drugom uredjaju.
 */

const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb";
const BATTERY_SERVICE = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_LEVEL = "00002a19-0000-1000-8000-00805f9b34fb";

const STORAGE_KEY = "fitlink.hr_sensor";

export type HrSensor = { deviceId: string; name: string };

/** Nadjen uredjaj u skeniranju (jaci signal = blize). */
export type ScannedSensor = HrSensor & { rssi: number | null };

/** BLE radi samo u aplikaciji iz prodavnice - u WebView-u i Safari-ju Web Bluetooth ne postoji. */
export const isHrSensorSupported = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const client = async () => (await import("@capacitor-community/bluetooth-le")).BleClient;

/**
 * androidNeverForLocation: skeniranje na Androidu 12+ inace trazi i dozvolu za
 * lokaciju, a traka nam ne daje nikakvu lokaciju - Play to trazi da se izjavi.
 */
const initialize = async () => {
  const BleClient = await client();
  await BleClient.initialize({ androidNeverForLocation: true });
  return BleClient;
};

/** 0x2A37: prvi bajt su flegovi, bit 0 kaze da li je bpm u jednom bajtu ili u dva (LE). */
export const parseHeartRate = (value: DataView): number | null => {
  if (!value || value.byteLength < 2) return null;
  const flags = value.getUint8(0);
  const bpm = flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
  if (!Number.isFinite(bpm) || bpm < 25 || bpm > 250) return null;
  return bpm;
};

export const getSavedSensor = (): HrSensor | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HrSensor;
    return parsed?.deviceId ? parsed : null;
  } catch {
    return null;
  }
};

export const saveSensor = (sensor: HrSensor) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sensor));
  } catch {
    /* privatni rezim / puna memorija - traka onda vazi samo za ovaj trening */
  }
};

export const clearSavedSensor = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
};

/**
 * Skeniranje traje ograniceno (default 12s) i vraca sve sto emituje HR servis.
 * Isti uredjaj se u skeniranju javlja vise puta - zove se onFound sa vec
 * sazetom listom, da UI ne mora da radi dedup.
 */
export const scanForHrSensors = async (
  onFound: (found: ScannedSensor[]) => void,
  seconds = 12,
): Promise<() => void> => {
  const BleClient = await initialize();
  const nadjeni = new Map<string, ScannedSensor>();

  await BleClient.requestLEScan({ services: [HR_SERVICE] }, (rezultat) => {
    const deviceId = rezultat.device?.deviceId;
    if (!deviceId) return;
    const postojeci = nadjeni.get(deviceId);
    nadjeni.set(deviceId, {
      deviceId,
      // iOS ime stize tek uz konekciju kod nekih traka - tada localName ostaje prazan.
      name: rezultat.localName || rezultat.device?.name || postojeci?.name || "Puls traka",
      rssi: typeof rezultat.rssi === "number" ? rezultat.rssi : postojeci?.rssi ?? null,
    });
    onFound([...nadjeni.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)));
  });

  let zaustavljen = false;
  const stop = async () => {
    if (zaustavljen) return;
    zaustavljen = true;
    try {
      await BleClient.stopLEScan();
    } catch {
      /* noop */
    }
  };

  setTimeout(() => void stop(), seconds * 1000);
  return () => void stop();
};

export const readBattery = async (deviceId: string): Promise<number | null> => {
  try {
    const BleClient = await client();
    const value = await BleClient.read(deviceId, BATTERY_SERVICE, BATTERY_LEVEL);
    const pct = value.getUint8(0);
    return Number.isFinite(pct) ? pct : null;
  } catch {
    // Baterijski servis nije obavezan deo profila - dosta traka ga nema.
    return null;
  }
};

/**
 * Poveze se na traku i salje svaki novi otkucaj u onUpdate.
 *
 * Vraca funkciju za prekid, ili null ako se traka nije javila (ugasena, van
 * dometa, na tudjem telefonu) - pozivalac tada moze da padne na drugi izvor.
 * Dok je aktivna, sama se vraca na traku posle prekida veze (traka ume da
 * zaspi kad se skine sa ruke).
 */
export const startSensorHrMonitoring = async (
  sensor: HrSensor,
  onUpdate: (bpm: number) => void,
  onConnectionChange?: (povezana: boolean) => void,
): Promise<(() => void) | null> => {
  if (!isHrSensorSupported()) return null;

  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const BleClient = await initialize();

  const subscribe = async () => {
    await BleClient.startNotifications(sensor.deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
      const bpm = parseHeartRate(value);
      if (bpm != null) onUpdate(bpm);
    });
  };

  const connect = async (): Promise<boolean> => {
    try {
      await BleClient.connect(sensor.deviceId, () => {
        onConnectionChange?.(false);
        if (!stopped) planirajPonovniPokusaj();
      });
      await subscribe();
      onConnectionChange?.(true);
      return true;
    } catch {
      return false;
    }
  };

  const planirajPonovniPokusaj = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (stopped) return;
      const ok = await connect();
      if (!ok && !stopped) planirajPonovniPokusaj();
    }, 5000);
  };

  const povezana = await connect();
  if (!povezana) return null;

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    void (async () => {
      try {
        await BleClient.stopNotifications(sensor.deviceId, HR_SERVICE, HR_MEASUREMENT);
      } catch {
        /* noop */
      }
      try {
        await BleClient.disconnect(sensor.deviceId);
      } catch {
        /* noop */
      }
      onConnectionChange?.(false);
    })();
  };
};
