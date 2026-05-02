import { WebPlugin } from '@capacitor/core';

import type { HealthKitLivePlugin, HeartRateReading } from './definitions';

export class HealthKitLiveWeb extends WebPlugin implements HealthKitLivePlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async requestAuthorization(): Promise<{ granted: boolean }> {
    return { granted: false };
  }

  async getCurrentHeartRate(): Promise<HeartRateReading> {
    return { bpm: null, timestamp: null };
  }

  async startHeartRateMonitoring(): Promise<void> {
    throw this.unimplemented('startHeartRateMonitoring is only available on iOS.');
  }

  async stopHeartRateMonitoring(): Promise<void> {
    throw this.unimplemented('stopHeartRateMonitoring is only available on iOS.');
  }
}
