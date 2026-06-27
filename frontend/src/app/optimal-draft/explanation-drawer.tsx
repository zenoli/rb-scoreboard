'use client'

import { CircleHelp } from 'lucide-react'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'

/* ── Flow-graph SVG (hand-crafted, matches resources/flow-graph-2.png) ── */

const LAYER_COLORS = {
  source: '#94a3b8',    // slate-400
  country: '#60a5fa',   // blue-400
  player: '#4ade80',    // green-400
  position: '#fb923c',  // orange-400
  sink: '#94a3b8',      // slate-400
}

interface Node {
  id: string
  x: number
  y: number
  color: string
  label?: string
}

interface Edge {
  from: string
  to: string
  cap: number
}

const NODES: Node[] = [
  // source
  { id: 's', x: 400, y: 40, color: LAYER_COLORS.source, label: 's' },
  // country layer
  { id: 'SUI', x: 160, y: 140, color: LAYER_COLORS.country, label: 'SUI' },
  { id: 'GER', x: 400, y: 140, color: LAYER_COLORS.country, label: 'GER' },
  { id: 'BRA', x: 640, y: 140, color: LAYER_COLORS.country, label: 'BRA' },
  // player layer
  { id: 's1', x: 100, y: 260, color: LAYER_COLORS.player, label: 's1' },
  { id: 's2', x: 180, y: 260, color: LAYER_COLORS.player, label: 's2' },
  { id: 's3', x: 260, y: 260, color: LAYER_COLORS.player, label: 's3' },
  { id: 'g1', x: 340, y: 260, color: LAYER_COLORS.player, label: 'g1' },
  { id: 'g2', x: 420, y: 260, color: LAYER_COLORS.player, label: 'g2' },
  { id: 'g3', x: 500, y: 260, color: LAYER_COLORS.player, label: 'g3' },
  { id: 'b1', x: 560, y: 260, color: LAYER_COLORS.player, label: 'b1' },
  { id: 'b2', x: 640, y: 260, color: LAYER_COLORS.player, label: 'b2' },
  { id: 'b3', x: 720, y: 260, color: LAYER_COLORS.player, label: 'b3' },
  // position layer
  { id: 'GK', x: 140, y: 380, color: LAYER_COLORS.position, label: 'GK' },
  { id: 'DEF', x: 320, y: 380, color: LAYER_COLORS.position, label: 'DEF' },
  { id: 'MID', x: 500, y: 380, color: LAYER_COLORS.position, label: 'MID' },
  { id: 'FW', x: 660, y: 380, color: LAYER_COLORS.position, label: 'FW' },
  // sink
  { id: 't', x: 400, y: 480, color: LAYER_COLORS.sink, label: 't' },
]

const nodeMap = new Map(NODES.map((n) => [n.id, n]))

const EDGES: Edge[] = [
  // source → countries (cap 1)
  { from: 's', to: 'SUI', cap: 1 },
  { from: 's', to: 'GER', cap: 1 },
  { from: 's', to: 'BRA', cap: 1 },
  // SUI → players
  { from: 'SUI', to: 's1', cap: 1 },
  { from: 'SUI', to: 's2', cap: 1 },
  { from: 'SUI', to: 's3', cap: 1 },
  // GER → players
  { from: 'GER', to: 'g1', cap: 1 },
  { from: 'GER', to: 'g2', cap: 1 },
  { from: 'GER', to: 'g3', cap: 1 },
  // BRA → players
  { from: 'BRA', to: 'b1', cap: 1 },
  { from: 'BRA', to: 'b2', cap: 1 },
  { from: 'BRA', to: 'b3', cap: 1 },
  // players → positions (cross-edges per the diagram)
  // s1: GK
  { from: 's1', to: 'GK', cap: 1 },
  // s2: GK, DEF
  { from: 's2', to: 'GK', cap: 1 },
  { from: 's2', to: 'DEF', cap: 1 },
  // s3: GK, DEF
  { from: 's3', to: 'GK', cap: 1 },
  { from: 's3', to: 'DEF', cap: 1 },
  // g1: DEF
  { from: 'g1', to: 'DEF', cap: 1 },
  // g2: DEF, MID
  { from: 'g2', to: 'DEF', cap: 1 },
  { from: 'g2', to: 'MID', cap: 1 },
  // g3: MID
  { from: 'g3', to: 'MID', cap: 1 },
  // b1: MID
  { from: 'b1', to: 'MID', cap: 1 },
  // b2: MID, FW
  { from: 'b2', to: 'FW', cap: 1 },
  { from: 'b2', to: 'MID', cap: 1 },
  // b3: FW
  { from: 'b3', to: 'FW', cap: 1 },
  // positions → sink
  { from: 'GK', to: 't', cap: 1 },
  { from: 'DEF', to: 't', cap: 5 },
  { from: 'MID', to: 't', cap: 5 },
  { from: 'FW', to: 't', cap: 5 },
]

