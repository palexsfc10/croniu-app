import type { NextConfig } from "next";

/** Backend target for /api rewrites (browser stays same-origin — works on mobile/LAN). */
const apiProxyTarget = (
  process.env.API_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://api:8000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/cycles", destination: "/app/cycles", permanent: false },
      { source: "/cycles/:path*", destination: "/app/cycles/:path*", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // microphone=(self): required for Assistente voice input on same-origin HTTPS.
          // Do not use microphone=* — keep camera/geo fully disabled.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/entrar/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/c/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
