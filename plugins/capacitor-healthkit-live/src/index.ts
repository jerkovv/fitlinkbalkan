import { registerPlugin } from '@capacitor/core';

import type { HealthKitLivePlugin } from './definitions';

const HealthKitLive = registerPlugin<HealthKitLivePlugin>('HealthKitLive', {
  web: () => import('./web').then((m) => new m.HealthKitLiveWeb()),
});

export * from './definitions';
export { HealthKitLive };
