'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { CoachResponse, PlayerResponse } from '@/lib/types'

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
const REQUIRED: Record<string, number> = { GK: 1, DEF: 5, MID: 5, FWD: 5 }

export default function AdminDraftPage() {
  const params = useParams()
  const router = useRouter()
  const userId = Number(params.userId)

  const [apiKey, setApiKey] = useState('')
  const [players, setPlayers] = useState<PlayerResponse[]>([])
  const [coaches, setCoaches] = useState<CoachResponse[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<Set<number>>(new Set())
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null)
  const [posFilter, setPosFilter] = useState<string>('GK')
  const [countryFilter, setCountryFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [username, setUsername] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  useEffect(() => {
    const key = localStorage.getItem('admin_api_key') ?? ''
    setApiKey(key)

    Promise.all([api.players(), api.coaches(), api.adminDraft(userId, key).catch(() => null)])
      .then(([ps, cs, existing]) => {
        setPlayers(ps)
        setCoaches(cs)
        if (existing?.username) setUsername(existing.username)
        if (existing?.entries?.length) {
          const playerIds = existing.entries
            .filter((e: { player_id: number | null }) => e.player_id !== null)
            .map((e: { player_id: number }) => e.player_id)
          const coachEntry = existing.entries.find((e: { coach_id: number | null }) => e.coach_id !== null)
          setSelectedPlayers(new Set(playerIds))
          if (coachEntry) setSelectedCoach(coachEntry.coach_id)
          setHasDraft(true)
        }
      })
      .finally(() => setLoading(false))
  }, [userId])

  const selectedByPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const pid of selectedPlayers) {
    const p = players.find((x) => x.id === pid)
    if (p?.position_category && p.position_category in selectedByPos) {
      selectedByPos[p.position_category].push(pid)
    }
  }

  // Teams already in the draft (for 1-per-team enforcement)
  const draftedTeams = new Set(
    [...selectedPlayers].map((pid) => players.find((p) => p.id === pid)?.team_id).filter(Boolean)
  )

  function togglePlayer(p: PlayerResponse) {
    const cat = p.position_category ?? ''
    if (!selectedPlayers.has(p.id)) {
      const maxForPos = REQUIRED[cat] ?? 0
      if ((selectedByPos[cat]?.length ?? 0) >= maxForPos) return
      if (p.team_id && draftedTeams.has(p.team_id)) return
      setSelectedPlayers((prev) => new Set([...prev, p.id]))
    } else {
      setSelectedPlayers((prev) => { const s = new Set(prev); s.delete(p.id); return s })
    }
  }

  const countries = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; image_path: string | null; short_code: string | null }>()
    for (const p of players) {
      if (p.team_id != null && !seen.has(p.team_id)) {
        seen.set(p.team_id, { id: p.team_id, name: p.team_name ?? '', image_path: p.team_image_path, short_code: p.team_short_code })
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [players])

  const filteredPlayers = players
    .filter((p) => p.position_category === posFilter)
    .filter((p) => countryFilter == null || p.team_id === countryFilter)
    .filter((p) => !search || (p.display_name ?? '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.team_name ?? '').localeCompare(b.team_name ?? ''))

  const filteredCoaches = coaches
    .filter((c) => !search || (c.display_name ?? '').toLowerCase().includes(search.toLowerCase()))

  const isComplete =
    selectedPlayers.size === 16 && selectedCoach !== null

  async function save() {
    if (!apiKey) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.assignDraft(userId, { player_ids: [...selectedPlayers], coach_id: selectedCoach! }, apiKey)
      setSaveOk(true)
      setTimeout(() => router.push('/admin'), 1000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <h1 className="text-xl font-semibold">
          {hasDraft ? 'Edit draft' : 'Assign draft'}{username ? ` of ${username}` : ''}
        </h1>
      </div>

      {/* Slot summary */}
      <div className="rounded-lg border p-3 bg-card flex flex-wrap gap-3">
        {POSITIONS.map((pos) => {
          const have = selectedByPos[pos]?.length ?? 0
          const need = REQUIRED[pos]
          return (
            <div key={pos} className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">{pos}</span>
              <Badge variant={have === need ? 'default' : 'outline'} className="text-xs">
                {have}/{need}
              </Badge>
            </div>
          )
        })}
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Coach</span>
          <Badge variant={selectedCoach ? 'default' : 'outline'} className="text-xs">
            {selectedCoach ? '✓' : '—'}
          </Badge>
        </div>
        <div className="flex flex-col items-center ml-auto">
          <span className="text-xs text-muted-foreground">Total</span>
          <Badge variant={isComplete ? 'default' : 'secondary'} className="text-xs">
            {selectedPlayers.size}/16
          </Badge>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Country filter */}
      {posFilter !== 'Coach' && (
        <div className="grid grid-cols-8 gap-x-2 gap-y-3">
          {countries.map((country) => {
            const isDrafted = draftedTeams.has(country.id)
            const isSelected = countryFilter === country.id
            return (
              <button
                key={country.id}
                onClick={() => !isDrafted && setCountryFilter(isSelected ? null : country.id)}
                disabled={isDrafted}
                title={country.name}
                className={`flex flex-col items-center gap-1 transition-all ${
                  isDrafted ? 'cursor-not-allowed' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-full overflow-hidden transition-all ${
                  isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                } ${isDrafted ? 'grayscale' : ''}`}>
                  {country.image_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={country.image_path}
                      alt={country.name}
                      className="w-full h-full object-cover scale-150"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-[9px] font-medium">
                      {country.short_code ?? country.name.slice(0, 3).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] leading-none ${isDrafted ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                  {country.short_code ?? country.name.slice(0, 3).toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <Tabs value={posFilter === 'Coach' ? 'Coach' : posFilter} onValueChange={setPosFilter}>
        <TabsList className="flex-wrap h-auto gap-1">
          {POSITIONS.map((pos) => (
            <TabsTrigger key={pos} value={pos}>
              {pos} {selectedByPos[pos]?.length ?? 0}/{REQUIRED[pos]}
            </TabsTrigger>
          ))}
          <TabsTrigger value="Coach">Coach {selectedCoach ? '✓' : '—'}</TabsTrigger>
        </TabsList>

        {POSITIONS.map((pos) => (
          <TabsContent key={pos} value={pos}>
            <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
              {filteredPlayers.map((p) => {
                const isSelected = selectedPlayers.has(p.id)
                const posSlotFull = (selectedByPos[p.position_category ?? '']?.length ?? 0) >= (REQUIRED[p.position_category ?? ''] ?? 0)
                const teamConflict = !isSelected && p.team_id != null && draftedTeams.has(p.team_id)
                const disabled = !isSelected && (posSlotFull || teamConflict)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p)}
                    disabled={disabled}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border-primary'
                        : disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <PlayerIcon
                      imagePath={p.image_path}
                      name={p.display_name}
                      teamImagePath={p.team_image_path}
                      size={32}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.display_name}</div>
                      <div className="text-xs text-muted-foreground">{p.team_name}</div>
                    </div>
                    {isSelected && <span className="text-primary font-bold text-sm">✓</span>}
                    {teamConflict && !isSelected && <span className="text-xs text-muted-foreground">team taken</span>}
                  </button>
                )
              })}
              {filteredPlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No players found.</p>
              )}
            </div>
          </TabsContent>
        ))}

        <TabsContent value="Coach">
          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
            {filteredCoaches.map((c) => {
              const isSelected = selectedCoach === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCoach(isSelected ? null : c.id)}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                    isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                  }`}
                >
                  <PlayerIcon
                    imagePath={c.image_path}
                    name={c.display_name}
                    teamImagePath={c.team_image_path}
                    size={32}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.display_name}</div>
                    <div className="text-xs text-muted-foreground">{c.team_name}</div>
                  </div>
                  {isSelected && <span className="text-primary font-bold text-sm">✓</span>}
                </button>
              )
            })}
            {filteredCoaches.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No coaches found.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Save */}
      <div className="flex flex-col gap-2 pt-2">
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
        {saveOk && <p className="text-xs text-green-600">Saved! Redirecting…</p>}
        <div className="flex gap-2">
          <button
            onClick={() => { setSelectedPlayers(new Set()); setSelectedCoach(null); setHasDraft(false) }}
            disabled={saving}
            className="rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            onClick={save}
            disabled={!isComplete || saving}
            className="flex-1 rounded-md bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : `${hasDraft ? 'Update' : 'Save'} Draft (${selectedPlayers.size}/16 players${selectedCoach ? ' + coach' : ''})`}
          </button>
        </div>
      </div>
    </div>
  )
}
