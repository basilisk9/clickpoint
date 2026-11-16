import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FeedbackButton } from "@/components/FeedbackButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "clickpoint.",
  description: "Turn your notes into a pathway you can finish.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="grid-page">
        {children}
        <FeedbackButton />
      </body>
    </html>
  );
}
