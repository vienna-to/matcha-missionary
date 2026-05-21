import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matcha Missionary — Pop-Up Ops",
  description: "Internal ops tool for matcha pop-up events.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-cream-50 text-matcha-900 font-sans">{children}</body>
    </html>
  );
}
