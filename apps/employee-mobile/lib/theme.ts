import { colors } from "@nineall-hr/design-tokens";

export const theme = {
  colors: {
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    primaryContainer: colors.primaryContainer,
    surface: colors.surface,
    surfaceCream: colors.backgroundCream,
    surfaceContainer: colors.surfaceContainer,
    surfaceContainerLowest: colors.surfaceContainerLowest,
    onSurface: colors.onSurface,
    onSurfaceVariant: colors.onSurfaceVariant,
    outlineVariant: colors.outlineVariant,
    tertiary: colors.tertiary,
    secondary: colors.secondary,
    success: colors.statusSuccess,
    successBg: colors.statusSuccessBg,
    warning: colors.statusWarning,
    warningBg: colors.statusWarningBg,
    danger: colors.statusDanger,
    dangerBg: colors.statusDangerBg,
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  minTouchTarget: 48,
} as const;
