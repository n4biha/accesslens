import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "AccessLens — We test the task",
  description: "Accessibility preflight for digital learning tasks.",
  openGraph: {
    title: "AccessLens — We test the task",
    description: "We don’t just test the page. We test the task.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "AccessLens — We don’t just test the page. We test the task." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessLens — We test the task",
    description: "Accessibility preflight for digital learning",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
