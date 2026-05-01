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
  try {
    const wk = await Health.queryWorkouts({
      startDate,
      endDate,
      includeHeartRate: true,
      includeRoute: false,
      includeSteps: false,
    });
    wk.workouts?.forEach((w) => {
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
      if (w.heartRate?.length) {
        const bpms = w.heartRate.map((h) => h.bpm);
        const avg = bpms.reduce((a, b) => a + b, 0) / bpms.length;
        const max = Math.max(...bpms);
        records.push({
          user_id: userId,
          provider: 'apple_health',
          data_type: 'heart_rate_avg',
          value: Math.round(avg),
          unit: 'bpm',
          recorded_for: day,
          recorded_at: w.startDate,
          source_id: 'apple_health:hr-avg:' + (w.id ?? w.startDate),
        });
        records.push({
          user_id: userId,
          provider: 'apple_health',
          data_type: 'heart_rate_max',
          value: Math.round(max),
          unit: 'bpm',
          recorded_for: day,
          recorded_at: w.startDate,
          source_id: 'apple_health:hr-max:' + (w.id ?? w.startDate),
        });
      }
    });
  } catch (e) {
    console.warn('Workouts sync failed', e);
  }

  if (records.length === 0) {
    await supabase.from('wearable_connections' as any).upsert(
      {
        user_id: userId,
        provider: 'apple_health',
        status: 'connected',
        last_sync_at: new Date().toISOString(),
      } as any,
      { onConflict: 'user_id,provider' },
    );
    await supabase.from('wearable_sync_logs' as any).insert({
      user_id: userId,
      provider: 'apple_health',
      status: 'success',
      records_synced: 0,
      finished_at: new Date().toISOString(),
    } as any);
    return { synced: 0 };
  }

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
    records_synced: records.length,
    finished_at: new Date().toISOString(),
  } as any);

  console.log('HealthKit sync', { records: records.length, ms: Date.now() - t0 });
  return { synced: records.length };
}