function FlowGraphSvg() {
  return (
    <svg viewBox="0 0 800 520" className="w-full" aria-label="Min-cost max-flow graph">
      {/* Layer labels */}
      <text x="16" y="145" fill="#94a3b8" fontSize="13" fontStyle="italic">
        country nodes
      </text>
      <text x="16" y="265" fill="#94a3b8" fontSize="13" fontStyle="italic">
        player nodes
      </text>
      <text x="16" y="385" fill="#94a3b8" fontSize="13" fontStyle="italic">
        position nodes
      </text>

      {/* Edges */}
      {EDGES.map((e, i) => {
        const a = nodeMap.get(e.from)!
        const b = nodeMap.get(e.to)!
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(148,163,184,0.35)"
              strokeWidth={1.2}
            />
            <text
              x={mx}
              y={my - 4}
              fill="#cbd5e1"
              fontSize="11"
              textAnchor="middle"
              fontWeight="500"
            >
              {e.cap}
            </text>
          </g>
        )
      })}

      {/* Nodes */}
      {NODES.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={18} fill={n.color} fillOpacity={0.15} stroke={n.color} strokeWidth={1.5} />
          <text
            x={n.x}
            y={n.y + 5}
            fill={n.color}
            fontSize="13"
            fontWeight="600"
            textAnchor="middle"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ── Explanation Drawer ── */

export function ExplanationDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-500/25 transition-colors"
          aria-label="How is the optimal draft computed?"
        >
          <CircleHelp className="size-4" />
          <span className="hidden sm:inline">Explanation</span>
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="text-lg">How is the Optimal Draft computed?</DrawerTitle>
          <DrawerDescription>
            The math behind finding the best possible squad
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-6 pb-8 space-y-6 text-sm leading-relaxed text-popover-foreground/90">
          {/* Section 1: Intro */}
          <section>
            <h3 className="text-base font-semibold mb-2">The problem</h3>
            <p>
              Given all the players in the tournament, what is the best squad you could
              possibly draft? We need to pick exactly <strong>16 players</strong> — 1 goalkeeper,
              5 defenders, 5 midfielders, and 5 forwards — with{' '}
              <strong>at most one player per team</strong>. The goal is to{' '}
              <strong>maximise total points</strong>.
            </p>
            <p className="mt-2">
              This isn&apos;t something you can solve by just sorting players by points and picking
              the top 16 — the position limits and one-per-team constraint make it a genuine
              optimisation problem. Brute-forcing all combinations is out of the question
              (there are far too many). Luckily, there&apos;s an elegant way to solve it.
            </p>
          </section>

          {/* Section 2: Min-cost max-flow */}
          <section>
            <h3 className="text-base font-semibold mb-2">The trick: min-cost max-flow</h3>
            <p>
              We reduce the problem to a well-known problem in graph theory called{' '}
              <a
                href="https://en.wikipedia.org/wiki/Minimum-cost_flow_problem"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                minimum-cost maximum-flow
              </a>
              . The idea: we build a network (a directed graph with capacities and costs on each
              edge) and then &quot;push&quot; as much flow through it as possible, while minimising the
              total cost. Each unit of flow that reaches the sink corresponds to selecting one
              player for our squad.
            </p>
            <p className="mt-2">
              Since we want to <em>maximise</em> points but the algorithm <em>minimises</em>{' '}
              cost, we simply set each player&apos;s edge cost to the <strong>negative</strong> of
              their total points. Minimising negative points = maximising points.
            </p>
          </section>

          {/* Section 3: Graph construction */}
          <section>
            <h3 className="text-base font-semibold mb-2">The graph construction</h3>
            <p className="mb-4">
              We build a 4-layer flow network. Here&apos;s a simplified example with 3 teams
              and 9 players:
            </p>
            <div className="rounded-lg bg-background/60 border p-4">
              <FlowGraphSvg />
            </div>
            <p className="mt-4">
              The graph has four layers, each enforcing a different constraint:
            </p>
            <ul className="mt-2 space-y-3 list-none pl-0">
              <li className="flex gap-2">
                <span className="inline-block size-3 rounded-full mt-1 shrink-0" style={{ background: LAYER_COLORS.source }} />
                <span>
                  <strong>Source (s)</strong> — the starting point. It connects to every team node
                  with capacity <strong>1</strong>, ensuring we pick <em>at most one player per
                  team</em>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="inline-block size-3 rounded-full mt-1 shrink-0" style={{ background: LAYER_COLORS.country }} />
                <span>
                  <strong>Team nodes</strong> — one per team (SUI, GER, BRA, …). Each connects to
                  its players with capacity <strong>1</strong>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="inline-block size-3 rounded-full mt-1 shrink-0" style={{ background: LAYER_COLORS.player }} />
                <span>
                  <strong>Player nodes</strong> — one per player. Each connects to every position
                  the player is eligible for (capacity <strong>1</strong>). This is where the{' '}
                  <strong>cost</strong> lives: the edge cost is set to <em>−(player&apos;s total
                  points)</em>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="inline-block size-3 rounded-full mt-1 shrink-0" style={{ background: LAYER_COLORS.position }} />
                <span>
                  <strong>Position nodes</strong> — GK, DEF, MID, FW. Each connects to the sink
                  with its capacity limit: <strong>1</strong> for GK, <strong>5</strong> for DEF,
                  MID, and FW. This enforces the squad shape.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="inline-block size-3 rounded-full mt-1 shrink-0" style={{ background: LAYER_COLORS.sink }} />
                <span>
                  <strong>Sink (t)</strong> — the endpoint. The total capacity into the sink is
                  1 + 5 + 5 + 5 = <strong>16</strong>, which is exactly the squad size.
                </span>
              </li>
            </ul>
          </section>

          {/* Section 4: Costs */}
          <section>
            <h3 className="text-base font-semibold mb-2">Costs and the objective</h3>
            <p>
              Every edge in the network has zero cost <em>except</em> the player → position
              edges. Those carry a cost equal to the negative of the player&apos;s total points.
              When the algorithm finds the min-cost max-flow, it naturally selects the combination
              of players that maximises total points — while respecting all the capacity
              constraints.
            </p>
          </section>

          {/* Section 5: Result */}
          <section>
            <h3 className="text-base font-semibold mb-2">Reading the result</h3>
            <p>
              Once the algorithm finishes, we simply look at which player → position edges
              carry flow. Each such edge means &quot;this player was selected for this
              position&quot;. The result is the provably optimal squad — no other selection of 16
              players can achieve a higher total score while satisfying all constraints.
            </p>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
