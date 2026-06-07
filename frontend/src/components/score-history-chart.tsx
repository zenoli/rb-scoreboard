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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { ScoreHistoryResponse } from '@/lib/types'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function formatDate(iso: unknown) {
  if (typeof iso !== 'string') return String(iso ?? '')
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function ScoreHistoryChart({ data }: { data: ScoreHistoryResponse }) {
  if (data.dates.length === 0) return null

  // Build recharts data: [{ date, username: points, ... }]
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

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
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
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={formatDate}
              indicator="dot"
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {data.series.map((s, i) => (
          <Line
            key={s.username}
            dataKey={s.username}
            type="monotoneX"
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
