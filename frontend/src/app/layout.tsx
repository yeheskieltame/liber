import type { Metadata } from "next";
import { newsreader, bricolage } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liber",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${bricolage.variable}`}>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
