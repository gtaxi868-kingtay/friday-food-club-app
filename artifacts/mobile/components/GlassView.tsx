/**
 * GlassView — cross-platform liquid glass panel.
 *
 * Native (iOS / Android): expo-blur BlurView with tint="dark" for real
 * frosted-glass. Web: semi-transparent rgba View (backdrop-filter not
 * reliable in the Replit preview iframe).
 */

import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 0-100. Controls blur intensity on native and opacity on web. Default 40. */
  intensity?: number;
  /** Extra rgba background darkness 0-1. Default 0.65. */
  darkness?: number;
  /** Accent tint colour blended at low opacity (optional). */
  tintColor?: string;
}

export default function GlassView({
  children,
  style,
  intensity = 40,
  darkness = 0.65,
  tintColor,
}: GlassViewProps) {
  // Web: skip BlurView entirely — use a solid rgba dark panel instead
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.base,
          {
            backgroundColor: tintColor
              ? `rgba(18,15,8,${darkness})`
              : `rgba(14,14,14,${darkness})`,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // Native: real blur
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[styles.base, style]}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
