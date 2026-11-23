import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.novamusic.app',
  appName: 'NOVA MUSIC',
  webDir: 'www',
  bundledWebRuntime: false,
  backgroundColor: '#090b12',
  ios: {
    contentInset: 'automatic'
  },
  android: {
    backgroundColor: '#090b12'
  }
};

export default config;
