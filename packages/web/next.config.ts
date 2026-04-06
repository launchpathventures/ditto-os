import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment (Brief 086)
  output: "standalone",
  // Disable gzip compression — it buffers small streaming chunks,
  // preventing text-delta events from reaching the browser incrementally.
  compress: false,
  // Allow importing engine code from parent directory
  transpilePackages: [],
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  webpack: (config, { isServer }) => {
    // Engine code uses .js extensions in imports (ESM convention with tsx).
    // Webpack needs to resolve these to .ts files.
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    // agentmail SDK has an optional dynamic import of @x402/fetch (crypto payments)
    // that webpack tries to resolve at compile time and fails. Ignore it.
    if (isServer) {
      config.resolve.alias = config.resolve.alias || {};
      (config.resolve.alias as Record<string, string | false>)["@x402/fetch"] = false;
    }

    return config;
  },
};

export default nextConfig;
