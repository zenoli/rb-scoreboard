'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

  // Collapsible flag grid state
  const [flagsExpanded, setFlagsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragDelta, setDragDelta] = useState(0)
  const flagGridRef = useRef<HTMLDivElement>(null)
  const [gridMeasurements, setGridMeasurements] = useState<{
    collapsedHeight: number
    fullHeight: number
    fadeHeight: number
  } | null>(null)

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

  // Measure the flag grid to determine collapsed height
  useEffect(() => {
    const grid = flagGridRef.current
    if (!grid) return
    const children = grid.children
    if (children.length <= 8) {
      setGridMeasurements(null)
      return
    }
    const measure = () => {
      const gridRect = grid.getBoundingClientRect()
      const firstItem = children[0] as HTMLElement
      const secondRowItem = children[8] as HTMLElement
      const itemHeight = firstItem.offsetHeight
      const collapsedHeight = (secondRowItem.getBoundingClientRect().top - gridRect.top) + itemHeight * 0.5
      const fullHeight = grid.scrollHeight
      setGridMeasurements({ collapsedHeight, fullHeight, fadeHeight: itemHeight * 1.5 })
    }
    requestAnimationFrame(measure)
  }, [countries])

  // Auto-expand when a hidden flag is selected
  useEffect(() => {
    if (countryFilter == null || !gridMeasurements) return
    const index = countries.findIndex((c) => c.id === countryFilter)
    if (index >= 8) setFlagsExpanded(true)
  }, [countryFilter, countries, gridMeasurements])

  // Drag handler — uses document listeners to avoid stale closures
  function handleDragStart(e: React.PointerEvent) {
    if (!gridMeasurements) return
    e.preventDefault()
    const startY = e.clientY
    const expanded = flagsExpanded
    const range = gridMeasurements.fullHeight - gridMeasurements.collapsedHeight
    let lastDelta = 0

    setIsDragging(true)

    function onMove(ev: PointerEvent) {
      const delta = ev.clientY - startY
      lastDelta = expanded
        ? Math.max(-range, Math.min(0, delta))
        : Math.max(0, Math.min(range, delta))
      setDragDelta(lastDelta)
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)

      const threshold = range * 0.3
      if (expanded) {
        if (Math.abs(lastDelta) > threshold) setFlagsExpanded(false)
      } else {
        if (lastDelta > threshold) setFlagsExpanded(true)
      }

      setDragDelta(0)
      setIsDragging(false)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // Computed flag grid styles
  const shouldCollapse = gridMeasurements != null
  const currentFlagHeight = gridMeasurements
    ? Math.max(
        gridMeasurements.collapsedHeight,
        Math.min(
          gridMeasurements.fullHeight,
          (flagsExpanded ? gridMeasurements.fullHeight : gridMeasurements.collapsedHeight) + dragDelta
        )
      )
    : undefined

  const isFullyExpanded =
    gridMeasurements != null &&
    currentFlagHeight != null &&
    currentFlagHeight >= gridMeasurements.fullHeight - 1

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
        <div className="mb-4">
          <div className="relative">
          <div
            ref={flagGridRef}
            style={
              shouldCollapse
                ? {
                    maxHeight: currentFlagHeight != null ? `${currentFlagHeight}px` : undefined,
                    overflow: 'hidden',
                    transition: isDragging ? 'none' : 'max-height 250ms ease-out',
                  }
                : undefined
            }
            className="grid grid-cols-8 gap-x-3 gap-y-2.5 p-1 -m-1"
          >
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
          {shouldCollapse && (
            <div
              className="absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-250 ease-out"
              style={{
                height: gridMeasurements ? `${gridMeasurements.fadeHeight}px` : 0,
                background: 'linear-gradient(to bottom, transparent, var(--background))',
                opacity: isFullyExpanded ? 0 : 1,
              }}
            />
          )}
          </div>
          {shouldCollapse && (
            <div
              className="flex justify-center pt-2 cursor-grab active:cursor-grabbing touch-none select-none"
              onPointerDown={handleDragStart}
            >
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
            </div>
          )}
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
