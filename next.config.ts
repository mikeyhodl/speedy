import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const allowedDevOrigins = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address?.family === "IPv4" && !address.internal)
  .map((address) => address!.address);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
};

export default nextConfig;
