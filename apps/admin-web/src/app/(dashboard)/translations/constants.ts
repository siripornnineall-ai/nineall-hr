export const LOCALES = ["th", "en", "lo", "my"] as const;
export type Locale = (typeof LOCALES)[number];
