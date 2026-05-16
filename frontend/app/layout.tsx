import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinanceAI — Conseiller Financier IA",
  description: "Votre conseiller financier IA personnel — analyses, rapports et alertes en temps réel",
  manifest: "/manifest.json",
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased bg-[#f8f9fa] text-[#1a1a1a]">
        {children}
      </body>
    </html>
  );
}
