/**
 * Friday Food Club — Semantic design tokens
 * Single source of truth for the obsidian/gold luxury aesthetic.
 * Import this instead of hard-coding hex strings anywhere in the app.
 */

export const COLORS = {
  // ── Surfaces ──────────────────────────────────────────────────────────────
  obsidian:       '#0A0A0A',   // page background
  surface:        '#141414',   // card / sheet background
  surface2:       '#1C1C1C',   // elevated card
  surface3:       '#222222',   // input / toggle background

  // ── Brand: 24k Gold ───────────────────────────────────────────────────────
  gold:           '#D4AF37',
  goldLight:      '#F5D060',
  goldDark:       '#9E8028',
  goldBorder:     '#3A3018',   // subtle gold dividers

  // ── Foreground ────────────────────────────────────────────────────────────
  white:          '#FFFFFF',
  muted:          '#888888',

  // ── Status / semantic ─────────────────────────────────────────────────────
  crimson:        '#C41E3A',   // FOMO / urgency / error
  crimsonLight:   '#E8294A',
  amber:          '#F5A623',   // warning / cash
  green:          '#4CAF50',   // success / clear wallet
  red:            '#FF4444',   // frozen / danger
} as const;

export const TYPOGRAPHY = {
  serif:      'PlayfairDisplay_700Bold',
  serifReg:   'PlayfairDisplay_400Regular',
  bold:       'Inter_700Bold',
  semibold:   'Inter_600SemiBold',
  medium:     'Inter_500Medium',
  regular:    'Inter_400Regular',
} as const;

export const RADIUS = {
  sm:   10,
  md:   14,
  lg:   20,
  xl:   24,
  pill: 999,
} as const;

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

export default { COLORS, TYPOGRAPHY, RADIUS, SPACING };
