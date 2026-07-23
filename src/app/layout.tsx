import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "Honey Bunny — Your AI Companion",
    template: "%s | Honey Bunny",
  },
  description:
    "Create your personalized AI companion. Chat, connect, and build something sweet with a character made just for you.",
  keywords: ["AI companion", "virtual companion", "AI chat", "personalized AI"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: "Honey Bunny — Your AI Companion",
    description: "Create your personalized AI companion. Chat, connect, and build something sweet with a character made just for you.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0a0a0f] text-[#fff8ee] antialiased">
        {children}
      </body>
    </html>
  );
}
