import React from 'react';
import { getKeyboardController } from '@/lib/nativeCompatibility';

export function KeyboardProviderCompat({ children }: { children: React.ReactNode }) {
  const KeyboardProvider = getKeyboardController()?.KeyboardProvider;

  if (!KeyboardProvider) {
    return <>{children}</>;
  }

  return <KeyboardProvider>{children}</KeyboardProvider>;
}