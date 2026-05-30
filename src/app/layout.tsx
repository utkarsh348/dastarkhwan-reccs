import type { Metadata } from "next";
import { Amiri, Fraunces, Geist, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const amiri = Amiri({
  variable: "--font-display",
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Dastarkhwan Recommendations",
  description: "City-wise food recommendations from the Dastarkhwan community.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${amiri.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
