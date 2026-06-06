import type { Metadata } from "next";
import { Geist_Mono, Lora, Manrope } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
import "./globals.css";

const manrope = Manrope({
  variable: "--next-font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--next-font-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--next-font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Dastarkhwan Recommendations",
  description: "Community food recommendations from people who remember the meal.",
  icons: {
    icon: [{ url: "/brand-peacock-icon.png", type: "image/png" }],
    apple: [{ url: "/brand-peacock-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body>
        <AppNav />
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
