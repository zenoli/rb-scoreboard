'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { ScoreEvent } from '@/lib/types'
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
          <Link href={playerLink} className="font-medium text-sm truncate block hover:underline">{ev.player_name ?? 'Unknown'}</Link>
        ) : (
          <div className="font-medium text-sm truncate">{ev.player_name ?? 'Unknown'}</div>
        )}
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

export default function ScoreEventsPage() {
  const params = useParams()
  const userId = Number(params.userId)
  const [events, setEvents] = useState<ScoreEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.scoreEvents(userId)
      .then(setEvents)
      .catch((e: Error) => setError(e.message))
  }, [userId])

  const loading = !events && !error

  if (error) return <p className="text-destructive">{error}</p>

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (events && events.length === 0) {
    return <p className="text-muted-foreground text-center py-12">No scoring events yet.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {CATEGORIES.map(({ key, meta }) => {
        const categoryEvents = events!.filter((ev) => meta.eventTypes.includes(ev.event_type))
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
  )
}
