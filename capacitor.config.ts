import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thexi.sloughcc',
  appName: 'Slough CC Fantasy',
  webDir: 'out',
  server: {
    url: 'https://the-xi.app/clubs/slough-cc',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
