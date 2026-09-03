import { getSavedSensor, startSensorHrMonitoring } from "./bleHeartRate";

export type LiveHrSource = "sensor" | "healthkit";

/**
 * Jedno mesto koje bira odakle ide zivi puls tokom treninga na telefonu.
 *
 * Redosled: uparena BLE traka pa tek onda telefonov HealthKit. Traka na
 * nadlaktici/grudima je tacnija od opticke procene, a i sama je izricit izbor
 * vezbaca - ako je uparena, hoce da se koristi. Ako se ne javi (ugasena, van
 * dometa), pada na HealthKit umesto da trening ostane bez pulsa.
 *
 * Sat NIJE ovde: on ne salje puls kroz telefon nego pravo u bazu
 * (watch_update_workout_hr), pa se ta dva izvora ne takmice u ovoj funkciji.
 */
export const startLiveHrSource = async (
  onUpdate: (bpm: number, source: LiveHrSource) => void,
  onSensorConnectionChange?: (povezana: boolean) => void,
): Promise<() => void> => {
  const sensor = getSavedSensor();

  if (sensor) {
    const rezultat = await startSensorHrMonitoring(
      sensor,
      (bpm) => onUpdate(bpm, "sensor"),
      onSensorConnectionChange,
    );
    if (rezultat.stop) return rezultat.stop;
    console.warn("[HR] traka se nije javila:", rezultat.razlog);
  }

  const { startLiveHRMonitoring } = await import("./healthkit");
  return startLiveHRMonitoring((bpm) => onUpdate(bpm, "healthkit"));
};
