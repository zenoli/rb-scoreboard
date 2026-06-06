import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'RB Scoreboard — WC 2026',
  description: 'Fantasy football scoreboard for World Cup 2026',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s===null&&d))document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
          <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/scoreboard" className="font-semibold text-base tracking-tight">
              ⚽ WC 2026
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/scoreboard" className="hover:text-primary transition-colors">
                Scoreboard
              </Link>
              <Link href="/drafts" className="hover:text-primary transition-colors">
                Drafts
              </Link>
              <Link href="/admin" className="hover:text-primary transition-colors">
                Admin
              </Link>
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  )
}
