import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { SITE, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

const bengali = Hind_Siliguri({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
});

const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE.name,
  keywords: [
    "SQL শিখুন",
    "SQL বাংলা",
    "SQL Playground",
    "SQLite",
    "বাংলায় SQL টিউটোরিয়াল",
    "SQL অনুশীলন",
    "JOIN",
    "GROUP BY",
    "learn SQL in Bengali",
    "Bangla SQL",
  ],
  authors: [{ name: "msilabs", url: "https://msilabs.github.io" }],
  creator: "msilabs",
  alternates: { canonical: SITE.url },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "bn_BD",
    images: [{ url: SITE.image, width: 1280, height: 640, alt: SITE.imageAlt, type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: SITE.image, alt: SITE.imageAlt }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14213D",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme পেজ আঁকার আগে script বসায়, তাই React-এর HTML-এর সাথে না মেলাটা প্রত্যাশিত
    <html lang="bn" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${bengali.variable} ${code.variable} antialiased`}>{children}</body>
    </html>
  );
}
