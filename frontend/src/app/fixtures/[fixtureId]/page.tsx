'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Target,
  Handshake,
  Layers2,
  Shield,
  ChevronLeft,
  type LucideProps,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { FixtureDetailResponse, FixturePlayer, LiveScoreEvent } from '@/lib/types'

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

const LIVE_STATES = new Set([
  'LIVE', 'INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT',
  'INPLAY_ET', 'INPLAY_ET_2ND_HALF', 'PEN_LIVE',
])

function stateLabel(state: string | null): string {
  if (!state) return ''
  if (LIVE_STATES.has(state)) return 'Live'
  if (state === 'FT') return 'FT'
  if (state === 'AET') return 'AET'
  if (state === 'FT_PEN') return 'Penalties'
  return state
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

type CategoryKey = 'goal' | 'assist' | 'booking' | 'clean_sheet'

type CategoryMeta = {
  label: string
  icon: (props: LucideProps) => React.ReactNode
  eventTypes: LiveScoreEvent['event_type'][]
}

const CATEGORIES: { key: CategoryKey; meta: CategoryMeta }[] = [
  { key: 'goal', meta: { label: 'Goal', icon: Target, eventTypes: ['goal'] } },
  { key: 'assist', meta: { label: 'Assist', icon: Handshake, eventTypes: ['assist'] } },
  { key: 'booking', meta: { label: 'Booking', icon: Layers2, eventTypes: ['yellow_card', 'red_card'] } },
  { key: 'clean_sheet', meta: { label: 'Clean Sheet', icon: Shield, eventTypes: ['clean_sheet'] } },
]

const BOOKING_BADGE: Partial<Record<LiveScoreEvent['event_type'], { label: string }>> = {
  yellow_card: { label: 'Yellow' },
  red_card: { label: 'Red' },
}

function fmtPts(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function FixturePlayerPin({ player }: { player: FixturePlayer }) {
  const showPointsBadge = player.points > 0

  return (
    <Link href={`/player/${player.player_id}`} className="flex flex-col items-center gap-1">
      <PlayerIcon
        imagePath={player.image_path}
        name={player.display_name}
        teamImagePath={player.team_image_path}
        pointsLabel={showPointsBadge ? fmtPts(player.points) : undefined}
        size={48}
        avatarClassName="ring-2 ring-white shadow-md"
      />
      <span className="text-[10px] text-white font-medium text-center leading-tight max-w-[64px] truncate drop-shadow mt-2.5">
        {player.display_name?.split(' ').pop() ?? ''}
      </span>
      <span className="text-[9px] text-white/70 font-medium text-center leading-tight max-w-[64px] truncate drop-shadow">
        {player.drafted_by_username}
      </span>
    </Link>
  )
}

function FixtureRow({ players }: { players: FixturePlayer[] }) {
  return (
    <div className="flex justify-around items-start py-2">
      {players.map((p) => (
        <FixturePlayerPin key={p.player_id} player={p} />
      ))}
    </div>
  )
}

function FixturePitch({ players }: { players: FixturePlayer[] }) {
  const byPosition: Record<string, FixturePlayer[]> = { FWD: [], MID: [], DEF: [], GK: [] }
  for (const p of players) {
    const cat = p.position_category ?? 'MID'
    if (cat in byPosition) byPosition[cat].push(p)
  }

  return (
    <div
      className="relative w-full max-w-sm mx-auto rounded-xl overflow-hidden shadow-lg"
      style={{ background: 'linear-gradient(180deg, #2d7a27 0%, #3a9e33 50%, #2d7a27 100%)' }}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 320 480"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="240" x2="320" y2="240" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <circle cx="160" cy="240" r="40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <circle cx="160" cy="240" r="2" fill="rgba(255,255,255,0.4)" />
        <rect x="80" y="0" width="160" height="80" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <rect x="110" y="0" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <rect x="80" y="400" width="160" height="80" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <rect x="110" y="440" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <rect x="4" y="4" width="312" height="472" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      </svg>

      <div className="relative z-10 flex flex-col justify-between py-4" style={{ minHeight: '480px' }}>
        <FixtureRow players={byPosition.FWD} />
        <FixtureRow players={byPosition.MID} />
        <FixtureRow players={byPosition.DEF} />
        <FixtureRow players={byPosition.GK} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Events list
// ---------------------------------------------------------------------------

function EventCard({ ev }: { ev: LiveScoreEvent }) {
  const category = CATEGORIES.find((c) => c.meta.eventTypes.includes(ev.event_type))
  const meta = category?.meta
  const Icon = meta?.icon
  const bookingBadge = BOOKING_BADGE[ev.event_type]
  const badgeLabel = bookingBadge?.label ?? meta?.label ?? ev.event_type
  const playerLink = ev.player_id != null ? `/player/${ev.player_id}` : null

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 bg-card">
      {playerLink ? (
        <Link href={playerLink} className="flex-shrink-0">
          <PlayerIcon
            imagePath={ev.player_image_path}
            name={ev.player_name}
            teamImagePath={ev.team_image_path}
            size={40}
          />
        </Link>
      ) : (
        <PlayerIcon
          imagePath={ev.player_image_path}
          name={ev.player_name}
          teamImagePath={ev.team_image_path}
          size={40}
        />
      )}
      <div className="flex-1 min-w-0">
        {playerLink ? (
          <Link href={playerLink} className="font-medium text-sm truncate block hover:underline">
            {ev.player_name ?? 'Unknown'}
          </Link>
        ) : (
          <div className="font-medium text-sm truncate">{ev.player_name ?? 'Unknown'}</div>
        )}
        <div className="text-xs text-muted-foreground">{ev.drafted_by_username}</div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          {Icon && <Icon size={12} />}
          {badgeLabel}
        </Badge>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {ev.minute != null && <span>{ev.minute}&apos;</span>}
          <span className="font-semibold text-foreground">+{ev.points}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FixtureDetailPage() {
  const params = useParams()
  const fixtureId = Number(params.fixtureId)
  const [data, setData] = useState<FixtureDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fixtureId) return
    api.fixtureDetail(fixtureId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [fixtureId])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/fixtures" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft size={16} /> Fixtures
        </Link>
        <div className="text-destructive">{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-5 w-20 bg-muted animate-pulse rounded mb-6" />
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  const home = data.participants.find((p) => p.location === 'home')
  const away = data.participants.find((p) => p.location === 'away')
  const isLive = data.state !== null && LIVE_STATES.has(data.state)
  const label = stateLabel(data.state)

  const dateStr = data.starting_at
    ? new Date(data.starting_at).toLocaleString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <Link href="/fixtures" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ChevronLeft size={16} /> Fixtures
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {isLive && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
          <h1 className="text-xl font-semibold">{data.fixture_name}</h1>
          {label && <Badge variant={isLive ? 'default' : 'secondary'}>{label}</Badge>}
        </div>

        {/* Teams + score */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {home?.team_image_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={home.team_image_path} alt={home.team_name ?? ''} className="w-8 h-8 object-contain flex-shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{home?.team_name}</span>
          </div>
          <span className="text-xl font-bold tabular-nums flex-shrink-0">
            {data.home_score != null && data.away_score != null
              ? `${data.home_score} – ${data.away_score}`
              : 'vs'}
          </span>
          <div className="flex items-center gap-2 flex-row-reverse flex-1 min-w-0">
            {away?.team_image_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={away.team_image_path} alt={away.team_name ?? ''} className="w-8 h-8 object-contain flex-shrink-0" />
            )}
            <span className="text-sm font-medium truncate text-right">{away?.team_name}</span>
          </div>
        </div>
        {dateStr && <span className="text-xs text-muted-foreground">{dateStr}</span>}
      </div>

      {data.players.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No drafted players in this fixture.</p>
      ) : (
        <FixturePitch players={data.players} />
      )}

      {data.events.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Events</h2>
          {data.events.map((ev, i) => (
            <EventCard key={i} ev={ev} />
          ))}
        </div>
      )}

      {data.players.length > 0 && data.events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No scoring events in this fixture.</p>
      )}
    </div>
  )
}
