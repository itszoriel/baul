import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/copy";
import { appUrl } from "@/lib/env";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: "Baul — a private treasure chest for your memories",
  description: `${BRAND.pronunciation} A private, key-gated space where two people — or your whole circle — keep notes, photos, letters, and a shared soundtrack. ${BRAND.tagline}`,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Baul",
    title: "Baul — a private treasure chest for your memories",
    description: "A private, key-gated place for notes, photos, letters, and a shared soundtrack.",
  },
  twitter: {
    card: "summary",
    title: "Baul — a private treasure chest for your memories",
    description: "A private, key-gated place for notes, photos, letters, and a shared soundtrack.",
  },
};

// Mobile-first: fit content edge-to-edge on notched phones; allow zoom (a11y).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17130f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-night text-starlight">{children}</body>
    </html>
  );
}
