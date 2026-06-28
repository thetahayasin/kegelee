/**
 * JS bridge stubs for the Android Alarms plugin (NativePHP Mobile).
 *
 * @example
 *   import { alarm } from '@taha/nativephp-android-alarms';
 *   if (await alarm.isClockAppAvailable()) {
 *     await alarm.setWeeklySchedule(slots, 'Kegel');
 *   }
 *
 * Most callers drive this from PHP via the Alarm facade; these stubs are for
 * front-end code that prefers to call the bridge directly.
 */

const baseUrl = '/_native/api/call';

async function bridgeCall(method, params = {}) {
    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '',
        },
        body: JSON.stringify({ method, params }),
    });

    const result = await response.json();

    if (result.status === 'error') {
        throw new Error(result.message || 'Native call failed');
    }

    const nativeResponse = result.data;
    if (nativeResponse && nativeResponse.data !== undefined) {
        return nativeResponse.data;
    }

    return nativeResponse;
}

export const alarm = {
    /** @returns {Promise<{available: boolean}>} */
    isClockAppAvailable: () => bridgeCall('Alarm.IsClockAppAvailable'),

    /**
     * @param {Array<{id?:any, dayOfWeek:number|string, hour:number, minute:number, label?:string, sessionUuid?:any}>} slots
     * @returns {Promise<{available:boolean, slots:number, groups:number, intentsFired:number}>}
     */
    setWeeklySchedule: (slots, appName = null, vibrate = true) =>
        bridgeCall('Alarm.SetWeeklySchedule', { slots, appName, vibrate }),

    /** @returns {Promise<{available:boolean, intentsFired:number}>} */
    setSingleAlarm: (hour, minute, days = [], label = '', vibrate = true) =>
        bridgeCall('Alarm.SetSingleAlarm', { hour, minute, days, label, vibrate }),

    /** @returns {Promise<{opened: boolean}>} */
    openAlarmsList: () => bridgeCall('Alarm.OpenAlarmsList'),
};

export default alarm;
