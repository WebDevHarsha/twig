import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
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
  title: "TWIG — the AI-agent-native data marketplace",
  description:
    "Ready-made and custom-built datasets that AI agents can't find anywhere else. API benchmarks, uptime history, regional performance — and bespoke collection on demand.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <footer className="border-t hairline py-8 mt-16">
          <div className="container-x flex flex-col gap-2 text-sm text-sand-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} TWIG — demo deployment for evaluation.</p>
            <p className="text-xs">
              Payment runs on the PayPal Sandbox. Marketplace sample records are
              simulated demo data.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
