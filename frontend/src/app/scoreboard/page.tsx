'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  Column,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlayerIcon } from '@/components/ui/player-icon'
import { ExplanationDrawer, EfficiencyDrawer } from '@/components/explanation-drawer'
import { api } from '@/lib/api'
import type { ScoreboardResponse, ScoreHistoryResponse, UserScore, PlayerResponse } from '@/lib/types'
import { ScoreHistoryChart, chartColorForUserId } from '@/components/score-history-chart'
import { PieChart, Pie, Cell } from 'recharts'
import {
  Target,
  Handshake,
  Layers2,
  Shield,
  Sigma,
  ChartSpline,
  Crown,
  Gauge,
  Trophy,
  type LucideProps,
} from 'lucide-react'
import { Riple } from 'react-loading-indicators'
import clsx from 'clsx'

const POLL_INTERVAL = 60_000

function fmt(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)
}

type Row = UserScore & { booking: number }

function ColHeader({
  name,
  icon: Icon,
  column,
}: {
  name: string
  icon: (props: LucideProps) => React.ReactNode
  column: Column<Row, unknown>
}) {
  return (
    <div
      className="flex flex-col items-center text-[0.6rem] cursor-pointer select-none"
      onClick={() => column.toggleSorting()}
    >
      <Icon size={16} />
      {name}
    </div>
  )
}

function ScoreCell({ column, value }: { column: Column<Row>; value: number }) {
  const isSorted = column.getIsSorted() === 'desc'
  return (
    <div className="text-center font-medium">
      <Badge variant="secondary" className={clsx({ 'bg-transparent': !isSorted })}>
        {fmt(value)}
      </Badge>
    </div>
  )
}

function nameColumnDef(
  historySeries: { user_id: number }[],
  onHighlight: (userId: number | null) => void,
  highlightedUserIdRef: React.RefObject<number | null>,
): ColumnDef<Row> {
  return {
    accessorKey: 'username',
    header: () => (
      <div className="flex translate-y-2 items-end text-[0.6rem] font-bold uppercase">
        Name
      </div>
    ),
    cell: ({ row, getValue }) => {
      const userId = row.original.user_id
      const color = chartColorForUserId(userId, historySeries)
      const highlightedUserId = highlightedUserIdRef.current
      return (
        <div
          className="flex items-center gap-2 font-medium"
          onClick={(e) => {
            e.stopPropagation()
            onHighlight(highlightedUserIdRef.current === userId ? null : userId)
          }}
        >
          {color && (
            <span
              className="shrink-0 rounded-full"
              style={{
                backgroundColor: color,
                width: highlightedUserId === userId ? '0.75rem' : '0.5rem',
                height: highlightedUserId === userId ? '0.75rem' : '0.5rem',
                transition: 'width 200ms ease, height 200ms ease',
                ...(highlightedUserId === userId && {
                  animation: 'pulse-opacity 1.5s ease-in-out infinite',
                }),
              }}
            />
          )}
          {getValue<string>()}
        </div>
      )
    },
  }
}

const columnDefs: ColumnDef<Row>[] = [
  {
    accessorKey: 'goals',
    header: ({ column }) => <ColHeader name="Goal" icon={Target} column={column} />,
    cell: ({ column, getValue }) => <ScoreCell column={column} value={getValue<number>()} />,
  },
  {
    accessorKey: 'assists',
    header: ({ column }) => <ColHeader name="Assist" icon={Handshake} column={column} />,
    cell: ({ column, getValue }) => <ScoreCell column={column} value={getValue<number>()} />,
  },
  {
    accessorKey: 'booking',
    header: ({ column }) => <ColHeader name="Booking" icon={Layers2} column={column} />,
    cell: ({ column, getValue }) => <ScoreCell column={column} value={getValue<number>()} />,
  },
  {
    accessorKey: 'clean_sheets',
    header: ({ column }) => <ColHeader name="Cl. Sht" icon={Shield} column={column} />,
    cell: ({ column, row }) => {
      const verified = row.original.clean_sheets
      const volatile = row.original.volatile_clean_sheets
      const isSorted = column.getIsSorted() === 'desc'
      return (
        <div className="text-center font-medium">
          <Badge variant="secondary" className={clsx({ 'bg-transparent': !isSorted })}>
            {fmt(verified)}{volatile > 0 && <span className="text-muted-foreground ml-1">(+{fmt(volatile)})</span>}
          </Badge>
        </div>
      )
    },
  },
  {
    accessorKey: 'total',
    header: ({ column }) => <ColHeader name="Total" icon={Sigma} column={column} />,
    cell: ({ column, getValue }) => <ScoreCell column={column} value={getValue<number>()} />,
  },
]

