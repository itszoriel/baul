import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { BRAND, DEVELOPER } from "@/lib/copy";
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
  applicationName: BRAND.name,
  title: "Baul — a private treasure chest for your memories",
  description: `${BRAND.pronunciation} A private, key-gated space where two people — or your whole circle — keep notes, photos, letters, and a shared soundtrack. ${BRAND.tagline}`,
  authors: [{ name: `${DEVELOPER.name} (${DEVELOPER.handle})`, url: DEVELOPER.url }],
  creator: `${DEVELOPER.name} (${DEVELOPER.handle})`,
  publisher: DEVELOPER.name,
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Baul",
    title: "Baul — a private treasure chest for your memories",
    description: "A private, key-gated place for notes, photos, letters, and a shared soundtrack.",
    images: [{
      url: "/baul-social.png",
      width: 1200,
      height: 630,
      alt: "Baul — a woven B-shaped treasure chest for private memories",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Baul — a private treasure chest for your memories",
    description: "A private, key-gated place for notes, photos, letters, and a shared soundtrack.",
    images: [{
      url: "/baul-social.png",
      alt: "Baul — a woven B-shaped treasure chest for private memories",
    }],
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
