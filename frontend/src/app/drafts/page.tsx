'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { PlayerIcon } from '@/components/ui/player-icon'
import { FootballPitch } from '@/components/football-pitch'
import { api } from '@/lib/api'
import type { PlayerPoints, UserDraft } from '@/lib/types'
import { cn } from '@/lib/utils'

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 40 }
const SWIPE_VELOCITY_THRESHOLD = 300

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<UserDraft[] | null>(null)
  const [pointsByUser, setPointsByUser] = useState<Map<number, Map<number, number>>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.offsetWidth)
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [drafts])

  function goTo(index: number) {
    if (!drafts) return
    setActiveIndex(Math.max(0, Math.min(drafts.length - 1, index)))
  }

  function handleDragEnd(_: unknown, { offset, velocity }: PanInfo) {
    if (!drafts || containerWidth === 0) return
    let newIndex: number
    if (velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      newIndex = activeIndex + 1
    } else if (velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      newIndex = activeIndex - 1
    } else {
      // snap to nearest based on drag position
      newIndex = Math.round(activeIndex - offset.x / containerWidth)
    }
    goTo(newIndex)
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

      {/* Carousel track */}
      <div ref={containerRef} className="overflow-hidden">
        <motion.div
          className="flex"
          style={{ width: `${drafts.length * 100}%` }}
          animate={{ x: containerWidth ? -activeIndex * containerWidth : 0 }}
          transition={SPRING}
          drag="x"
          dragConstraints={{
            left: containerWidth ? -(drafts.length - 1) * containerWidth : 0,
            right: 0,
          }}
          dragElastic={0.1}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
        >
          {drafts.map((d) => {
            const pts = pointsByUser.get(d.user_id) ?? new Map()
            return (
              <div key={d.user_id} style={{ width: `${100 / drafts.length}%` }} className="shrink-0">
                <div className="px-2">
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
                </div>
              </div>
            )
          })}
        </motion.div>
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
