import { Capacitor } from '@capacitor/core';
import { Health, type HealthPermission } from 'capacitor-health';
import { supabase } from '@/lib/supabase';
import { computeMaxHR, computeZones, type HRSample } from '@/lib/wearable/hrZones';

export const isHealthKitAvailable = () => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
};

const READ_PERMS: HealthPermission[] = [
  'READ_STEPS',
  'READ_WORKOUTS',
  'READ_ACTIVE_CALORIES',
  'READ_TOTAL_CALORIES',
  'READ_DISTANCE',
  'READ_HEART_RATE',
];

export async function requestHealthKitPermissions() {
  if (!isHealthKitAvailable()) {
    throw new Error('HealthKit dostupan samo na iOS uređajima');
  }
  try {
    const avail = await Health.isHealthAvailable();
    if (!avail.available) {
      return { success: false, error: 'Health nije dostupan na uređaju' };
    }
    await Health.requestHealthPermissions({
      permissions: [...READ_PERMS, 'WRITE_WORKOUTS'],
    });
    return { success: true as const };
  } catch (error) {
    console.error('HealthKit auth failed', error);
    return { success: false as const, error };
  }
}

const dayBuckets = (days: number) => {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
};

export async function syncHealthKitData(userId: string) {
  if (!isHealthKitAvailable()) {
    throw new Error('HealthKit nije dostupan');
  }

  const t0 = Date.now();
  const { startDate, endDate } = dayBuckets(7);
  const records: any[] = [];

  // Steps, agregirano po danu
  try {
    const stepsRes = await Health.queryAggregated({
      startDate,
      endDate,
      dataType: 'steps',
      bucket: 'day',
    });
    stepsRes.aggregatedData?.forEach((s) => {
      const day = s.startDate.slice(0, 10);
      records.push({
        user_id: userId,
        provider: 'apple_health',
        data_type: 'steps',
        value: Math.round(s.value),
        unit: 'count',
        recorded_for: day,
        recorded_at: s.startDate,
        source_id: 'apple_health:steps:' + day,
      });
    });
  } catch (e) {
    console.warn('Steps sync failed', e);
  }

  // Aktivne kalorije, po danu
  try {
    const calRes = await Health.queryAggregated({
      startDate,
      endDate,
      dataType: 'active-calories',
      bucket: 'day',
    });
    calRes.aggregatedData?.forEach((s) => {
      const day = s.startDate.slice(0, 10);
      records.push({
        user_id: userId,
        provider: 'apple_health',
        data_type: 'calories_active',
        value: Math.round(s.value),
        unit: 'kcal',
        recorded_for: day,
        recorded_at: s.startDate,
        source_id: 'apple_health:active-calories:' + day,
      });
    });
  } catch (e) {
    console.warn('Active calories sync failed', e);
  }

  // Treninzi, sa pulsom
  let userMaxHR = 180;
  try {
    const { data: hrCfg } = await supabase
      .from('user_hr_config' as any)
      .select('max_hr')
      .eq('user_id', userId)
      .maybeSingle();
    const cfgMax = (hrCfg as any)?.max_hr;
    if (cfgMax && Number(cfgMax) > 0) {
      userMaxHR = Number(cfgMax);
    } else {
      const { data: ath } = await supabase
        .from('athletes')
        .select('birth_year')
        .eq('id', userId)
        .maybeSingle();
      userMaxHR = computeMaxHR((ath as any)?.birth_year ?? null);
    }
  } catch (e) {
    console.warn('Max HR lookup failed, using fallback', e);
  }

  let workoutsSynced = 0;
  let newWorkouts = 0;
  // Postojeci source_id-evi pre upserta, da bismo razlikovali nove od azuriranih
  const existingWorkoutSourceIds = new Set<string>();
  try {
    const { data: existingDet } = await supabase
      .from('wearable_workout_details' as any)
      .select('source_id')
      .eq('user_id', userId)
      .eq('provider', 'apple_health');
    (existingDet ?? []).forEach((r: any) => {
      if (r?.source_id) existingWorkoutSourceIds.add(r.source_id);
    });
  } catch (e) {
    console.warn('Existing workout source_ids fetch failed', e);
  }
  try {
    const wk = await Health.queryWorkouts({
      startDate,
      endDate,
      includeHeartRate: true,
      includeRoute: false,
      includeSteps: false,
    });
    for (const w of wk.workouts ?? []) {
      const day = w.startDate.slice(0, 10);
      records.push({
        user_id: userId,
        provider: 'apple_health',
        data_type: 'workout_duration',
        value: Math.round((w.duration ?? 0) / 60),
        unit: 'min',
        recorded_for: day,
        recorded_at: w.startDate,
        source_id: 'apple_health:workout:' + (w.id ?? `${w.startDate}-${w.endDate}`),
      });

      const hrSeries: HRSample[] = (w.heartRate ?? [])
        .map((h: any) => ({
          ts: h.timestamp ?? h.startDate ?? w.startDate,
          bpm: Number(h.bpm),
        }))
        .filter((s) => Number.isFinite(s.bpm) && s.bpm > 0);

      let avg: number | null = null;
      let max: number | null = null;
      let min: number | null = null;
      if (hrSeries.length) {
        const bpms = hrSeries.map((h) => h.bpm);
        avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
        max = Math.max(...bpms);
        min = Math.min(...bpms);
        records.push({
          user_id: userId,
          provider: 'apple_health',
          data_type: 'heart_rate_avg',
          value: avg,
          unit: 'bpm',
          recorded_for: day,
          recorded_at: w.startDate,
          source_id: 'apple_health:hr-avg:' + (w.id ?? w.startDate),
        });
        records.push({
          user_id: userId,
          provider: 'apple_health',
          data_type: 'heart_rate_max',
          value: max,
          unit: 'bpm',
          recorded_for: day,
          recorded_at: w.startDate,
          source_id: 'apple_health:hr-max:' + (w.id ?? w.startDate),
        });
      }

      // Upsert wearable_workout_details + zones, uvek, nezavisno od wearable_data
      try {
        const sourceId = w.id ?? `${w.startDate}-${w.endDate}`;
        const detailRow: any = {
          user_id: userId,
          provider: 'apple_health',
          source_id: sourceId,
          workout_type: (w as any).workoutType ?? (w as any).type ?? 'other',
          started_at: w.startDate,
          ended_at: w.endDate,
          duration_seconds: w.duration ? Math.round(w.duration) : null,
          total_distance_m: (w as any).distance ?? null,
          total_calories:
            (w as any).totalEnergyBurned ??
            (w as any).totalEnergy ??
            (w as any).calories ??
            null,
          active_calories: (() => {
            const active =
              (w as any).activeEnergyBurned ??
              (w as any).activeEnergy ??
              (w as any).activeCalories ??
              null;
            if (active != null && Number.isFinite(Number(active))) {
              return Number(active);
            }
            const total =
              (w as any).totalEnergyBurned ??
              (w as any).totalEnergy ??
              (w as any).calories ??
              null;
            if (total != null && Number.isFinite(Number(total))) {
              return Math.round(Number(total) * 0.85);
            }
            return null;
          })(),
          hr_avg: avg,
          hr_max: max,
          hr_min: min,
          hr_series: hrSeries,
          splits: null,
          metadata: null,
        };
        const { data: detRow, error: detErr } = await supabase
          .from('wearable_workout_details' as any)
          .upsert(detailRow, { onConflict: 'user_id,provider,source_id' })
          .select('id')
          .single();
        if (detErr) {
          console.warn('Workout detail upsert failed', detErr);
        } else if (detRow) {
          workoutsSynced += 1;
          if (!existingWorkoutSourceIds.has(sourceId)) {
            newWorkouts += 1;
          }
          if (hrSeries.length) {
            const workoutId = (detRow as any).id;
            const zones = computeZones(hrSeries, userMaxHR);
            await supabase
              .from('wearable_workout_zones' as any)
              .delete()
              .eq('workout_id', workoutId);
            if (zones.some((z) => z.seconds_in_zone > 0)) {
              await supabase.from('wearable_workout_zones' as any).insert(
                zones.map((z) => ({
                  workout_id: workoutId,
                  zone: z.zone,
                  zone_name: z.zone_name,
                  min_bpm: z.min_bpm,
                  max_bpm: z.max_bpm,
                  seconds_in_zone: z.seconds_in_zone,
                })) as any,
              );
            }
          }
        }
      } catch (e) {
        console.warn('Zones computation failed for workout', e);
      }
    }
  } catch (e) {
    console.warn('Workouts sync failed', e);
  }

  // Upsert wearable_data ako ima zapisa
  let newRecords = 0;
  if (records.length > 0) {
    // Prebroj postojece kljuceve pre upserta
    const keys = records.map((r) => ({
      data_type: r.data_type,
      recorded_for: r.recorded_for,
      source_id: r.source_id,
    }));
    const dataTypes = Array.from(new Set(keys.map((k) => k.data_type)));
    const dates = Array.from(new Set(keys.map((k) => k.recorded_for)));
    const existingKeys = new Set<string>();
    try {
      const { data: existingData } = await supabase
        .from('wearable_data' as any)
        .select('data_type,recorded_for,source_id')
        .eq('user_id', userId)
        .eq('provider', 'apple_health')
        .in('data_type', dataTypes)
        .in('recorded_for', dates);
      (existingData ?? []).forEach((r: any) => {
        existingKeys.add(`${r.data_type}|${r.recorded_for}|${r.source_id ?? ''}`);
      });
    } catch (e) {
      console.warn('Existing wearable_data keys fetch failed', e);
    }
    newRecords = records.filter(
      (r) => !existingKeys.has(`${r.data_type}|${r.recorded_for}|${r.source_id ?? ''}`),
    ).length;

    const { error } = await supabase
      .from('wearable_data' as any)
      .upsert(records, {
        onConflict: 'user_id,provider,data_type,recorded_for,source_id',
      });
    if (error) {
      console.error('Supabase upsert failed', error);
      await supabase.from('wearable_sync_logs' as any).insert({
        user_id: userId,
        provider: 'apple_health',
        status: 'error',
        records_synced: 0,
        error_message: error.message,
        finished_at: new Date().toISOString(),
      } as any);
      throw error;
    }
  }

  await supabase.from('wearable_connections' as any).upsert(
    {
      user_id: userId,
      provider: 'apple_health',
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_error: null,
    } as any,
    { onConflict: 'user_id,provider' },
  );

  await supabase.from('wearable_sync_logs' as any).insert({
    user_id: userId,
    provider: 'apple_health',
    status: 'success',
    records_synced: newRecords,
    finished_at: new Date().toISOString(),
  } as any);

  console.log('HealthKit sync', {
    records: records.length,
    workouts: workoutsSynced,
    ms: Date.now() - t0,
  });
  return { synced: records.length, workouts: workoutsSynced };
}
