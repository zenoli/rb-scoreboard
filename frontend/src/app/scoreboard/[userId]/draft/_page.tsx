'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PlayerIcon } from '@/components/ui/player-icon'
import { FootballPitch } from '@/components/football-pitch'
import { api } from '@/lib/api'
import type { PlayerPoints, UserDraft } from '@/lib/types'

export default function DraftPage() {
  const params = useParams()
  const userId = Number(params.userId)
  const [draft, setDraft] = useState<UserDraft | null>(null)
  const [pointsMap, setPointsMap] = useState<Map<number, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.drafts(), api.draftPoints(userId)])
      .then(([drafts, pts]: [UserDraft[], PlayerPoints[]]) => {
        const userDraft = drafts.find((d: UserDraft) => d.user_id === userId) ?? null
        setDraft(userDraft)
        setPointsMap(new Map(pts.map((p: PlayerPoints) => [p.player_id, p.points])))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  if (error) return <p className="text-destructive">{error}</p>

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-[480px] max-w-sm mx-auto w-full bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  if (!draft || draft.players.length === 0) {
    return <p className="text-muted-foreground text-center py-12">No draft yet.</p>
  }

  return (
    <div>
      <FootballPitch draft={draft} pointsMap={pointsMap} />
      {draft.coach && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border p-3 bg-card max-w-sm mx-auto">
          <PlayerIcon
            imagePath={draft.coach.image_path}
            name={draft.coach.display_name}
            teamImagePath={draft.coach.team_image_path}
            size={48}
            avatarClassName="ring-2 ring-white shadow-md"
          />
          <div>
            <div className="text-xs text-muted-foreground">Coach</div>
            <div className="font-medium text-sm">{draft.coach.display_name}</div>
            <div className="text-xs text-muted-foreground">{draft.coach.team_name}</div>
          </div>
        </div>
      )}
    </div>
  )
}
