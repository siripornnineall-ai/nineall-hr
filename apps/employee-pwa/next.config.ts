import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nineall-hr/design-tokens", "@nineall-hr/shared-types", "@nineall-hr/shared-validation"],
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // Service worker + manifest must be served from the origin root, not hashed/cached like normal assets.
  headers: async () => [
    {
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
    },
  ],
};

export default nextConfig;
