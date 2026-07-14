/**
 * @format
 */

// gesture-handler must be imported first, before anything else, so its native
// side is initialised before React Navigation's stack navigator mounts.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import { enableFreeze } from 'react-native-screens';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

// Suspend rendering of screens that are not visible (react-freeze). Paired with
// freezeOnBlur on the tab navigator so background tabs stop re-rendering.
enableFreeze(true);

// Register the background event handler. Notifee requires one to be set; there's
// nothing to do for a reminder tap here, so just log it in development.
notifee.onBackgroundEvent(async ({ type }) => {
  if (__DEV__) {
    console.log('Notifee background event received', type);
  }
});

AppRegistry.registerComponent(appName, () => App);
