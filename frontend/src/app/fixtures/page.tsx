'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { FixtureListItem, FixtureParticipant } from '@/lib/types'

const FINISHED_STATES = new Set(['FT', 'AET', 'FT_PEN'])
const LIVE_STATES = new Set([
  'LIVE', 'INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT',
  'INPLAY_ET', 'INPLAY_ET_2ND_HALF', 'PEN_LIVE',
])

function isClickable(fixture: FixtureListItem): boolean {
  return fixture.participants.length > 0
}

function stateLabel(state: string | null): string {
  if (!state) return 'Scheduled'
  if (LIVE_STATES.has(state)) return 'Live'
  if (state === 'FT') return 'FT'
  if (state === 'AET') return 'AET'
  if (state === 'FT_PEN') return 'Penalties'
  return 'Scheduled'
}

function stateVariant(state: string | null): 'default' | 'secondary' | 'outline' {
  if (state && LIVE_STATES.has(state)) return 'default'
  if (state && FINISHED_STATES.has(state)) return 'secondary'
  return 'outline'
}

function TeamDisplay({ team, align }: { team: FixtureParticipant | undefined; align: 'left' | 'right' }) {
  if (!team) return <div className="flex-1" />
  const content = (
    <>
      {team.team_image_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.team_image_path} alt={team.team_name ?? ''} className="w-8 h-8 object-contain flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
          {(team.team_name ?? '??').slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium truncate">{team.team_name ?? 'Unknown'}</span>
    </>
  )
  return (
    <div className={`flex items-center gap-2 flex-1 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {content}
    </div>
  )
}

function FixtureCard({ fixture }: { fixture: FixtureListItem }) {
  const home = fixture.participants.find((p) => p.location === 'home')
  const away = fixture.participants.find((p) => p.location === 'away')
  const clickable = isClickable(fixture)
  const dimmed = !FINISHED_STATES.has(fixture.state ?? '') && !LIVE_STATES.has(fixture.state ?? '')
  const label = stateLabel(fixture.state)
  const variant = stateVariant(fixture.state)

  const dateStr = fixture.starting_at
    ? new Date(fixture.starting_at).toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  const inner = (
    <div
      className={`rounded-lg border p-3 bg-card flex flex-col gap-2 transition-colors${
        clickable ? ' hover:bg-accent cursor-pointer' : ''
      }${dimmed ? ' opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <TeamDisplay team={home} align="left" />
        <span className="text-base font-bold tabular-nums flex-shrink-0 min-w-[3rem] text-center">
          {fixture.home_score != null && fixture.away_score != null
            ? `${fixture.home_score} - ${fixture.away_score}`
            : 'vs'}
        </span>
        <TeamDisplay team={away} align="right" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{dateStr ?? '—'}</span>
        <Badge variant={variant} className="text-xs">
          {variant === 'default' && (
            <span className="mr-1 relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
          )}
          {label}
        </Badge>
      </div>
    </div>
  )

  if (clickable) {
    return <Link href={`/fixtures/${fixture.id}`}>{inner}</Link>
  }
  return inner
}

function groupByDate(fixtures: FixtureListItem[]): { dateLabel: string; fixtures: FixtureListItem[] }[] {
  const map = new Map<string, FixtureListItem[]>()
  for (const f of fixtures) {
    const key = f.starting_at
      ? new Date(f.starting_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'Unknown date'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(f)
  }
  return Array.from(map.entries()).map(([dateLabel, fixtures]) => ({ dateLabel, fixtures }))
}

export default function FixturesPage() {
  const [fixtures, setFixtures] = useState<FixtureListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.fixtures()
      .then(setFixtures)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <div className="max-w-2xl mx-auto px-4 py-8 text-destructive">{error}</div>

  if (!fixtures) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-8 w-24 bg-muted animate-pulse rounded mb-6" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg mb-3" />
        ))}
      </div>
    )
  }

  if (fixtures.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">No fixtures found for this season.</p>
      </div>
    )
  }

  const groups = groupByDate(fixtures)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Fixtures</h1>
      {groups.map(({ dateLabel, fixtures: group }) => (
        <div key={dateLabel} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{dateLabel}</h2>
          {group.map((f) => (
            <FixtureCard key={f.id} fixture={f} />
          ))}
        </div>
      ))}
    </div>
  )
}
