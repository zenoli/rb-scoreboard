'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PlayerIcon } from '@/components/ui/player-icon'
import { FootballPitch } from '@/components/football-pitch'
import { api } from '@/lib/api'
import type { PlayerPoints, UserDraft } from '@/lib/types'
import { cn } from '@/lib/utils'

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? '-100%' : '100%', opacity: 0 }),
}

const transition = { type: 'spring' as const, stiffness: 320, damping: 32 }

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<UserDraft[] | null>(null)
  const [pointsByUser, setPointsByUser] = useState<Map<number, Map<number, number>>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  useEffect(() => {
    api.drafts()
      .then(async (data: UserDraft[]) => {
        const active = data.filter((d) => d.is_active)
        setDrafts(active)

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

  function goTo(index: number) {
    if (!drafts || index === activeIndex || index < 0 || index >= drafts.length) return
    setDirection(index > activeIndex ? 1 : -1)
    setActiveIndex(index)
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null || !drafts) return
    const delta = touchStartX - e.changedTouches[0].clientX
    if (Math.abs(delta) > 50) {
      if (delta > 0) goTo(activeIndex + 1)
      else goTo(activeIndex - 1)
    }
    setTouchStartX(null)
  }

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

  const draft = drafts[activeIndex]
  const pts = pointsByUser.get(draft.user_id) ?? new Map()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">Drafts</h1>

      {/* Segmented control */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex rounded-lg border overflow-hidden">
          {drafts.map((d, i) => (
            <button
              key={d.user_id}
              onClick={() => goTo(i)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors border-r last:border-r-0',
                i === activeIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {d.username}
            </button>
          ))}
        </div>
      </div>

      {/* Carousel */}
      <div
        className="relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={draft.user_id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
          >
            <FootballPitch draft={draft} pointsMap={pts} />
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {drafts.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {drafts.map((d, i) => (
            <button
              key={d.user_id}
              onClick={() => goTo(i)}
              aria-label={d.username}
              className={cn(
                'rounded-full transition-all duration-200',
                i === activeIndex
                  ? 'w-4 h-2 bg-primary'
                  : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
