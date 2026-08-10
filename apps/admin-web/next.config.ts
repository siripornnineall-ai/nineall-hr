import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@nineall-hr/design-tokens",
    "@nineall-hr/payroll-engine",
    "@nineall-hr/shared-types",
    "@nineall-hr/shared-validation",
  ],
};

export default nextConfig;
