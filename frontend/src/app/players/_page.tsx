'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { PlayerResponse } from '@/lib/types'

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const

function formatPoints(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1)
}

export default function PlayersPage() {
  const router = useRouter()
  const [players, setPlayers] = useState<PlayerResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState<number | null>(null)
  const [positionFilter, setPositionFilter] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.players({ include_points: true })
      .then((data: PlayerResponse[]) => setPlayers(data))
      .catch((e: Error) => setError(e.message))
  }, [])

  const countries = useMemo(() => {
    if (!players) return []
    const seen = new Map<number, { id: number; name: string; image_path: string | null; short_code: string | null }>()
    for (const p of players) {
      if (p.team_id != null && !seen.has(p.team_id)) {
        seen.set(p.team_id, {
          id: p.team_id,
          name: p.team_name ?? '',
          image_path: p.team_image_path,
          short_code: p.team_short_code,
        })
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [players])

  const filtered = useMemo(() => {
    if (!players) return []
    return players
      .filter((p) => positionFilter.size === 0 || (p.position_category != null && positionFilter.has(p.position_category)))
      .filter((p) => countryFilter == null || p.team_id === countryFilter)
      .filter((p) => !search || (p.display_name ?? '').toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
  }, [players, positionFilter, countryFilter, search])

  function togglePosition(pos: string) {
    setPositionFilter((prev) => {
      const next = new Set(prev)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      return next
    })
  }

  const loading = !players && !error

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Players</h1>

      {error && <p className="text-destructive">{error}</p>}

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCountryFilter(null) }}
          className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring pr-8"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Position filter */}
      <div className="flex gap-2 mb-3">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => togglePosition(pos)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              positionFilter.has(pos)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Country flags */}
      {!loading && countries.length > 0 && (
        <div className="grid grid-cols-8 gap-x-3 gap-y-2.5 mb-4">
          {countries.map((country) => {
            const isSelected = countryFilter === country.id
            return (
              <button
                key={country.id}
                onClick={() => setCountryFilter(isSelected ? null : country.id)}
                title={country.name}
                className="flex flex-col items-center gap-0.5"
              >
                <div className={`w-10 h-10 rounded-full overflow-hidden transition-all ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                  {country.image_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={country.image_path} alt={country.name} className="w-full h-full object-cover scale-150" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-[11px] font-medium">
                      {country.short_code ?? country.name.slice(0, 3).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[11px] leading-none text-muted-foreground">
                  {country.short_code ?? country.name.slice(0, 3).toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-2 mt-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Player list */}
      {!loading && !error && (
        <div className="flex flex-col gap-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No players found.</p>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/player/${p.id}`)}
              className="flex items-center gap-3 rounded-lg border p-2.5 text-left hover:bg-accent transition-colors w-full"
            >
              <PlayerIcon
                imagePath={p.image_path}
                name={p.display_name}
                teamImagePath={p.team_image_path}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.display_name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{p.team_name}</span>
                  {p.drafted_by_username && (
                    <span className="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 flex-shrink-0">
                      Drafted by {p.drafted_by_username}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-sm font-semibold">
                  {p.total_points != null ? formatPoints(p.total_points) : '0'}
                </div>
                <div className="text-xs text-muted-foreground">pts</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
