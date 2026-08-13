import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const description =
    "A tactile, constraint-based calendar for fixed events, flexible tasks, and intentions.";
  const socialImage = `${origin}/og-almanac.png`;

  return {
    title: "Syllabi — time, without the rigidity",
    description,
    applicationName: "Syllabi",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Syllabi",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/apple-touch-icon.png",
    },
    openGraph: {
      title: "Syllabi",
      description,
      type: "website",
      url: origin,
      images: [
        {
          url: socialImage,
          width: 1731,
          height: 909,
          alt: "Syllabi Japanese almanac-inspired weekly calendar preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Syllabi",
      description,
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#19181d",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
