import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // better-sqlite3 and pino are already external by default; the Google SDK is large and Node-only.
  serverExternalPackages: ["@googleapis/calendar", "google-auth-library"],
};

export default nextConfig;
