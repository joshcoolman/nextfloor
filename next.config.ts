import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompt markdown is read from disk at runtime, so it must ship with the build.
  outputFileTracingIncludes: {
    "/api/**": ["./src/lib/prompts/**"],
  },
  experimental: {
    // Floor generation is a long single request: spec + image + one retry.
    proxyTimeout: 300_000,
  },
};

export default nextConfig;
