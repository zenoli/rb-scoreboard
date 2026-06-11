import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { NavBar } from '@/components/nav-bar'
import { LiveStatusProvider } from '@/components/live-status-provider'
import './globals.css'

const GeistSans = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
})

const GeistMono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  adjustFontFallback: false,
  fallback: [
    'ui-monospace',
    'SFMono-Regular',
    'Roboto Mono',
    'Menlo',
    'Monaco',
    'Liberation Mono',
    'DejaVu Sans Mono',
    'Courier New',
    'monospace',
  ],
  weight: '100 900',
})


export const metadata: Metadata = {
  title: 'RB Scoreboard',
  description: 'Fantasy football scoreboard for World Cups',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s===null&&d))document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LiveStatusProvider>
          <NavBar />
          <main className="flex-1">{children}</main>
        </LiveStatusProvider>
      </body>
    </html>
  )
}
