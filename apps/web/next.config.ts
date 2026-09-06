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
      // Conta + Configurações fatia (2026-09-03): these 6 screens moved
      // under the unified /app/settings area. Old links/bookmarks (nudge
      // banners, the manual, external references) keep working.
      // /app/billing/return/[mode] is NOT touched — exact-match source only.
      { source: "/app/account", destination: "/app/settings/account", permanent: false },
      { source: "/app/billing", destination: "/app/settings/billing", permanent: false },
      { source: "/app/help", destination: "/app/settings/help", permanent: false },
      {
        source: "/app/profile/professional",
        destination: "/app/settings/workspace",
        permanent: false,
      },
      { source: "/app/preferences", destination: "/app/settings/workspace", permanent: false },
      { source: "/app/availability", destination: "/app/settings/workspace", permanent: false },
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
        // Secret-link routes (portal token in the path): the metadata API's
        // <meta name="robots"/"referrer"> tags already cover crawlers/browsers
        // that parse HTML, but these headers apply even to non-HTML fetches
        // and don't depend on the page rendering — same defense-in-depth
        // pattern already used on the public API responses for these tokens.
        source: "/entrar/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/c/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
