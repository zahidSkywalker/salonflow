import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Aurelia Salon & Spa — book online",
    template: "%s · Aurelia Salon & Spa",
  },
  description:
    "Aurelia Salon & Spa: online booking, master stylists, color, nails, skin and barbering. Powered by SalonFlow — the salon operating system.",
  keywords: ["salon booking", "barber POS", "salon management", "SalonFlow", "appointment scheduling"],
  openGraph: {
    title: "Aurelia Salon & Spa",
    description: "Where beauty becomes ritual. Book online in 60 seconds.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#2b211b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${manrope.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
