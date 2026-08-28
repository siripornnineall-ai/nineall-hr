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
  // @sparticuz/chromium's actual binary payload (bin/*.br) is resolved at runtime via
  // dynamic path construction, not a static require(), so Next's file tracer never sees
  // it and the deployed function is missing "node_modules/@sparticuz/chromium/bin"
  // entirely. Must be included explicitly for every route that generates a payslip PDF.
  outputFileTracingIncludes: {
    "/payroll/**": ["../../node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
