import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Short commit id of this build, shown at the bottom of the task board so we can tell which version a phone is running.
  env: { NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7) },
  transpilePackages: ["@nineall-hr/design-tokens", "@nineall-hr/shared-types", "@nineall-hr/shared-validation"],
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // @sparticuz/chromium's actual binary payload (bin/*.br) is resolved at runtime via
  // dynamic path construction, not a static require(), so Next's file tracer never sees
  // it and Vercel's deployed function is missing "node_modules/@sparticuz/chromium/bin"
  // entirely — the exact error this fixes. Must be included explicitly per route.
  outputFileTracingIncludes: {
    "/certificate": ["../../node_modules/@sparticuz/chromium/bin/**"],
  },
  // Service worker + manifest must be served from the origin root, not hashed/cached like normal assets.
  headers: async () => [
    {
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
    },
  ],
};

export default nextConfig;
