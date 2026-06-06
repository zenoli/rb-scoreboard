'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { ScoreEvent } from '@/lib/types'

const EVENT_LABELS: Record<string, { label: string; emoji: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  goal: { label: 'Goal', emoji: '⚽', variant: 'default' },
  assist: { label: 'Assist', emoji: '🅰️', variant: 'secondary' },
  yellow_card: { label: 'Yellow', emoji: '🟨', variant: 'outline' },
  red_card: { label: 'Red', emoji: '🟥', variant: 'destructive' },
  clean_sheet: { label: 'Clean Sheet', emoji: '🧤', variant: 'secondary' },
  coach_winner: { label: 'Winner', emoji: '🏆', variant: 'default' },
}

function PlayerAvatar({ src, name }: { src: string | null; name: string | null }) {
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0 border">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-sm font-medium text-muted-foreground">
          {(name ?? '?').slice(0, 1)}
        </div>
      )}
    </div>
  )
}

function TeamFlag({ src, name }: { src: string | null; name: string | null }) {
  if (!src) return <span className="text-xs text-muted-foreground">{name ?? '—'}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ''} className="w-6 h-4 object-cover rounded-sm" title={name ?? ''} />
  )
}

export default function ScoreDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = Number(params.userId)
  const [events, setEvents] = useState<ScoreEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.scoreEvents(userId)
      .then(setEvents)
      .catch((e) => setError(e.message))
  }, [userId])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
      >
        ← Back
      </button>

      {error && <p className="text-destructive">{error}</p>}

      {!events && !error && (
        <div className="flex flex-col gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {events && events.length === 0 && (
        <p className="text-muted-foreground text-center py-12">No scoring events yet.</p>
      )}

      {events && events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((ev, i) => {
            const meta = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, emoji: '•', variant: 'outline' as const }
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border p-3 bg-card"
              >
                <PlayerAvatar src={ev.player_image_path} name={ev.player_name} />

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
                  <Badge variant={meta.variant} className="text-xs">
                    {meta.emoji} {meta.label}
                  </Badge>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {ev.minute != null && <span>{ev.minute}&apos;</span>}
                    <span className="font-semibold text-foreground">+{ev.points}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
