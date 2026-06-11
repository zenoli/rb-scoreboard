'use client'

import Link from 'next/link'
import { Volleyball, Menu } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerClose,
  DrawerTitle,
} from '@/components/ui/drawer'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export function NavBar() {
  return (
    <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
      <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/scoreboard"
          className="flex items-center gap-2 font-semibold text-base tracking-tight"
        >
          <Volleyball size={18} />
          RB Scoreboard - 2026
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
          <Link href="/players" className="hover:text-primary transition-colors">
            Players
          </Link>
          <Link href="/drafts" className="hover:text-primary transition-colors">
            Drafts
          </Link>
          <Link href="/admin" className="hover:text-primary transition-colors">
            Admin
          </Link>
          <ThemeToggle />
        </div>

        {/* Mobile hamburger */}
        <div className="sm:hidden">
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
              <nav className="flex flex-col gap-1 text-base font-medium mt-2">
                <DrawerClose asChild>
                  <Link
                    href="/players"
                    className="px-2 py-3 rounded-md hover:bg-accent transition-colors"
                  >
                    Players
                  </Link>
                </DrawerClose>
                <DrawerClose asChild>
                  <Link
                    href="/drafts"
                    className="px-2 py-3 rounded-md hover:bg-accent transition-colors"
                  >
                    Drafts
                  </Link>
                </DrawerClose>
                <DrawerClose asChild>
                  <Link
                    href="/admin"
                    className="px-2 py-3 rounded-md hover:bg-accent transition-colors"
                  >
                    Admin
                  </Link>
                </DrawerClose>
                <div className="flex items-center justify-between px-2 py-3">
                  <span className="text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
              </nav>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
    </header>
  )
}
