import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Floor generation is a long single request: spec + image + one retry.
    proxyTimeout: 300_000,
  },
};

export default nextConfig;
