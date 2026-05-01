import { Capacitor } from '@capacitor/core';
import { CapacitorHealthkit, SampleNames } from 'capacitor-health';
import { supabase } from '@/integrations/supabase/client';

export const isHealthKitAvailable = () => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
};

export async function requestHealthKitPermissions() {
  if (!isHealthKitAvailable()) {
    throw new Error('HealthKit dostupan samo na iOS uređajima');
  }

  const READ_PERMS = [
    'steps',
    'heart-rate',
    'resting-heart-rate',
    'heart-rate-variability',
    'sleep-analysis',
    'active-energy',
    'workouts',
    'weight',
    'body-fat-percentage'
  ];

  try {
    await CapacitorHealthkit.requestAuthorization({
      all: [],
      read: READ_PERMS,
      write: ['workouts']
    });
    return { success: true };
  } catch (error) {
    console.error('HealthKit auth failed', error);
    return { success: false, error };
  }
}

export async function syncHealthKitData(userId: string) {
  if (!isHealthKitAvailable()) {
    throw new Error('HealthKit nije dostupan');
  }

  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date().toISOString();

  const records: any[] = [];

  // Resting HR
  try {
    const restingHR = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: 'resting-heart-rate',
      startDate,
      endDate,
      limit: 100
    });

    restingHR.resultData?.forEach((r: any) => {
      records.push({
        user_id: userId,
        provider: 'apple_health',
        data_type: 'heart_rate_resting',
        value: r.value,
        unit: 'bpm',
        recorded_for: r.startDate.split('T')[0],
        recorded_at: r.startDate,
        raw_payload: r
      });
    });
  } catch (e) {
    console.warn('Resting HR sync failed', e);
  }

  // Steps (daily totals)
  try {
    const steps = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: 'steps',
      startDate,
      endDate,
      limit: 1000
    });

    // Group by day
    const byDay: Record<string, number> = {};
    steps.resultData?.forEach((r: any) => {
      const day = r.startDate.split('T')[0];
      byDay[day] = (byDay[day] || 0) + r.value;
    });

    Object.entries(byDay).forEach(([day, total]) => {
      records.push({
        user_id: userId,
        provider: 'apple_health',
        data_type: 'steps',
        value: total,
        unit: 'count',
        recorded_for: day,
        recorded_at: `${day}T23:59:59Z`,
        raw_payload: { aggregated: true, day_total: total }
      });
    });
  } catch (e) {
    console.warn('Steps sync failed', e);
  }

  // Sleep
  try {
    const sleep = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: 'sleep-analysis',
      startDate,
      endDate,
      limit: 100
    });

    const byNight: Record<string, number> = {};
    sleep.resultData?.forEach((r: any) => {
      const night = r.startDate.split('T')[0];
      const start = new Date(r.startDate).getTime();
      const end = new Date(r.endDate).getTime();
      const minutes = Math.round((end - start) / 60000);
      byNight[night] = (byNight[night] || 0) + minutes;
    });

    Object.entries(byNight).forEach(([day, mins]) => {
      records.push({
        user_id: userId,
        provider: 'apple_health',
        data_type: 'sleep_minutes',
        value: mins,
        unit: 'minutes',
        recorded_for: day,
        recorded_at: `${day}T08:00:00Z`,
        raw_payload: { aggregated: true, total_minutes: mins }
      });
    });
  } catch (e) {
    console.warn('Sleep sync failed', e);
  }

  if (records.length === 0) {
    return { synced: 0 };
  }

  const { error } = await supabase
    .from('wearable_data')
    .upsert(records, { onConflict: 'user_id,provider,data_type,recorded_for' });

  if (error) {
    console.error('Supabase upsert failed', error);
    throw error;
  }

  // Update connection
  await supabase
    .from('wearable_connections')
    .upsert({
      user_id: userId,
      provider: 'apple_health',
      access_token: 'native',
      status: 'active',
      last_sync_at: new Date().toISOString()
    }, { onConflict: 'user_id,provider' });

  // Log sync
  await supabase.from('wearable_sync_logs').insert({
    user_id: userId,
    provider: 'apple_health',
    status: 'success',
    records_synced: records.length
  });

  return { synced: records.length };
}