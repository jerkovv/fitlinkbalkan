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

/**
 * Ocitavanje iz 0x2A37.
 *
 * contact: da li traka OSECA kozu. Bitovi 1 i 2 flegova: bit 2 kaze da traka
 * uopste ume da javi kontakt, bit 1 da ga trenutno ima. Kad traka ume a kaze da
 * kontakta nema, broj koji uz to posalje NIJE merenje - to je zadnja poznata ili
 * izracunata vrednost i tu nastaju "nasumicni" otkucaji dok traka visi na ruci
 * ili stoji na stolu. Takav uzorak se odbacuje.
 *
 * bpm: bit 0 kaze da li je vrednost u jednom bajtu ili u dva (LE).
 */
export type HrReading = { bpm: number | null; contact: boolean | null; raw: string };

export const parseHrReading = (value: DataView): HrReading => {
  const bajtovi: string[] = [];
  for (let i = 0; i < (value?.byteLength ?? 0) && i < 6; i += 1) {
    bajtovi.push(value.getUint8(i).toString(16).padStart(2, "0"));
  }
  const raw = bajtovi.join(" ");

  if (!value || value.byteLength < 2) return { bpm: null, contact: null, raw };

  const flags = value.getUint8(0);
  const contactPodrzan = (flags & 0x04) !== 0;
  const contact = contactPodrzan ? (flags & 0x02) !== 0 : null;

  const sirovBpm = flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
  const validan = Number.isFinite(sirovBpm) && sirovBpm >= 25 && sirovBpm <= 250;

  return { bpm: validan && contact !== false ? sirovBpm : null, contact, raw };
};

/** Samo broj - kad pozivaocu kontakt nije bitan. */
export const parseHeartRate = (value: DataView): number | null => parseHrReading(value).bpm;

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
): Promise<() => Promise<void>> => {
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
  return stop;
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

const poruka = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return m.trim() || "nepoznata greška";
};

/**
 * Kratko skeniranje pred ponovni pokusaj: traka koja spava se time probudi, a
 * iOS-u vrati u vidno polje uredjaj cije UUID-e ne pamti izmedju pokretanja
 * aplikacije (connect na "nepoznat" id tamo puca odmah).
 */
const probudiTraku = async (deviceId: string, seconds = 6): Promise<void> => {
  try {
    const BleClient = await client();
    let vidjena = false;
    await BleClient.requestLEScan({ services: [HR_SERVICE] }, (r) => {
      if (r.device?.deviceId === deviceId) vidjena = true;
    });
    const kraj = Date.now() + seconds * 1000;
    while (!vidjena && Date.now() < kraj) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await BleClient.stopLEScan();
  } catch {
    /* ako ni skeniranje ne prolazi, connect ispod ce dati pravu gresku */
  }
};

/**
 * Ishod pokusaja: stop (prekid) kad je traka progovorila, inace razlog.
 * Namerno JEDAN oblik umesto diskriminisane unije - projekat je na
 * `strict: false`, gde TS ne suzava uniju po `ok` polju.
 */
export type SensorStart = { stop: (() => void) | null; razlog: string | null };

/**
 * Poveze se na traku i salje svaki novi otkucaj u onUpdate.
 *
 * Ako se traka ne javi, vraca RAZLOG (ne samo "nije uspelo") - bez toga se na
 * telefonu ne vidi da li je problem u dometu, u tudjoj vezi ili u tome sto
 * traka nema HR servis. Dok je aktivna, sama se vraca na traku posle prekida
 * veze (traka ume da zaspi kad se skine sa ruke).
 */
export const startSensorHrMonitoring = async (
  sensor: HrSensor,
  onUpdate: (bpm: number) => void,
  onConnectionChange?: (povezana: boolean) => void,
  /** Svako ocitavanje, i ono odbaceno - za ekran uparivanja (kontakt, sirovi bajtovi). */
  onReading?: (ocitavanje: HrReading) => void,
): Promise<SensorStart> => {
  if (!isHrSensorSupported()) return { stop: null, razlog: "Bluetooth radi samo u aplikaciji." };

  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const BleClient = await initialize();

  // iOS zna za uredjaj samo ako ga je video u OVOM pokretanju aplikacije: connect
  // na zapamcen id inace puca ("Device not found"). getDevices vraca peripheral
  // po UUID-u (retrievePeripherals) i time ga vraca pluginu u opticaj. Zato je
  // uparivanje radilo (pre njega ide skeniranje), a trening nije - tamo se ide
  // pravo na zapamcenu traku. Na Androidu je bezopasno, id je MAC.
  try {
    await BleClient.getDevices([sensor.deviceId]);
  } catch {
    /* nije kriticno - connect ispod ce reci pravu gresku */
  }

  const subscribe = async () => {
    await BleClient.startNotifications(sensor.deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
      const ocitavanje = parseHrReading(value);
      onReading?.(ocitavanje);
      if (ocitavanje.bpm != null) onUpdate(ocitavanje.bpm);
    });
  };

  // Rok je duzi od podrazumevanih 10s: traka koja tek izlazi iz sna ume da se
  // javi na drugi ili treci pokusaj CoreBluetooth-a.
  const connect = async (): Promise<string | null> => {
    try {
      await BleClient.connect(
        sensor.deviceId,
        () => {
          onConnectionChange?.(false);
          if (!stopped) planirajPonovniPokusaj();
        },
        { timeout: 20000 },
      );
    } catch (e) {
      return `veza: ${poruka(e)}`;
    }
    try {
      await subscribe();
    } catch (e) {
      // Povezala se, ali puls ne salje - druga prica od "nema je".
      try {
        await BleClient.disconnect(sensor.deviceId);
      } catch {
        /* noop */
      }
      return `puls servis: ${poruka(e)}`;
    }
    onConnectionChange?.(true);
    return null;
  };

  const planirajPonovniPokusaj = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (stopped) return;
      const greska = await connect();
      if (greska && !stopped) planirajPonovniPokusaj();
    }, 5000);
  };

  let greska = await connect();
  if (greska) {
    // Neuspeo pokusaj ostaje da visi u CoreBluetooth-u i sledeci connect na isti
    // uredjaj pada dok se ne otkaze - zato prvo disconnect, pa budjenje.
    try {
      await BleClient.disconnect(sensor.deviceId);
    } catch {
      /* nije ni bio povezan */
    }
    await probudiTraku(sensor.deviceId);
    if (stopped) return { stop: null, razlog: greska };
    greska = await connect();
  }
  if (greska) return { stop: null, razlog: greska };

  const stop = () => {
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

  return { stop, razlog: null };
};
