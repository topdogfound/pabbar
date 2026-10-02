import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

const assetsBase = new URL(process.env.ASSETS_BASE_URL ?? backendUrl);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: assetsBase.protocol.replace(":", "") as "http" | "https",
        hostname: assetsBase.hostname,
        port: assetsBase.port,
        pathname: "/uploads/**",
      },
    ],
  },
  // Same-origin API: the browser calls /api/*, so the session cookie is
  // first-party and no CORS is needed.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/:path*` },
      // Uploaded avatars: same-origin /uploads/* resolves against the backend.
      { source: "/uploads/:path*", destination: `${backendUrl}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
