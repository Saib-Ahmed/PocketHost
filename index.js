import { AppRegistry } from 'react-native';
import App from './src/App';
import appConfig from './app.json';

const appName = appConfig.name || appConfig.expo?.name || 'PocketHost';

// Register for standard React Native CLI
AppRegistry.registerComponent(appName, () => App);

// Register for Expo (Expo Go & Dev Client look for 'main')
AppRegistry.registerComponent('main', () => App);
