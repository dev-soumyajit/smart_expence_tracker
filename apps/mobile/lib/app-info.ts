import Constants from 'expo-constants';
import { Platform } from 'react-native';
import config from '../app.json';

// Keep the profile and About sheet aligned with the app's release configuration.
export const appInfo = {
  developerName: 'Soumyajit Khan',
  name: Constants.expoConfig?.name || config.expo.name,
  version: Constants.expoConfig?.version || config.expo.version,
  build: String(Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber || config.expo.ios.buildNumber
    : Constants.expoConfig?.android?.versionCode || config.expo.android.versionCode),
};
