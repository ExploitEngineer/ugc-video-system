import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Neutral, highly legible body face — cleaner than Geist's default look.
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Monospace for deliberate accents: counters, kbd, step numbers, status codes.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Cabinet Grotesk — distinctive display face for headings + wordmark.
// Self-hosted (Fontshare) so it isn't the recognizable Geist/Inter default.
const cabinet = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    {
      path: "./fonts/CabinetGrotesk-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/CabinetGrotesk-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/CabinetGrotesk-Extrabold.woff2",
      weight: "800",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Adverra — AI Product Ad Video Generator",
    template: "%s · Adverra",
  },
  description:
    "Turn a product image and a prompt into a finished ~15s ad video with audio. Cooperating AI agents drive an images → storyboard → video pipeline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} ${cabinet.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