/* ── Optimal Draft components ── */

function PlayerPin({
  player,
  highlighted,
  dimmed,
  highlightColor,
}: {
  player: PlayerResponse
  highlighted?: boolean
  dimmed?: boolean
  highlightColor?: string
}) {
  return (
    <Link
      href={`/player/${player.id}`}
      className="flex flex-col items-center gap-1 transition-opacity duration-200"
      style={{ opacity: dimmed ? 0.3 : 1 }}
    >
      <PlayerIcon
        imagePath={player.image_path}
        name={player.display_name}
        teamImagePath={player.team_image_path}
        points={player.total_points ?? 0}
        size={48}
        avatarClassName={highlighted ? 'ring-[3px] shadow-lg' : 'ring-2 ring-white shadow-md'}
        style={highlighted && highlightColor ? { '--tw-ring-color': highlightColor } as React.CSSProperties : undefined}
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

function PitchRow({
  players,
  highlightedUsername,
  highlightColor,
}: {
  players: PlayerResponse[]
  highlightedUsername: string | null
  highlightColor?: string
}) {
  return (
    <div className="flex justify-around items-start py-2">
      {players.map((p) => {
        const isOwned = p.drafted_by_username === highlightedUsername
        return (
          <PlayerPin
            key={p.id}
            player={p}
            highlighted={highlightedUsername !== null && isOwned}
            dimmed={highlightedUsername !== null && !isOwned}
            highlightColor={highlightColor}
          />
        )
      })}
    </div>
  )
}

function OptimalPitch({
  players,
  highlightedUsername,
  highlightColor,
}: {
  players: PlayerResponse[]
  highlightedUsername: string | null
  highlightColor?: string
}) {
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
        <PitchRow players={byPosition.FWD} highlightedUsername={highlightedUsername} highlightColor={highlightColor} />
        <PitchRow players={byPosition.MID} highlightedUsername={highlightedUsername} highlightColor={highlightColor} />
        <PitchRow players={byPosition.DEF} highlightedUsername={highlightedUsername} highlightColor={highlightColor} />
        <PitchRow players={byPosition.GK} highlightedUsername={highlightedUsername} highlightColor={highlightColor} />
      </div>
    </div>
  )
}

function EfficiencyRing({
  user,
  optimalTotal,
  highlighted,
  dimmed,
  highlightColor,
  onClick,
}: {
  user: UserScore
  optimalTotal: number
  highlighted?: boolean
  dimmed?: boolean
  highlightColor?: string
  onClick?: () => void
}) {
  const pct = optimalTotal > 0 ? Math.min((user.total / optimalTotal) * 100, 100) : 0
  const data = [{ value: pct }, { value: 100 - pct }]
  const fillColor = highlighted && highlightColor ? highlightColor : 'var(--primary)'

  return (
    <div
      className="flex flex-col items-center gap-1 cursor-pointer transition-opacity duration-200 outline-none [&_*]:outline-none"
      style={{ opacity: dimmed ? 0.3 : 1 }}
      onClick={onClick}
    >
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
            cornerRadius={5}
            animationBegin={0}
            animationDuration={1200}
          >
            <Cell fill={fillColor} />
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

/* ── Main page ── */

export default function ScoreboardPage() {
  const router = useRouter()
  const [data, setData] = useState<ScoreboardResponse | null>(null)
  const [history, setHistory] = useState<ScoreHistoryResponse | null>(null)
  const [optimalPlayers, setOptimalPlayers] = useState<PlayerResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'total', desc: true }])
  const [highlightedUserId, setHighlightedUserId] = useState<number | null>(null)
  const highlightedUserIdRef = useRef<number | null>(null)
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())

  async function load() {
    try {
      const [scores, hist] = await Promise.all([api.scores(), api.scoreHistory()])
      setData(scores)
      setHistory(hist)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scores')
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    api.optimalDraft()
      .then(setOptimalPlayers)
      .catch(() => {}) // non-critical — silently skip if it fails
  }, [])

  const handleHighlight = useCallback((userId: number | null) => {
    highlightedUserIdRef.current = userId
    setHighlightedUserId(userId)
  }, [])

  const columns = useMemo(
    () => [nameColumnDef(history?.series ?? [], handleHighlight, highlightedUserIdRef), ...columnDefs],
    [history?.series, handleHighlight]
  )

  const rows: Row[] = useMemo(
    () =>
      (data?.users ?? [])
        .filter((u) => u.is_active)
        .map((u) => ({ ...u, booking: u.yellow_cards + u.red_cards })),
    [data]
  )

  const activeUsers = useMemo(
    () => (data?.users ?? []).filter((u) => u.is_active),
    [data]
  )

  const optimalTotal = useMemo(
    () => optimalPlayers?.reduce((sum, p) => sum + (p.total_points ?? 0), 0) ?? 0,
    [optimalPlayers]
  )

  const highlightColor = useMemo(
    () => highlightedUserId !== null ? chartColorForUserId(highlightedUserId, history?.series ?? []) : undefined,
    [highlightedUserId, history?.series]
  )

  const highlightedUsername = useMemo(
    () => {
      if (highlightedUserId === null) return null
      return activeUsers.find((u) => u.user_id === highlightedUserId)?.username ?? null
    },
    [highlightedUserId, activeUsers]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center text-destructive">
        {error}
      </div>
    )
  }

  const loaded = !!data

  return (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center pointer-events-none z-50 animate-fade-in transition-opacity duration-300"
        style={{ opacity: loaded ? 0 : 1 }}
      >
        <Riple color="var(--color-muted-foreground)" size="medium" />
      </div>

    {data && (
    <div
      className="max-w-2xl mx-auto px-4 py-6 transition-opacity duration-300"
      style={{ opacity: loaded ? 1 : 0 }}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} />Scoreboard</h1>
          {data.season_name && (
            <span className="text-xs text-muted-foreground">{data.season_name}</span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-0 first:pl-2 first:w-1/4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const isHighlighted = highlightedUserId === row.original.user_id
              return (
                <TableRow
                  key={row.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.original.user_id, el)
                    else rowRefs.current.delete(row.original.user_id)
                  }}
                  className={clsx('cursor-pointer', isHighlighted && 'bg-muted/50')}
                  onClick={() => router.push(`/scoreboard/${row.original.user_id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-0 first:pl-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {history && history.dates.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2"><ChartSpline size={20} />Points over time</h2>
          <div className="rounded-md border p-4">
            <ScoreHistoryChart data={history} highlightedUserId={highlightedUserId} />
          </div>
        </>
      )}
      </div>

      {optimalPlayers ? (
        <div className="animate-fade-in">
          <div className="mt-8 mb-4 flex items-center gap-2">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Crown size={20} />Optimal Draft</h2>
            <ExplanationDrawer />
          </div>

          <OptimalPitch players={optimalPlayers} highlightedUsername={highlightedUsername} highlightColor={highlightColor} />

          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="text-lg font-semibold">Total</span>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black font-bold text-xl">
              {optimalTotal}
            </div>
          </div>

          {activeUsers.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2"><Gauge size={20} />Efficiency</h2>
                <EfficiencyDrawer />
              </div>
              <div className="flex flex-wrap justify-around gap-6">
                {activeUsers.map((u) => {
                  const isHighlighted = highlightedUserId === u.user_id
                  const userColor = chartColorForUserId(u.user_id, history?.series ?? [])
                  return (
                    <EfficiencyRing
                      key={u.user_id}
                      user={u}
                      optimalTotal={optimalTotal}
                      highlighted={isHighlighted}
                      dimmed={highlightedUserId !== null && !isHighlighted}
                      highlightColor={userColor}
                      onClick={() => handleHighlight(isHighlighted ? null : u.user_id)}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
    )}
    </>
  )
}
