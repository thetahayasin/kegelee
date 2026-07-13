/**
 * @format
 */

// gesture-handler must be imported first, before anything else, so its native
// side is initialised before React Navigation's stack navigator mounts.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
