import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speedy - Internet speed test",
  description: "A private, browser-based internet speed test powered by Measurement Lab.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
