/**
 * @notifee/react-native with notifications permitted and nothing scheduled.
 *
 * Permission is reported as granted so the Schedule tab shows the reminders
 * as a working phone does, rather than the "notifications are off" warning.
 */
const names = (...keys) => Object.fromEntries(keys.map((k, i) => [k, i]));

export const EventType = names('UNKNOWN', 'DISMISSED', 'PRESS', 'ACTION_PRESS', 'DELIVERED');
export const TriggerType = { TIMESTAMP: 0, INTERVAL: 1 };
export const AlarmType = names('SET', 'SET_AND_ALLOW_WHILE_IDLE', 'SET_EXACT', 'SET_EXACT_AND_ALLOW_WHILE_IDLE', 'SET_ALARM_CLOCK');
export const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, MIN: 1, NONE: 0 };
export const AndroidNotificationSetting = { NOT_SUPPORTED: -1, DISABLED: 0, ENABLED: 1 };
export const AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
export const RepeatFrequency = { NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2 };

const settings = {
  authorizationStatus: AuthorizationStatus.AUTHORIZED,
  android: { alarm: AndroidNotificationSetting.ENABLED },
};

const notifee = {
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
  getInitialNotification: async () => null,
  createChannel: async (c) => c?.id ?? 'default',
  deleteChannel: async () => {},
  createTriggerNotification: async () => 'trigger',
  cancelTriggerNotification: async () => {},
  cancelTriggerNotifications: async () => {},
  getTriggerNotificationIds: async () => [],
  getNotificationSettings: async () => settings,
  requestPermission: async () => settings,
  openAlarmPermissionSettings: async () => {},
  openNotificationSettings: async () => {},
};

export default notifee;
