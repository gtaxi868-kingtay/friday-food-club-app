import { Linking, Platform } from 'react-native';

/**
 * Opens the device's native maps app with a pin dropped at (lat, lng).
 * Uses the universal Google Maps web URL — iOS and Android both intercept
 * it and hand off to their installed maps app (Apple Maps / Google Maps)
 * when one exists, falling back to the browser otherwise. No API key,
 * no native map SDK, no dev-build requirement.
 */
export async function openInMaps(lat: number, lng: number, label?: string) {
  const query = label ? `${lat},${lng}(${encodeURIComponent(label)})` : `${lat},${lng}`;
  const url = Platform.select({
    ios: `maps://?q=${query}&ll=${lat},${lng}`,
    default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  })!;

  const canOpenNative = Platform.OS === 'ios' && (await Linking.canOpenURL(url).catch(() => false));
  if (canOpenNative) {
    await Linking.openURL(url);
    return;
  }
  await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
}
