import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing engine code from parent directory
  transpilePackages: [],
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  webpack: (config) => {
    // Engine code uses .js extensions in imports (ESM convention with tsx).
    // Webpack needs to resolve these to .ts files.
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
