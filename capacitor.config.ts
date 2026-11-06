import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gmart.planner',
  appName: 'G-Mart Planner',
  webDir: 'www',
  backgroundColor: '#080d1a',
  plugins: {
    // Native HTTP avoids CORS problems with the Google Apps Script backend on device.
    CapacitorHttp: { enabled: false },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#080d1a',
      showSpinner: false,
    },
    StatusBar: { overlaysWebView: false },
  },
};

export default config;
