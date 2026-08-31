import type { Metadata } from "next";
import { Anton, Libre_Franklin, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

const franklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-franklin",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The RBB | League History",
  description: "Ten seasons of matchups, lineups, standings, and drafts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${anton.variable} ${franklin.variable} ${plexMono.variable}`}>
      <body className="font-body min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 bg-coffee text-cream border-b-4 border-burnt">
          <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
            <Link href="/" className="font-display text-2xl tracking-wide chalk-shadow">
              THE RISKY BISCUIT <span className="text-burnt">BRIGADE</span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm font-semibold uppercase tracking-wide">
              <Link href="/power-rankings" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Power Rankings</Link>
              <Link href="/standings" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Seasons</Link>
              <Link href="/matchups" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Matchups</Link>
              <Link href="/lineups" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Lineups</Link>
              <Link href="/players" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Players</Link>
              <Link href="/draft" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Drafts</Link>
              <Link href="/trades" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Trades</Link>
              <Link href="/history" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">Records</Link>
              <Link href="/draft-info" className="px-3 py-2 rounded hover:bg-white/10 transition-colors">2026 Draft Info</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-coffee text-cream/70 text-xs text-center py-6 font-mono">
          Est. 2016 &middot; Ten seasons served, and counting.
        </footer>
      </body>
    </html>
  );
}
