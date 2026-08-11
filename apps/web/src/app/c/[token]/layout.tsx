import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PublicMyCycleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
