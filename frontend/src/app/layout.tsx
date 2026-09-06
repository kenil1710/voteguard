import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://voteguard.vercel.app"),
  title: {
    default: "VoteGuard — every proposal deserves a second opinion",
    template: "%s · VoteGuard",
  },
  description:
    "An on-chain risk oracle for DAO governance proposals. Five GenLayer validators independently read a Snapshot, Tally or forum proposal and agree on an assessment across five dimensions.",
  openGraph: {
    title: "VoteGuard — every proposal deserves a second opinion",
    description:
      "An on-chain risk oracle for DAO governance proposals, read and agreed by five independent validators.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
