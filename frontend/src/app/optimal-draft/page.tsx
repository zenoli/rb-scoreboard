'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell } from 'recharts'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { PlayerResponse, ScoreboardResponse, UserScore } from '@/lib/types'

function PlayerPin({ player }: { player: PlayerResponse }) {
  return (
    <Link href={`/player/${player.id}`} className="flex flex-col items-center gap-1">
      <PlayerIcon
        imagePath={player.image_path}
        name={player.display_name}
        teamImagePath={player.team_image_path}
        points={player.total_points ?? 0}
        size={48}
        avatarClassName="ring-2 ring-white shadow-md"
      />
      <span className="text-[10px] text-white font-medium text-center leading-tight max-w-[56px] truncate drop-shadow">
        {player.display_name?.split(' ').pop() ?? ''}
      </span>
      <span className="text-[9px] text-white/70 font-medium text-center leading-tight max-w-[56px] truncate drop-shadow">
        {player.drafted_by_username ?? ''}
      </span>
    </Link>
  )
}

function Row({ players }: { players: PlayerResponse[] }) {
  return (
    <div className="flex justify-around items-start py-2">
      {players.map((p) => (
        <PlayerPin key={p.id} player={p} />
      ))}
    </div>
  )
}

function OptimalPitch({ players }: { players: PlayerResponse[] }) {
  const byPosition: Record<string, PlayerResponse[]> = { FWD: [], MID: [], DEF: [], GK: [] }
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
        <Row players={byPosition.FWD} />
        <Row players={byPosition.MID} />
        <Row players={byPosition.DEF} />
        <Row players={byPosition.GK} />
      </div>
    </div>
  )
}

function EfficiencyRing({ user, optimalTotal }: { user: UserScore; optimalTotal: number }) {
  const pct = optimalTotal > 0 ? Math.min((user.total / optimalTotal) * 100, 100) : 0
  const data = [{ value: pct }, { value: 100 - pct }]

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 80, height: 80 }}>
        <PieChart width={80} height={80} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            cx={40}
            cy={40}
            innerRadius={28}
            outerRadius={38}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
            animationBegin={0}
            animationDuration={1200}
          >
            <Cell fill="var(--primary)" />
            <Cell fill="var(--muted)" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-bold">{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{user.username}</span>
    </div>
  )
}

export default function OptimalDraftPage() {
  const [players, setPlayers] = useState<PlayerResponse[] | null>(null)
  const [users, setUsers] = useState<UserScore[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.optimalDraft(), api.scores()])
      .then(([draft, scoreboard]: [PlayerResponse[], ScoreboardResponse]) => {
        setPlayers(draft)
        setUsers(scoreboard.users.filter((u) => u.is_active))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const total = players?.reduce((sum, p) => sum + (p.total_points ?? 0), 0) ?? 0

  if (error) return <div className="max-w-2xl mx-auto px-4 py-8 text-destructive">{error}</div>

  if (!players) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Optimal Draft</h1>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">Total</span>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black font-bold text-xl">
            {total}
          </div>
        </div>
      </div>

      <OptimalPitch players={players} />

      {users.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Efficiency</h2>
          <div className="flex flex-wrap justify-around gap-6">
            {users.map((u) => (
              <EfficiencyRing key={u.user_id} user={u} optimalTotal={total} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
