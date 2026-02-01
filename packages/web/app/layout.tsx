import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "rye - Claude Code Usage Leaderboard",
  description:
    "Track and compare Claude Code usage across developers. See who's using the most tokens and spending the most on AI coding assistance.",
  keywords: ["Claude", "Claude Code", "AI", "leaderboard", "usage", "tokens", "rye"],
  openGraph: {
    title: "rye - Claude Code Usage Leaderboard",
    description: "Track and compare Claude Code usage across developers",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0f] text-gray-100`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
