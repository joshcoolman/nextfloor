import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompt markdown is read from disk at runtime, so it must ship with the build.
  outputFileTracingIncludes: {
    "/api/**": ["./src/lib/prompts/**"],
  },
  // The dev badge defaults to the bottom left, which is where the zoom stepper
  // now lives. Dev-only, but it sits on the readout every time.
  devIndicators: { position: "top-left" },
  experimental: {
    // Floor generation is a long single request: spec + image + one retry.
    proxyTimeout: 300_000,
  },
};

export default nextConfig;
