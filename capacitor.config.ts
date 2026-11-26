import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gassar.ai',
  appName: 'Gassar.AI',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
