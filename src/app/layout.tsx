import type { Metadata } from "next";
import { Playfair_Display, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aurelia Salon & Spa — Book your ritual | SalonFlow",
  description:
    "Aurelia Salon & Spa: online booking, master stylists, color, nails, skin and barbering. Powered by SalonFlow — the salon operating system.",
  keywords: ["salon booking", "barber POS", "salon management", "SalonFlow", "appointment scheduling"],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Aurelia Salon & Spa",
    description: "Where beauty becomes ritual. Book online in 60 seconds.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${playfair.variable} ${manrope.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
