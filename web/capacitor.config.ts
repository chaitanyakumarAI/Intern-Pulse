import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app is a thin shell around the deployed web app, so every web
 * deploy reaches the phone without reinstalling. Change the URL with
 * CAPACITOR_SERVER_URL when building if the app lives elsewhere.
 */
const config: CapacitorConfig = {
  appId: 'com.internpulse.app',
  appName: 'InternPulse',
  webDir: 'public',
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://ai-internship-tracker.vercel.app',
    // Shown instead of the WebView's default error page when the app can't load.
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#07080f',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
