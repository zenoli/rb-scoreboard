'use client'

import Link from 'next/link'
import { PlayerIcon } from '@/components/ui/player-icon'
import type { PlayerBrief, UserDraft } from '@/lib/types'

function PlayerPin({ player, points }: { player: PlayerBrief; points: number }) {
  return (
    <Link href={`/player/${player.id}`} className="flex flex-col items-center gap-2">
      <PlayerIcon
        imagePath={player.image_path}
        name={player.display_name}
        teamImagePath={player.team_image_path}
        points={points}
        size={48}
        avatarClassName="ring-2 ring-white shadow-md"
      />
      <span className="text-[10px] text-white font-medium text-center leading-tight max-w-[56px] truncate drop-shadow">
        {player.display_name?.split(' ').pop() ?? ''}
      </span>
    </Link>
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

export function FootballPitch({
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
        <Row players={byPosition.FWD} points={pointsMap} />
        <Row players={byPosition.MID} points={pointsMap} />
        <Row players={byPosition.DEF} points={pointsMap} />
        <Row players={byPosition.GK} points={pointsMap} />
      </div>
    </div>
  )
}
