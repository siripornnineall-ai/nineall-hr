/**
 * Font stacks per master prompt section 4: each language uses its own Noto Sans
 * variant so Thai/Lao/Myanmar tone marks and tall glyphs render correctly.
 * `stack` is a fallback chain (browser/OS picks the first family that has a
 * glyph for a given character), used as the default body font so mixed-script
 * text (e.g. a Lao name next to an English label) still renders correctly.
 */
export const fontFamilies = {
  thai: "'Noto Sans Thai', sans-serif",
  english: "'Noto Sans', sans-serif",
  lao: "'Noto Sans Lao', sans-serif",
  myanmar: "'Noto Sans Myanmar', sans-serif",
  stack: "'Noto Sans Thai', 'Noto Sans', 'Noto Sans Lao', 'Noto Sans Myanmar', sans-serif",
} as const;

// 1.6x line-height on body text per DESIGN.md, to avoid tone-mark clipping in TH/LO/MY scripts.
export const typeScale = {
  displayLg: { fontSize: "48px", lineHeight: "1.2", fontWeight: "700" },
  headlineLg: { fontSize: "32px", lineHeight: "1.3", fontWeight: "700" },
  headlineLgMobile: { fontSize: "32px", lineHeight: "1.3", fontWeight: "700" },
  headlineMd: { fontSize: "24px", lineHeight: "1.4", fontWeight: "600" },
  titleLg: { fontSize: "20px", lineHeight: "1.5", fontWeight: "600" },
  bodyLg: { fontSize: "18px", lineHeight: "1.6", fontWeight: "400" },
  bodyMd: { fontSize: "16px", lineHeight: "1.6", fontWeight: "400" },
  labelMd: { fontSize: "14px", lineHeight: "1.4", fontWeight: "500" },
  labelSm: { fontSize: "12px", lineHeight: "1.2", fontWeight: "500" },
  // legacy aliases kept so existing components importing these keys don't break
  h1: { fontSize: "40px", lineHeight: "48px", fontWeight: "700", letterSpacing: "-0.02em" },
  h1Mobile: { fontSize: "32px", lineHeight: "40px", fontWeight: "700" },
  h2: { fontSize: "32px", lineHeight: "40px", fontWeight: "600" },
  h3: { fontSize: "24px", lineHeight: "32px", fontWeight: "600" },
  bodySm: { fontSize: "14px", lineHeight: "20px", fontWeight: "400" },
  dataTable: { fontSize: "14px", lineHeight: "20px", fontWeight: "400" },
} as const;

export type TypeScaleToken = keyof typeof typeScale;
