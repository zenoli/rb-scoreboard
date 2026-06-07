import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  allowedDevOrigins: ["192.168.1.232", "192.168.1.5"],
};

export default nextConfig;
