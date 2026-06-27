'use client'

import Link from 'next/link'
import { Volleyball, Menu, Trophy, Users, ClipboardList, Settings, Radio, CalendarDays, Sparkles } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { useLiveStatus } from '@/components/live-status-provider'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerClose,
  DrawerTitle,
} from '@/components/ui/drawer'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

const navItems = [
  { href: '/live', label: 'Live', icon: Radio, live: true },
  { href: '/scoreboard', label: 'Scoreboard', icon: Trophy },
  { href: '/fixtures', label: 'Fixtures', icon: CalendarDays },
  { href: '/players', label: 'Players', icon: Users },
  { href: '/drafts', label: 'Drafts', icon: ClipboardList },
  { href: '/optimal-draft', label: 'Optimal Draft', icon: Sparkles },
  { href: '/admin', label: 'Admin', icon: Settings },
]

export function NavBar() {
  const isLive = useLiveStatus()

  return (
    <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
      <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/scoreboard"
          className="flex items-center gap-2 font-semibold text-base tracking-tight"
        >
          <Volleyball size={18} />
          RB Scoreboard
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
          {navItems.map(({ href, label, icon: Icon, live }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Icon size={15} />
              {label}
              {live && isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              )}
            </Link>
          ))}
          <ThemeToggle />
        </div>

        {/* Mobile hamburger */}
        <div className="sm:hidden flex items-center gap-1">
          <ThemeToggle />
          <Drawer direction="top">
            <DrawerTrigger asChild>
              <button
                className="p-1.5 rounded-md hover:bg-accent transition-colors"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </DrawerTrigger>
            <DrawerContent className="px-4 pb-6 pt-4" aria-describedby={undefined}>
              <VisuallyHidden><DrawerTitle>Navigation menu</DrawerTitle></VisuallyHidden>
              <nav className="flex flex-col gap-1 text-base font-medium">
                <div className="flex items-center justify-between">
                  <DrawerClose asChild>
                    <Link
                      href="/live"
                      className="flex items-center gap-3 px-2 py-3 rounded-md hover:bg-accent transition-colors flex-1"
                    >
                      <Radio size={18} />
                      Live
                      {isLive && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                      )}
                    </Link>
                  </DrawerClose>
                  <ThemeToggle />
                </div>
                {navItems.slice(1).map(({ href, label, icon: Icon }) => (
                  <DrawerClose key={href} asChild>
                    <Link
                      href={href}
                      className="flex items-center gap-3 px-2 py-3 rounded-md hover:bg-accent transition-colors"
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  </DrawerClose>
                ))}
              </nav>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
    </header>
  )
}
