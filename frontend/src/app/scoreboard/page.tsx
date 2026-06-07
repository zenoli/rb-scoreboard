'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { api } from '@/lib/api'
import type { ScoreboardResponse, ScoreHistoryResponse, UserScore } from '@/lib/types'
import { ScoreHistoryChart, chartColorForUserId } from '@/components/score-history-chart'
import {
  Target,
  Handshake,
  Layers2,
  Shield,
  Sigma,
  type LucideProps,
} from 'lucide-react'
import Image from 'next/image'
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

function nameColumnDef(historySeries: { user_id: number }[]): ColumnDef<Row> {
  return {
    accessorKey: 'username',
    header: () => (
      <div className="flex translate-y-2 items-end text-[0.6rem] font-bold uppercase">
        Name
      </div>
    ),
    cell: ({ row, getValue }) => {
      const color = chartColorForUserId(row.original.user_id, historySeries)
      return (
        <div className="flex items-center gap-2 font-medium">
          {color && (
            <span
              className="shrink-0 rounded-full size-2"
              style={{ backgroundColor: color }}
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
    cell: ({ column, getValue }) => <ScoreCell column={column} value={getValue<number>()} />,
  },
  {
    accessorKey: 'total',
    header: ({ column }) => <ColHeader name="Total" icon={Sigma} column={column} />,
    cell: ({ column, getValue }) => <ScoreCell column={column} value={getValue<number>()} />,
  },
]

export default function ScoreboardPage() {
  const router = useRouter()
  const [data, setData] = useState<ScoreboardResponse | null>(null)
  const [history, setHistory] = useState<ScoreHistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'total', desc: true }])

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

  const columns = useMemo(
    () => [nameColumnDef(history?.series ?? []), ...columnDefs],
    [history?.series]
  )

  const rows: Row[] = useMemo(
    () =>
      (data?.users ?? [])
        .filter((u) => u.is_active)
        .map((u) => ({ ...u, booking: u.yellow_cards + u.red_cards })),
    [data]
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
      <div className="max-w-5xl mx-auto px-4 py-8 text-center text-destructive">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded mb-2" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex justify-center mb-6">
        <Image src="/wc2026-logo.svg" alt="FIFA World Cup 2026" width={48} height={74} priority className="dark:invert" />
      </div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Scoreboard</h1>
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
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => router.push(`/scoreboard/${row.original.user_id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-0 first:pl-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {history && history.dates.length > 0 && (
        <div className="mt-6 rounded-md border p-4">
          <h2 className="text-sm font-semibold mb-4">Points over time</h2>
          <ScoreHistoryChart data={history} />
        </div>
      )}
    </div>
  )
}
