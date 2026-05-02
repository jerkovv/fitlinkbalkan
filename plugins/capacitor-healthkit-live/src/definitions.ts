import type { PluginListenerHandle } from '@capacitor/core';

export interface HeartRateSample {
  bpm: number;
  timestamp: string;
}

export interface HeartRateReading {
  bpm: number | null;
  timestamp: string | null;
}

export interface HealthKitLivePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  getCurrentHeartRate(): Promise<HeartRateReading>;
  startHeartRateMonitoring(): Promise<void>;
  stopHeartRateMonitoring(): Promise<void>;
  addListener(
    eventName: 'heartRateUpdate',
    listenerFunc: (sample: HeartRateSample) => void,
  ): Promise<PluginListenerHandle>;
}
