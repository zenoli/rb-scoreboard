'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import type { ScoreboardResponse, UserScore } from '@/lib/types'

const POLL_INTERVAL = 60_000

function fmt(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)
}

export default function ScoreboardPage() {
  const router = useRouter()
  const [data, setData] = useState<ScoreboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function load() {
    try {
      const res = await api.scores()
      setData(res)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scores')
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center text-destructive">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded mb-2" />
        ))}
      </div>
    )
  }

  const users = data.users.filter((u) => u.is_active)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Scoreboard</h1>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Mobile: card list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {users.map((u, i) => (
          <button
            key={u.user_id}
            onClick={() => router.push(`/scoreboard/${u.user_id}`)}
            className="w-full text-left rounded-lg border p-4 bg-card hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground w-5">{i + 1}</span>
                <span className="font-semibold">{u.username}</span>
              </div>
              <span className="text-lg font-bold">{fmt(u.total)}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 text-xs text-muted-foreground pl-8">
              <div className="text-center">
                <div className="font-medium text-foreground">{fmt(u.goals)}</div>
                <div>⚽</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-foreground">{fmt(u.assists)}</div>
                <div>🅰️</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-foreground">{fmt(u.yellow_cards)}</div>
                <div>🟨</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-foreground">{fmt(u.red_cards)}</div>
                <div>🟥</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-foreground">{fmt(u.clean_sheets)}</div>
                <div>🧤</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-center">⚽ Goals</TableHead>
              <TableHead className="text-center">🅰️ Assists</TableHead>
              <TableHead className="text-center">🟨 Yellow</TableHead>
              <TableHead className="text-center">🟥 Red</TableHead>
              <TableHead className="text-center">🧤 Clean</TableHead>
              <TableHead className="text-right font-bold">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u, i) => (
              <TableRow
                key={u.user_id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => router.push(`/scoreboard/${u.user_id}`)}
              >
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-semibold">{u.username}</TableCell>
                <TableCell className="text-center">{fmt(u.goals)}</TableCell>
                <TableCell className="text-center">{fmt(u.assists)}</TableCell>
                <TableCell className="text-center">{fmt(u.yellow_cards)}</TableCell>
                <TableCell className="text-center">{fmt(u.red_cards)}</TableCell>
                <TableCell className="text-center">{fmt(u.clean_sheets)}</TableCell>
                <TableCell className="text-right font-bold">{fmt(u.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
