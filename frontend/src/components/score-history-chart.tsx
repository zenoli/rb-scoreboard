'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart'
import type { ScoreHistoryResponse } from '@/lib/types'

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

export function chartColorForUserId(
  userId: number,
  series: { user_id: number }[]
): string | undefined {
  const idx = series.findIndex((s) => s.user_id === userId)
  return idx >= 0 ? CHART_COLORS[idx % CHART_COLORS.length] : undefined
}

function formatDate(iso: unknown) {
  if (typeof iso !== 'string') return String(iso ?? '')
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function ScoreHistoryChart({
  data,
  highlightedUserId,
}: {
  data: ScoreHistoryResponse
  highlightedUserId: number | null
}) {
  if (data.dates.length === 0) return null

  const chartData = data.dates.map((date, i) => {
    const row: Record<string, string | number> = { date }
    for (const s of data.series) {
      row[s.username] = s.points[i] ?? 0
    }
    return row
  })

  const config: ChartConfig = {}
  for (let i = 0; i < data.series.length; i++) {
    const s = data.series[i]
    config[s.username] = {
      label: s.username,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  }

  const hasHighlight = highlightedUserId !== null

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <LineChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatDate}
          tick={{ fontSize: 11 }}
        />
        <YAxis hide />
        {data.series.map((s, i) => {
          const isHighlighted = highlightedUserId === s.user_id
          const color = CHART_COLORS[i % CHART_COLORS.length]
          return (
            <Line
              key={s.username}
              dataKey={s.username}
              type="monotoneX"
              stroke={color}
              strokeWidth={isHighlighted ? 4 : 2}
              strokeOpacity={hasHighlight && !isHighlighted ? 0.3 : 1}
              dot={false}
              activeDot={false}
              style={{ transition: 'stroke-width 200ms ease, stroke-opacity 200ms ease', pointerEvents: 'none', outline: 'none' }}
            />
          )
        })}
      </LineChart>
    </ChartContainer>
  )
}
