import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.internpulse.app',
  appName: 'InternPulse',
  webDir: 'public',
  server: {
    url: 'https://ai-internship-tracker.vercel.app',
    cleartext: true,
  },
  android: {
    backgroundColor: '#06070d',
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
