import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Which way the screen may turn (docs/design/glass-over-paper.md §5; the owner's answer): a phone stays
 * upright, a tablet turns both ways — its layout follows the window width, so a tablet held upright gets
 * the same panels in one column.
 *
 * The app config allows every orientation; this hook narrows it for phones at run time, because the
 * config cannot tell a phone from a tablet. On the web the browser window decides and nothing is locked.
 * A refusal of the lock (an OS that does not support it) is not an error: the layout works either way.
 */
export function useOrientationPolicy(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const tablet = Device.deviceType === Device.DeviceType.TABLET || Device.deviceType === Device.DeviceType.DESKTOP;
    const apply = tablet
      ? ScreenOrientation.unlockAsync()
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    apply.catch(() => undefined);
  }, []);
}
