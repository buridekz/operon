import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let the specialist's phone open the dev server through a Cloudflare quick tunnel.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
