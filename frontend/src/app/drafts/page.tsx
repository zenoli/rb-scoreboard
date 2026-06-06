'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { PlayerBrief, PlayerPoints, UserDraft } from '@/lib/types'

function PlayerPin({
  player,
  points,
}: {
  player: PlayerBrief
  points: number
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md bg-muted">
          {player.image_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.image_path}
              alt={player.display_name ?? ''}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
              {(player.display_name ?? '?').slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <span className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1 min-w-[16px] text-center leading-4 shadow">
          {points % 1 === 0 ? points : points.toFixed(1)}
        </span>
      </div>
      <span className="text-[10px] text-white font-medium text-center leading-tight max-w-[56px] truncate drop-shadow">
        {player.display_name?.split(' ').pop() ?? ''}
      </span>
    </div>
  )
}

function Row({ players, points }: { players: PlayerBrief[]; points: Map<number, number> }) {
  return (
    <div className="flex justify-around items-center py-2">
      {players.map((p) => (
        <PlayerPin key={p.id} player={p} points={points.get(p.id) ?? 0} />
      ))}
    </div>
  )
}

function FootballPitch({
  draft,
  pointsMap,
}: {
  draft: UserDraft
  pointsMap: Map<number, number>
}) {
  const byPosition: Record<string, PlayerBrief[]> = { FWD: [], MID: [], DEF: [], GK: [] }
  for (const p of draft.players) {
    const cat = p.position_category ?? 'MID'
    if (cat in byPosition) byPosition[cat].push(p)
  }

  return (
    <div className="relative w-full max-w-sm mx-auto rounded-xl overflow-hidden shadow-lg"
      style={{ background: 'linear-gradient(180deg, #2d7a27 0%, #3a9e33 50%, #2d7a27 100%)' }}>
      {/* Pitch markings */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 320 480"
        preserveAspectRatio="none"
      >
        {/* Center line */}
        <line x1="0" y1="240" x2="320" y2="240" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        {/* Center circle */}
        <circle cx="160" cy="240" r="40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <circle cx="160" cy="240" r="2" fill="rgba(255,255,255,0.4)" />
        {/* Top penalty box */}
        <rect x="80" y="0" width="160" height="80" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <rect x="110" y="0" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        {/* Bottom penalty box */}
        <rect x="80" y="400" width="160" height="80" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <rect x="110" y="440" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        {/* Outer border */}
        <rect x="4" y="4" width="312" height="472" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      </svg>

      {/* Players */}
      <div className="relative z-10 flex flex-col justify-between py-4" style={{ minHeight: '480px' }}>
        <Row players={byPosition.FWD} points={pointsMap} />
        <Row players={byPosition.MID} points={pointsMap} />
        <Row players={byPosition.DEF} points={pointsMap} />
        <Row players={byPosition.GK} points={pointsMap} />
      </div>
    </div>
  )
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<UserDraft[] | null>(null)
  const [pointsByUser, setPointsByUser] = useState<Map<number, Map<number, number>>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [activeUserId, setActiveUserId] = useState<number | null>(null)

  useEffect(() => {
    api.drafts()
      .then(async (data: UserDraft[]) => {
        const active = data.filter((d) => d.is_active)
        setDrafts(active)
        if (active.length > 0) setActiveUserId(active[0].user_id)

        // Load points for all users in parallel
        const results = await Promise.allSettled(
          active.map((d) => api.draftPoints(d.user_id).then((pts: PlayerPoints[]) => ({ userId: d.user_id, pts })))
        )
        const map = new Map<number, Map<number, number>>()
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const { userId, pts } = r.value
            map.set(userId, new Map(pts.map((p: PlayerPoints) => [p.player_id, p.points])))
          }
        }
        setPointsByUser(map)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="max-w-2xl mx-auto px-4 py-8 text-destructive">{error}</div>

  if (!drafts) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  if (drafts.length === 0) {
    return <div className="max-w-2xl mx-auto px-4 py-8 text-center text-muted-foreground">No drafts yet.</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">Drafts</h1>
      <Tabs
        value={String(activeUserId)}
        onValueChange={(v) => setActiveUserId(Number(v))}
      >
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {drafts.map((d) => (
            <TabsTrigger key={d.user_id} value={String(d.user_id)}>
              {d.username}
            </TabsTrigger>
          ))}
        </TabsList>

        {drafts.map((d) => {
          const pts = pointsByUser.get(d.user_id) ?? new Map()
          return (
            <TabsContent key={d.user_id} value={String(d.user_id)}>
              <FootballPitch draft={d} pointsMap={pts} />
              {d.coach && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border p-3 bg-card max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted border flex-shrink-0">
                    {d.coach.image_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.coach.image_path} alt={d.coach.display_name ?? ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {(d.coach.display_name ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Coach</div>
                    <div className="font-medium text-sm">{d.coach.display_name}</div>
                    <div className="text-xs text-muted-foreground">{d.coach.team_name}</div>
                  </div>
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
