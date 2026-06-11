'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { UserScore } from '@/lib/types'

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const userId = Number(params.userId)
  const [userScore, setUserScore] = useState<UserScore | null>(null)

  useEffect(() => {
    api.scores().then((data) => {
      setUserScore(data.users?.find((u: UserScore) => u.user_id === userId) ?? null)
    })
  }, [userId])

  const isScoreEvents = pathname.endsWith('/score-events')
  const isDraft = pathname.endsWith('/draft')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link
        href="/scoreboard"
        className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
      >
        ← Back
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {userScore?.username ?? `User ${userId}`}
        </h1>
        {userScore != null && (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">Total</span>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black font-bold text-xl">
              {userScore.total}
            </div>
          </div>
        )}
      </div>

      <div className="flex rounded-lg border p-1 bg-muted mb-6">
        <Link
          href={`/scoreboard/${userId}/score-events`}
          replace
          className={cn(
            'flex-1 text-center text-sm py-1.5 px-3 rounded-md transition-colors',
            isScoreEvents
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Score Events
        </Link>
        <Link
          href={`/scoreboard/${userId}/draft`}
          replace
          className={cn(
            'flex-1 text-center text-sm py-1.5 px-3 rounded-md transition-colors',
            isDraft
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Draft
        </Link>
      </div>

      {children}
    </div>
  )
}
