/**
 * Nineall HR design tokens — colors.
 * Source of truth: stitch_nineall_hr_unified_management_system/nineall_hr/DESIGN.md
 * (Stitch M3 token export) reconciled against Claude_Master_Prompt_Nineall_HR_Web_Android_iOS.md
 * section 4's explicit brand hex list — see STITCH_AUDIT.md "Design token reconciliation"
 * for the two places they disagreed and which one won.
 * Do not change `primary`/`secondary`/the logo away from these values without explicit sign-off.
 */
export const colors = {
  surface: "#faf9fa",
  surfaceDim: "#dadadb",
  surfaceBright: "#faf9fa",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f4f3f4",
  surfaceContainer: "#eeedee",
  surfaceContainerHigh: "#e9e8e9",
  surfaceContainerHighest: "#e3e2e3",
  onSurface: "#263638",
  onSurfaceVariant: "#6f7778",
  inverseSurface: "#2f3032",
  inverseOnSurface: "#f1f0f1",
  outline: "#e5e1e6",
  outlineVariant: "#e5e1e6",
  surfaceTint: "#a83e30",

  // Primary Terracotta — buttons, active nav states, primary toggles
  primary: "#c54b38",
  onPrimary: "#ffffff",
  primaryContainer: "#a83e30",
  onPrimaryContainer: "#fff9f8",
  inversePrimary: "#ffb4a7",

  // Deep Teal — sidebar / nav header backgrounds, headline authority color
  secondary: "#003942",
  onSecondary: "#ffffff",
  secondaryContainer: "#37656f",
  onSecondaryContainer: "#bbeaf6",

  tertiary: "#106752",
  onTertiary: "#ffffff",
  tertiaryContainer: "#33806a",
  onTertiaryContainer: "#ebfff5",

  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",

  primaryFixed: "#ffdad4",
  primaryFixedDim: "#ffb4a7",
  onPrimaryFixed: "#400200",
  onPrimaryFixedVariant: "#881f11",
  secondaryFixed: "#bbeaf6",
  secondaryFixedDim: "#a0ced9",
  onSecondaryFixed: "#001f25",
  onSecondaryFixedVariant: "#1d4d56",
  tertiaryFixed: "#a5f2d7",
  tertiaryFixedDim: "#89d5bb",
  onTertiaryFixed: "#002118",
  onTertiaryFixedVariant: "#00513f",

  background: "#f8f7f8",
  backgroundCream: "#f8f7f8",
  onBackground: "#263638",
  surfaceVariant: "#e3e2e3",

  sidebar: "#003942",

  // Semantic status colors — master prompt section 4 "สีสถานะ"
  statusSuccess: "#2f7d67",
  statusSuccessBg: "#e2f1ec",
  statusWarning: "#d89b3c",
  statusWarningBg: "#fbf0df",
  statusDanger: "#b33a3a",
  statusDangerBg: "#f8e5e5",
  statusInfo: "#3f7ca6",
  statusInfoBg: "#e5eff5",
  statusHoliday: "#80639b",
  statusHolidayBg: "#f0ebf4",
  statusInactive: "#8a8a8a",
  statusInactiveBg: "#ededed",

  rowHoverTint: "#f8f2f1",
  rowZebra: "#f9f9f9",
} as const;

export type ColorToken = keyof typeof colors;
