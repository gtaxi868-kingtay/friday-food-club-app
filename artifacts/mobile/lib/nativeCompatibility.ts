import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { reportRuntimeError } from '@/lib/runtimeDiagnostics';

type KeyboardControllerModule = typeof import('react-native-keyboard-controller');

let keyboardController: KeyboardControllerModule | null | undefined;

export function isExpoGo(): boolean {
  return (
    Platform.OS !== 'web' &&
    (Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
  );
}

/**
 * Keyboard Controller is a native module and is not present in Expo Go.
 * Keep its require behind the runtime compatibility check so importing the
 * root layout does not initialize an unavailable native module.
 */
export function getKeyboardController(): KeyboardControllerModule | null {
  if (Platform.OS === 'web' || isExpoGo()) {
    return null;
  }

  if (keyboardController !== undefined) {
    return keyboardController;
  }

  try {
    keyboardController = require('react-native-keyboard-controller') as KeyboardControllerModule;
  } catch (error) {
    reportRuntimeError('native-keyboard-controller', error, {
      platform: Platform.OS,
      expoGo: false,
    });
    keyboardController = null;
  }

  return keyboardController;
}