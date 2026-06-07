'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlayerIcon } from '@/components/ui/player-icon'
import { FootballPitch } from '@/components/football-pitch'
import { api } from '@/lib/api'
import type { PlayerPoints, UserDraft } from '@/lib/types'

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
                  <PlayerIcon
                    imagePath={d.coach.image_path}
                    name={d.coach.display_name}
                    teamImagePath={d.coach.team_image_path}
                    size={48}
                    avatarClassName="ring-2 ring-white shadow-md"
                  />
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
