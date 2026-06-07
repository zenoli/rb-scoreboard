'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { PlayerResponse, ScoreEvent } from '@/lib/types'
import {
  Target,
  Handshake,
  Layers2,
  Shield,
  Trophy,
  type LucideProps,
} from 'lucide-react'

type CategoryKey = 'goal' | 'assist' | 'booking' | 'clean_sheet' | 'coach_winner'

type CategoryMeta = {
  label: string
  icon: (props: LucideProps) => React.ReactNode
  eventTypes: ScoreEvent['event_type'][]
  badgeVariant: 'secondary'
}

const CATEGORIES: { key: CategoryKey; meta: CategoryMeta }[] = [
  {
    key: 'goal',
    meta: { label: 'Goal', icon: Target, eventTypes: ['goal'], badgeVariant: 'secondary' },
  },
  {
    key: 'assist',
    meta: { label: 'Assist', icon: Handshake, eventTypes: ['assist'], badgeVariant: 'secondary' },
  },
  {
    key: 'booking',
    meta: { label: 'Booking', icon: Layers2, eventTypes: ['yellow_card', 'red_card'], badgeVariant: 'secondary' },
  },
  {
    key: 'clean_sheet',
    meta: { label: 'Clean Sheet', icon: Shield, eventTypes: ['clean_sheet'], badgeVariant: 'secondary' },
  },
  {
    key: 'coach_winner',
    meta: { label: 'Coach Winner', icon: Trophy, eventTypes: ['coach_winner'], badgeVariant: 'secondary' },
  },
]

const BOOKING_BADGE: Partial<Record<ScoreEvent['event_type'], { label: string; variant: 'secondary' }>> = {
  yellow_card: { label: 'Yellow', variant: 'secondary' },
  red_card: { label: 'Red', variant: 'secondary' },
}

function TeamFlag({ src, name }: { src: string | null; name: string | null }) {
  if (!src) return <span className="text-xs text-muted-foreground">{name ?? '—'}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ''} className="w-6 h-4 object-cover rounded-sm" title={name ?? ''} />
  )
}

function EventCard({ ev, meta }: { ev: ScoreEvent; meta: CategoryMeta }) {
  const Icon = meta.icon
  const bookingBadge = BOOKING_BADGE[ev.event_type]
  const badgeVariant = bookingBadge?.variant ?? meta.badgeVariant
  const badgeLabel = bookingBadge?.label ?? meta.label
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 bg-card">
      <PlayerIcon
        imagePath={ev.player_image_path}
        name={ev.player_name}
        teamImagePath={ev.team_image_path}
        size={40}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{ev.player_name ?? 'Unknown'}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <TeamFlag src={ev.team_image_path} name={ev.team_name} />
          {ev.opponent_name && (
            <>
              <span className="text-xs text-muted-foreground">vs</span>
              <TeamFlag src={ev.opponent_image_path} name={ev.opponent_name} />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge variant={badgeVariant} className="text-xs flex items-center gap-1">
          <Icon size={12} />
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

export default function PlayerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const playerId = Number(params.playerId)
  const [player, setPlayer] = useState<PlayerResponse | null>(null)
  const [events, setEvents] = useState<ScoreEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.player(playerId), api.playerEvents(playerId)])
      .then(([p, evts]) => {
        setPlayer(p)
        setEvents(evts)
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId])

  const loading = !player && !error

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
      >
        ← Back
      </button>

      {error && <p className="text-destructive">{error}</p>}

      {loading && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="w-24 h-24 rounded-full bg-muted animate-pulse" />
            <div className="h-6 w-40 bg-muted animate-pulse rounded" />
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!loading && !error && player && (
        <>
          {/* Player card */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <PlayerIcon
              imagePath={player.image_path}
              name={player.display_name}
              teamImagePath={player.team_image_path}
              size={96}
            />
            <h1 className="text-2xl font-bold text-center">{player.display_name ?? 'Unknown'}</h1>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
              {player.team_name && (
                <div className="flex items-center gap-1.5">
                  {player.team_image_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={player.team_image_path} alt={player.team_name} className="w-5 h-4 object-cover rounded-sm" />
                  )}
                  <span>{player.team_name}</span>
                </div>
              )}
              {player.position_name && <span>· {player.position_name}</span>}
              {player.jersey_number != null && <span>· #{player.jersey_number}</span>}
            </div>
          </div>

          {events && events.length === 0 && (
            <p className="text-muted-foreground text-center py-12">No scoring events yet.</p>
          )}

          {events && events.length > 0 && (
            <div className="flex flex-col gap-6">
              {CATEGORIES.map(({ key, meta }) => {
                const categoryEvents = events.filter((ev) => meta.eventTypes.includes(ev.event_type))
                if (categoryEvents.length === 0) return null
                const Icon = meta.icon
                return (
                  <div key={key}>
                    <div className="sticky top-14 z-20 bg-background/80 backdrop-blur-sm flex items-center gap-2 py-2 mb-2">
                      <Icon size={16} className="text-muted-foreground" />
                      <span className="text-sm font-semibold">{meta.label}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {categoryEvents.map((ev, i) => (
                        <EventCard key={i} ev={ev} meta={meta} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
