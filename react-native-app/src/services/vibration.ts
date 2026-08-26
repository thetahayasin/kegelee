import { NativeModules, Platform } from 'react-native';

const { VibrationModule } = NativeModules;

export interface VibrationStatus {
  /** The device has a vibrator the app is allowed to use. */
  hasVibrator: boolean;
  /** Best-effort read of the system-wide vibration switch. */
  systemVibrationOn: boolean;
  /** False when that switch could not be read, so callers can stay quiet. */
  systemVibrationKnown: boolean;
}

const ASSUME_FINE: VibrationStatus = {
  hasVibrator: true,
  systemVibrationOn: true,
  systemVibrationKnown: false,
};

/**
 * Why this exists: the workout cue is fired with RN's `Vibration.vibrate`, and
 * that API is write-only - it reports nothing about whether the buzz was
 * actually delivered. So a phone with vibration switched off system-wide is
 * indistinguishable, from JS, from one that buzzed exactly as asked. The app's
 * own Vibration switch then sits there saying "on" while nothing happens, which
 * reads as a broken app instead of a phone doing what its owner told it.
 *
 * Every unknown resolves to "fine". A false alarm here puts a warning about the
 * user's system settings on a screen where nothing is wrong, which is worse
 * than missing a real one - the cue is a supplement to the circle on screen,
 * not the only channel.
 */
export const getVibrationStatus = async (): Promise<VibrationStatus> => {
  if (Platform.OS !== 'android' || !VibrationModule?.getStatus) return ASSUME_FINE;
  try {
    const status = await VibrationModule.getStatus();
    return {
      hasVibrator: status?.hasVibrator !== false,
      systemVibrationOn: status?.systemVibrationOn !== false,
      systemVibrationKnown: status?.systemVibrationKnown === true,
    };
  } catch {
    return ASSUME_FINE;
  }
};

/** Why the cue cannot be felt, or 'none' when nothing is in its way. */
export type SilencedReason = 'none' | 'noHardware' | 'systemOff';

/**
 * Whether to tell the user their cue cannot be felt, and which thing to say.
 *
 * The two causes need different sentences and different offers. Missing
 * hardware is certain and permanent, and there is no setting to send anyone to;
 * a system switch is neither, and the fix is two taps away. Collapsing them
 * into one message would march the owner of a tablet with no vibrator into a
 * settings screen that has nothing for them.
 *
 * Missing hardware always counts. The system switch counts only when we
 * actually read it - see the OEM caveat in VibrationModule.
 */
export const cueSilencedReason = (status: VibrationStatus): SilencedReason => {
  if (!status.hasVibrator) return 'noHardware';
  if (status.systemVibrationKnown && !status.systemVibrationOn) return 'systemOff';
  return 'none';
};

/** Send them to Sound & vibration. Resolves false if nothing could be opened. */
export const openSystemSoundSettings = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !VibrationModule?.openSystemSoundSettings) return false;
  try {
    return await VibrationModule.openSystemSoundSettings();
  } catch {
    return false;
  }
};
