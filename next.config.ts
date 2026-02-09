import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Do NOT use output: 'standalone' with Amplify Hosting.
  // Amplify has its own SSR adapter and the standalone folder creates
  // a large duplicate (~180MB) of server code + node_modules inside .next.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/aws-cdk-lib/**',
      'node_modules/aws-cdk/**',
      'node_modules/@aws-cdk/**',
      'node_modules/constructs/**',
      'node_modules/esbuild/**',
      'node_modules/@esbuild/**',
      'node_modules/typescript/**',
    ],
  },
};

export default nextConfig;
