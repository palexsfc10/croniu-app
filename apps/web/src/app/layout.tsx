import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import {
  GtmConsentDefaultScript,
  GtmContainerScript,
  GtmNoscriptFallback,
} from "@/components/analytics/gtm-scripts";
import { MetaPixelScripts } from "@/components/analytics/meta-pixel-scripts";
import { ConsentBanner } from "@/components/analytics/consent-banner";
import { RoutePageviewTracker } from "@/components/analytics/route-pageview-tracker";
import "@/components/brand/brand-wordmark.css";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Croniu",
    template: "%s · Croniu",
  },
  description:
    "Organize seus clientes. Simplifique sua rotina. Cadastros, agenda, planos, ciclos e acompanhamentos — com IA no dia a dia.",
  applicationName: "Croniu",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Croniu",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#2f3f8f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * HML/PRD gate for analytics: `CRONIU_ENV=hml` only — set on `croniu-hml-web`
 * (deploy/hml/compose.hml.yaml), deliberately absent on PRD's `web` service
 * (deploy/prd/compose.prd.yaml). Deliberately NOT the request `Host` header
 * (next/headers' `headers()`): that API is per-request and marks the whole
 * route tree dynamic — used here, in the root layout, it would have forced
 * every route in the app (most of which are static today, `/register` and
 * `/termos` included — verified by diffing `next build`'s route table
 * before/after) into server-rendered-on-demand. `/app/dev/design-system`
 * can afford that cost for one rarely-hit route; the whole app can't.
 * `GtmContainerScript`'s inline snippet re-checks `location.hostname` on the
 * client as a second, free (post-hydration, no static-generation cost)
 * layer — see gtm-scripts.tsx.
 */
const isHml = process.env.CRONIU_ENV === "hml";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} h-full`}>
      <head>
        <GtmConsentDefaultScript isHml={isHml} />
        <GtmContainerScript isHml={isHml} />
      </head>
      <body className="min-h-full antialiased">
        <GtmNoscriptFallback isHml={isHml} />
        <RoutePageviewTracker />
        {children}
        <MetaPixelScripts isHml={isHml} />
        <ConsentBanner isHml={isHml} />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
