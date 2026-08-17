import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@nineall-hr/design-tokens",
    "@nineall-hr/payroll-engine",
    "@nineall-hr/shared-types",
    "@nineall-hr/shared-validation",
  ],
  // The payslip PDF generator loads a font file via a computed `path.join(process.cwd(), ...)`
  // path, which Next's build-time file tracer can't statically follow — without this, the
  // font wouldn't be bundled into the Vercel serverless function and PDF generation would
  // fail in production despite working locally.
  outputFileTracingIncludes: {
    "/payroll/**": ["./src/lib/pdf/fonts/**"],
  },
};

export default nextConfig;
