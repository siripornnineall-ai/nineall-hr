import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@nineall-hr/design-tokens",
    "@nineall-hr/payroll-engine",
    "@nineall-hr/shared-types",
    "@nineall-hr/shared-validation",
  ],
  // @sparticuz/chromium ships a native Linux binary and puppeteer-core does its own
  // dynamic module loading — both break if Next.js tries to bundle/trace them like
  // regular JS. Keeping them external makes the serverless function just `require()`
  // them at runtime instead, which is what @sparticuz/chromium's own docs call for.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
