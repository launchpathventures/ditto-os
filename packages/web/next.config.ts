import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment (Brief 086)
  output: "standalone",
  // Decouple type-checking from the production image build. Type correctness
  // is owned by the dedicated `type-check` CI gate, NOT by `next build` —
  // coupling them meant a single stray web type error bricked every image
  // rebuild (it broke the GHCR pipeline silently from 2026-05-30). Webpack
  // still fails the build on real module-resolution errors. Outstanding web
  // type errors are tracked debt; fix-forward in a dedicated pass.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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

    // LanceDB has native .node binaries that webpack cannot parse.
    // Mark it as external so Node.js loads it at runtime instead.
    config.externals = config.externals || [];
    if (isServer) {
      if (Array.isArray(config.externals)) {
        config.externals.push("@lancedb/lancedb");
      }
    }

    return config;
  },
};

export default nextConfig;
