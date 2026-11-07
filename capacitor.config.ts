import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gmart.planner',
  appName: 'G-Mart Planner',
  webDir: 'www',
  backgroundColor: '#080d1a',
  plugins: {
    // Use the WebView fetch: native HTTP re-encodes the text/plain body and follows the Apps Script redirect differently.
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
