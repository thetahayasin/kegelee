/**
 * @format
 */

// gesture-handler must be imported first, before anything else, so its native
// side is initialised before React Navigation's stack navigator mounts.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import { enableFreeze } from 'react-native-screens';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { trackReminderTapped } from './src/services/events';
import { topUpFromDelivery } from './src/services/reminders';
import { name as appName } from './app.json';

// Suspend rendering of screens that are not visible (react-freeze). Paired with
// freezeOnBlur on the tab navigator so background tabs stop re-rendering.
enableFreeze(true);

// Register the background event handler. Notifee requires one to be set, and it
// is the only place a reminder tapped while the app is in the background is
// visible at all - the foreground handler in App.tsx never sees it, and this
// runs outside React, so it cannot live there. The event is written straight to
// SQLite and pushed by whichever sync runs next.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (__DEV__) {
    console.log('Notifee background event received', type);
  }
  if (type === EventType.PRESS) {
    await trackReminderTapped(detail?.notification?.id);
  }
  /**
   * Every delivery re-arms the series - see topUpFromDelivery.
   *
   * Reminders are scheduled a bounded distance ahead, so that they stop on
   * their own when a subscription ends rather than firing forever. The person
   * who most needs them is the one who has stopped opening the app, and their
   * window would otherwise run out with nothing left to refill it. This is the
   * only moment this app is guaranteed to be running for them.
   *
   * On DELIVERED as well as PRESS: a reminder that arrives and is ignored is
   * exactly the case that matters, and it never produces a press.
   */
  if (type === EventType.DELIVERED || type === EventType.PRESS) {
    await topUpFromDelivery(detail?.notification?.id);
  }
});

AppRegistry.registerComponent(appName, () => App);
