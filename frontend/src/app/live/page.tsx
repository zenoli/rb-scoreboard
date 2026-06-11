'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Target,
  Handshake,
  Layers2,
  Shield,
  type LucideProps,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { LivePlayer, LiveResponse, LiveScoreEvent } from '@/lib/types'

const POLL_INTERVAL = Number(process.env.NEXT_PUBLIC_LIVE_POLL_INTERVAL ?? 10_000)

// How many ms before/after the match window to poll
const PRE_MATCH_MARGIN = 30 * 60 * 1000
// 90 min play + 15 min HT + ~10 min stoppage + 30 min ET + 5 min ET HT
// + ~5 min ET stoppage + ~30 min penalties + 30 min post-match margin
const POST_MATCH_WINDOW = (90 + 15 + 10 + 30 + 5 + 5 + 30 + 30) * 60 * 1000

function msUntilNextPoll(data: { is_live: boolean; next_kickoff: string | null }): number {
  if (data.is_live) return POLL_INTERVAL

  if (data.next_kickoff) {
    const kickoff = new Date(data.next_kickoff).getTime()
    const now = Date.now()
    const windowStart = kickoff - PRE_MATCH_MARGIN
    const windowEnd = kickoff + POST_MATCH_WINDOW

    if (now >= windowStart && now <= windowEnd) return POLL_INTERVAL
    if (now < windowStart) return windowStart - now
  }

  // No upcoming fixture in window — check again in 5 min
  return 5 * 60 * 1000
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

function LivePlayerPin({ player }: { player: LivePlayer }) {
  const hasLivePoints = player.live_points > 0
  const label = hasLivePoints
    ? `${fmtPts(player.total_points)}(${fmtPts(player.live_points)})`
    : fmtPts(player.total_points)

  const showPointsBadge = player.total_points > 0 || hasLivePoints

  return (
    <Link
      href={`/player/${player.player_id}`}
      className={`flex flex-col items-center gap-1 transition-opacity${!player.is_active ? ' opacity-40' : ''}`}
    >
      <div className="relative">
        <PlayerIcon
          imagePath={player.image_path}
          name={player.display_name}
          teamImagePath={player.team_image_path}
          pointsLabel={showPointsBadge ? label : undefined}
          size={48}
          avatarClassName="ring-2 ring-white shadow-md"
        />
        {!player.is_active && (
          <div
            className="absolute left-1/2 -translate-x-1/2 bg-black/80 text-white rounded-sm px-1 flex items-center justify-center"
            style={{ bottom: -10, fontSize: 7, whiteSpace: 'nowrap', lineHeight: '14px' }}
          >
            Not playing
          </div>
        )}
      </div>
      <span className="text-[10px] text-white font-medium text-center leading-tight max-w-[64px] truncate drop-shadow mt-2.5">
        {player.display_name?.split(' ').pop() ?? ''}
      </span>
      <span className="text-[9px] text-white/70 font-medium text-center leading-tight max-w-[64px] truncate drop-shadow">
        {player.drafted_by_username}
      </span>
    </Link>
  )
}

function LiveRow({ players }: { players: LivePlayer[] }) {
  if (players.length === 0) return null
  return (
    <div className="flex justify-around items-start py-2">
      {players.map((p) => (
        <LivePlayerPin key={p.player_id} player={p} />
      ))}
    </div>
  )
}

function LivePitch({ players }: { players: LivePlayer[] }) {
  const byPosition: Record<string, LivePlayer[]> = { FWD: [], MID: [], DEF: [], GK: [] }
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
        <LiveRow players={byPosition.FWD} />
        <LiveRow players={byPosition.MID} />
        <LiveRow players={byPosition.DEF} />
        <LiveRow players={byPosition.GK} />
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

export default function LivePage() {
  const [data, setData] = useState<LiveResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    async function load() {
      try {
        const d: LiveResponse = await api.live()
        setData(d)
        timeout = setTimeout(load, msUntilNextPoll(d))
      } catch (e) {
        setError((e as Error).message)
        timeout = setTimeout(load, POLL_INTERVAL)
      }
    }

    load()
    return () => clearTimeout(timeout)
  }, [])

  if (error) return <div className="max-w-2xl mx-auto px-4 py-8 text-destructive">{error}</div>

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-8 w-24 bg-muted animate-pulse rounded mb-6" />
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  if (!data.is_live) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="text-4xl mb-4">⚽</div>
        <p className="text-muted-foreground">No live games right now.</p>
        <p className="text-sm text-muted-foreground mt-1">Check back when a match is underway.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <h1 className="text-xl font-semibold">Live</h1>
      </div>

      <LivePitch players={data.players} />

      {data.events.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Events</h2>
          {data.events.map((ev, i) => (
            <EventCard key={i} ev={ev} />
          ))}
        </div>
      )}

      {data.events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No scoring events yet.</p>
      )}
    </div>
  )
}
