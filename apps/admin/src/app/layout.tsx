import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "@/components/brand/brand-wordmark.css";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Croniu Admin",
    template: "%s · Croniu Admin",
  },
  description: "Painel administrativo da plataforma Croniu",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2f3f8f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
