import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Two independent production builds exercise a real worker upgrade locally.
  distDir: process.env.OFFLINE_TEST_DIST_DIR || ".next",
  async headers() {
    return ["/offline-sw.js", "/offline-assets.json"].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }));
  },
};

export default nextConfig;
