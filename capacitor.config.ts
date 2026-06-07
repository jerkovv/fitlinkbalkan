import { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'rs.fitlink.app',
  appName: 'FitLink',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#ffffff'
  },
  android: {
    backgroundColor: '#ffffff'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#7C3AED',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP'
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'dark',
      backgroundColor: '#ffffff'
    },
    Keyboard: {
      resize: KeyboardResize.None
    }
  }
};

export default config;