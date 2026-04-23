import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cutter Dashboard",
  description: "Video-Cutter Verwaltung & Rechnungen",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
        <div className="fixed bottom-3 right-3 z-50 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm select-none">
          v1.35.0 — Insights Edit-Lock
        </div>
      </body>
    </html>
  );
}
