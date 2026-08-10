export const radius = {
  sm: "0.25rem",
  DEFAULT: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  full: "9999px",
} as const;

export const spacing = {
  base: "8px",
  containerPaddingMobile: "16px",
  containerPaddingDesktop: "32px",
  gutter: "24px",
  sectionGap: "48px",
} as const;

export const layout = {
  sidebarWidth: "260px",
  minTouchTarget: "48px",
  bottomNavHeight: "64px",
} as const;

export const shadow = {
  card: "0px 2px 4px rgba(0,0,0,0.05)",
  overlay: "0px 10px 20px rgba(0,0,0,0.1)",
} as const;

export const locale = {
  defaultLanguage: "th",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "HH:mm",
  timezone: "Asia/Bangkok",
  currency: "THB",
} as const;
