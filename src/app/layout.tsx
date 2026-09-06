import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nextfloor",
  description: "A building that grows one generated floor at a time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
