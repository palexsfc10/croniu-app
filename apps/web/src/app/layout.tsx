import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
