'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PlayerIcon } from '@/components/ui/player-icon'
import { api } from '@/lib/api'
import type { CoachResponse, PlayerResponse, UserDraft } from '@/lib/types'

const REQUIRED: Record<string, number> = { GK: 1, DEF: 5, MID: 5, FWD: 5 }
type Position = 'FWD' | 'MID' | 'DEF' | 'GK' | 'Coach'

interface ModalState {
  userId: number
  username: string
  position: Position
  slotIndex: number
}

type SlotState = Map<string, (number | null)[]> // key: `${userId}-${position}`

function slotKey(userId: number, position: string) {
  return `${userId}-${position}`
}

function buildSlotState(drafts: UserDraft[]): SlotState {
  const map: SlotState = new Map()
  for (const draft of drafts) {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      const count = REQUIRED[pos]
      const posPlayers = draft.players
        .filter((p) => p.position_category === pos)
        .sort((a, b) => a.id - b.id)
      const slots: (number | null)[] = Array(count).fill(null)
      posPlayers.forEach((p, i) => { slots[i] = p.id })
      map.set(slotKey(draft.user_id, pos), slots)
    }
  }
  return map
}

// ─── Small pitch components ───────────────────────────────────────────────────

function EmptySlot({ label, onClick, iconSize = 56 }: { label: string; onClick: () => void; iconSize?: number }) {
  const inner = Math.round(iconSize * 0.43)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex flex-col items-center gap-0.5 group"
    >
      <div
        className="rounded-full border-2 border-dashed border-white/40 flex items-center justify-center bg-black/5 group-hover:bg-black/25 group-hover:border-white/80 transition-all"
        style={{ width: iconSize, height: iconSize }}
      >
        <svg style={{ width: inner, height: inner }} className="text-white/40 group-hover:text-white/70 transition-colors" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 10a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
        </svg>
      </div>
      <span className="text-[11px] text-white/50 leading-none">{label}</span>
    </button>
  )
}

function FilledSlot({
  name,
  imagePath,
  teamImagePath,
  onRemove,
  iconSize = 56,
}: {
  name: string | null
  imagePath: string | null
  teamImagePath: string | null
  onRemove: () => void
  iconSize?: number
}) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="flex flex-col items-center gap-2 group">
      <div className="relative">
        <PlayerIcon
          imagePath={imagePath}
          name={name}
          teamImagePath={teamImagePath}
          size={iconSize}
          avatarClassName="ring-2 ring-white shadow"
        />
        <div className="absolute inset-0 bg-red-500/70 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" style={{ zIndex: 20 }}>
          <span className="text-white text-xs font-bold">✕</span>
        </div>
      </div>
      <span className="text-[11px] text-white font-medium truncate leading-none" style={{ maxWidth: iconSize + 4 }}>
        {name?.split(' ').pop() ?? ''}
      </span>
    </button>
  )
}

function PositionRow({
  slots,
  position,
  onEmptyClick,
  onFilledClick,
  iconSize,
}: {
  slots: ({ id: number; display_name: string | null; image_path: string | null; team_image_path: string | null } | null)[]
  position: string
  onEmptyClick: (slotIndex: number) => void
  onFilledClick: (playerId: number) => void
  iconSize?: number
}) {
  return (
    <div className="flex justify-around items-end py-1">
      {slots.map((player, i) =>
        player ? (
          <FilledSlot
            key={player.id}
            name={player.display_name}
            imagePath={player.image_path}
            teamImagePath={player.team_image_path}
            onRemove={() => onFilledClick(player.id)}
            iconSize={iconSize}
          />
        ) : (
          <EmptySlot key={`empty-${i}`} label={position} onClick={() => onEmptyClick(i)} iconSize={iconSize} />
        )
      )}
    </div>
  )
}

function UserPitch({
  draft,
  slotState,
  onSlotClick,
  onRemovePlayer,
  onCoachClick,
  onRemoveCoach,
  onPitchClick,
  isFocused,
}: {
  draft: UserDraft
  slotState: SlotState
  onSlotClick: (position: Position, slotIndex: number) => void
  onRemovePlayer: (playerId: number) => void
  onCoachClick: () => void
  onRemoveCoach: () => void
  onPitchClick?: () => void
  isFocused?: boolean
}) {
  const iconSize = isFocused ? 72 : 56
  const playerById = new Map(draft.players.map((p) => [p.id, { ...p, team_image_path: p.team_image_path ?? null }]))

  function getSlotsForPos(pos: string) {
    const ids = slotState.get(slotKey(draft.user_id, pos)) ?? Array(REQUIRED[pos]).fill(null)
    return ids.map((id) => (id != null ? (playerById.get(id) ?? null) : null))
  }

  const pitchBackground = 'linear-gradient(180deg, #2d7a27 0%, #3a9e33 50%, #2d7a27 100%)'

  const pitchContent = (
    <>
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 320 480"
        preserveAspectRatio="xMidYMid meet"
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
      <div className="absolute inset-0 z-10 flex flex-col justify-between py-2">
        <PositionRow slots={getSlotsForPos('FWD')} position="FWD" onEmptyClick={(i) => onSlotClick('FWD', i)} onFilledClick={onRemovePlayer} iconSize={iconSize} />
        <PositionRow slots={getSlotsForPos('MID')} position="MID" onEmptyClick={(i) => onSlotClick('MID', i)} onFilledClick={onRemovePlayer} iconSize={iconSize} />
        <PositionRow slots={getSlotsForPos('DEF')} position="DEF" onEmptyClick={(i) => onSlotClick('DEF', i)} onFilledClick={onRemovePlayer} iconSize={iconSize} />
        <PositionRow slots={getSlotsForPos('GK')}  position="GK"  onEmptyClick={(i) => onSlotClick('GK',  i)} onFilledClick={onRemovePlayer} iconSize={iconSize} />
      </div>
    </>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`font-bold text-center truncate px-1 ${isFocused ? 'text-3xl' : 'text-xl'}`}>
        {draft.username}
      </div>

      {isFocused ? (
        /* Focused: explicit 2/3 height, aspect ratio preserved */
        <div
          className={`relative rounded-lg overflow-hidden w-full ${onPitchClick ? 'cursor-pointer' : ''}`}
          style={{ aspectRatio: '2/3', height: 'min(calc(80dvh - 56px), 70dvw)', background: pitchBackground }}
          onClick={onPitchClick}
        >
          {pitchContent}
        </div>
      ) : (
        /* Grid: full column width, 2/3 aspect ratio */
        <div
          className={`relative rounded-lg overflow-hidden w-full ${onPitchClick ? 'cursor-pointer' : ''}`}
          style={{ aspectRatio: '2/3', background: pitchBackground }}
          onClick={onPitchClick}
        >
          {pitchContent}
        </div>
      )}

      {/* Coach */}
      <div className="flex-shrink-0 flex justify-center py-1">
        {draft.coach ? (
          <button onClick={(e) => { e.stopPropagation(); onRemoveCoach() }} className="flex flex-col items-center gap-2 group">
            <div className="relative">
              <PlayerIcon
                imagePath={draft.coach.image_path}
                name={draft.coach.display_name}
                teamImagePath={draft.coach.team_image_path}
                size={iconSize}
                avatarClassName="ring-2 ring-white shadow"
              />
              <div className="absolute inset-0 bg-red-500/70 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" style={{ zIndex: 20 }}>
                <span className="text-white text-xs font-bold">✕</span>
              </div>
            </div>
            <span className="text-[11px] text-white font-medium truncate leading-none" style={{ maxWidth: iconSize + 4 }}>
              {draft.coach.display_name?.split(' ').pop() ?? ''}
            </span>
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onCoachClick() }}
            className="flex flex-col items-center gap-0.5 group"
          >
            <div
              className="rounded-full border-2 border-dashed border-white/40 flex items-center justify-center bg-black/5 group-hover:bg-black/25 group-hover:border-white/80 transition-all"
              style={{ width: iconSize, height: iconSize }}
            >
              <svg style={{ width: Math.round(iconSize * 0.43), height: Math.round(iconSize * 0.43) }} className="text-white/40 group-hover:text-white/70 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 10a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
              </svg>
            </div>
            <span className="text-[11px] text-white/50 leading-none">Coach</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Pick Modal ───────────────────────────────────────────────────────────────

function PickModal({
  modal,
  players,
  coaches,
  allDrafts,
  onPick,
  onClose,
}: {
  modal: ModalState
  players: PlayerResponse[]
  coaches: CoachResponse[]
  allDrafts: UserDraft[]
  onPick: (playerId: number | null, coachId: number | null) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState<number | null>(null)

  const userDraft = allDrafts.find((d) => d.user_id === modal.userId)

  // All globally picked player IDs across all users
  const globallyPickedPlayerIds = useMemo(() => {
    const ids = new Set<number>()
    for (const d of allDrafts) {
      for (const p of d.players) ids.add(p.id)
    }
    return ids
  }, [allDrafts])

  // All globally picked coach IDs
  const globallyPickedCoachIds = useMemo(() => {
    const ids = new Set<number>()
    for (const d of allDrafts) {
      if (d.coach) ids.add(d.coach.id)
    }
    return ids
  }, [allDrafts])

  // Teams already in this user's draft (cross-ref with full player list to get team_id)
  const userTeamIds = useMemo(() => {
    if (!userDraft) return new Set<number>()
    const pickedIds = new Set(userDraft.players.map((p) => p.id))
    const teamIds = new Set<number>()
    for (const p of players) {
      if (pickedIds.has(p.id) && p.team_id != null) teamIds.add(p.team_id)
    }
    return teamIds
  }, [userDraft, players])

  const isCoach = modal.position === 'Coach'

  const positionPlayers = useMemo(
    () => players.filter((p) => p.position_category === modal.position),
    [players, modal.position]
  )

  const countries = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; image_path: string | null; short_code: string | null }>()
    for (const p of positionPlayers) {
      if (p.team_id != null && !seen.has(p.team_id)) {
        seen.set(p.team_id, {
          id: p.team_id,
          name: p.team_name ?? '',
          image_path: p.team_image_path,
          short_code: p.team_short_code,
        })
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [positionPlayers])

  const filteredPlayers = positionPlayers
    .filter((p) => countryFilter == null || p.team_id === countryFilter)
    .filter((p) => !search || (p.display_name ?? '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.team_name ?? '').localeCompare(b.team_name ?? ''))

  const filteredCoaches = coaches
    .filter((c) => !search || (c.display_name ?? '').toLowerCase().includes(search.toLowerCase()))

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh] pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="bg-background rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <div>
            <div className="text-xs text-muted-foreground">Picking for</div>
            <div className="font-semibold">{modal.username} — {modal.position}</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCountryFilter(null) }}
              className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Country filter (players only) */}
        {!isCoach && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="grid grid-cols-8 gap-x-3 gap-y-2.5">
              {countries.map((country) => {
                const isSelected = countryFilter === country.id
                const isDrafted = userTeamIds.has(country.id)
                return (
                  <button
                    key={country.id}
                    onClick={() => !isDrafted && setCountryFilter(isSelected ? null : country.id)}
                    title={country.name}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <div className={`w-10 h-10 rounded-full overflow-hidden transition-all ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''} ${isDrafted ? 'grayscale' : ''}`}>
                      {country.image_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={country.image_path} alt={country.name} className="w-full h-full object-cover scale-150" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-[11px] font-medium">
                          {country.short_code ?? country.name.slice(0, 3).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className={`text-[11px] leading-none ${isDrafted ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                      {country.short_code ?? country.name.slice(0, 3).toUpperCase()}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Player / Coach list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-1">
            {isCoach ? (
              <>
                {filteredCoaches.map((c) => {
                  const isTaken = globallyPickedCoachIds.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => !isTaken && onPick(null, c.id)}
                      disabled={isTaken}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        isTaken ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent'
                      }`}
                    >
                      <PlayerIcon
                        imagePath={c.image_path}
                        name={c.display_name}
                        teamImagePath={c.team_image_path}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.display_name}</div>
                        <div className="text-xs text-muted-foreground">{c.team_name}</div>
                      </div>
                      {isTaken && <span className="text-xs text-muted-foreground flex-shrink-0">taken</span>}
                    </button>
                  )
                })}
                {filteredCoaches.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No coaches found.</p>
                )}
              </>
            ) : (
              <>
                {filteredPlayers.map((p) => {
                  const isGloballyTaken = globallyPickedPlayerIds.has(p.id)
                  const isTeamConflict = !isGloballyTaken && p.team_id != null && userTeamIds.has(p.team_id)
                  const disabled = isGloballyTaken || isTeamConflict
                  return (
                    <button
                      key={p.id}
                      onClick={() => !disabled && onPick(p.id, null)}
                      disabled={disabled}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent'
                      }`}
                    >
                      <PlayerIcon
                        imagePath={p.image_path}
                        name={p.display_name}
                        teamImagePath={p.team_image_path}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.display_name}</div>
                        <div className="text-xs text-muted-foreground">{p.team_name}</div>
                      </div>
                      {isGloballyTaken && <span className="text-xs text-muted-foreground flex-shrink-0">taken</span>}
                      {isTeamConflict && <span className="text-xs text-muted-foreground flex-shrink-0">team taken</span>}
                    </button>
                  )
                })}
                {filteredPlayers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No players found.</p>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InteractiveDraftPage() {
  const [apiKey, setApiKey] = useState('')
  const [drafts, setDrafts] = useState<UserDraft[] | null>(null)
  const [players, setPlayers] = useState<PlayerResponse[]>([])
  const [coaches, setCoaches] = useState<CoachResponse[]>([])
  const [slotState, setSlotState] = useState<SlotState>(new Map())
  const [modal, setModal] = useState<ModalState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [focusedUserId, setFocusedUserId] = useState<number | null>(null)

  useEffect(() => {
    const key = localStorage.getItem('admin_api_key') ?? ''
    setApiKey(key)

    Promise.all([api.drafts(), api.players(), api.coaches()])
      .then(([ds, ps, cs]) => {
        setDrafts(ds)
        setPlayers(ps)
        setCoaches(cs)
        setSlotState(buildSlotState(ds))
      })
      .catch((e) => setError(e.message))
  }, [])

  async function refreshDrafts() {
    try {
      const ds = await api.drafts()
      setDrafts(ds)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Refresh failed')
    }
  }

  async function handlePick(playerId: number | null, coachId: number | null) {
    if (!modal) return
    setActionError(null)
    try {
      if (playerId != null) {
        await api.addPick(modal.userId, { player_id: playerId }, apiKey)
        // Place the player in the specific slot that was clicked
        setSlotState((prev) => {
          const key = slotKey(modal.userId, modal.position)
          const slots = [...(prev.get(key) ?? Array(REQUIRED[modal.position]).fill(null))]
          slots[modal.slotIndex] = playerId
          return new Map(prev).set(key, slots)
        })
      } else if (coachId != null) {
        await api.addPick(modal.userId, { coach_id: coachId }, apiKey)
      }
      setModal(null)
      await refreshDrafts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Pick failed')
    }
  }

  async function handleRemovePlayer(userId: number, playerId: number) {
    setActionError(null)
    try {
      await api.removePick(userId, { player_id: playerId }, apiKey)
      // Clear just this player's slot, leaving all other slots in place
      const draft = drafts?.find((d) => d.user_id === userId)
      const pos = draft?.players.find((p) => p.id === playerId)?.position_category
      if (pos) {
        setSlotState((prev) => {
          const key = slotKey(userId, pos)
          const slots = (prev.get(key) ?? []).map((id) => (id === playerId ? null : id))
          return new Map(prev).set(key, slots)
        })
      }
      await refreshDrafts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  async function handleRemoveCoach(userId: number, coachId: number) {
    setActionError(null)
    try {
      await api.removePick(userId, { coach_id: coachId }, apiKey)
      await refreshDrafts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  if (error) {
    return <div className="max-w-2xl mx-auto px-4 py-8 text-destructive">{error}</div>
  }

  if (!drafts) {
    return (
      <div className="px-4 py-8">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-6" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const draftUsers = drafts.filter((d) => d.is_active)
  const focusedDraft = focusedUserId != null ? draftUsers.find((d) => d.user_id === focusedUserId) ?? null : null

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground">← Admin</a>
        <h1 className="text-xl font-semibold">Interactive Draft</h1>
        <div className="ml-auto text-xs text-muted-foreground">
          Click a pitch to focus · Click a slot to pick or undo
        </div>
      </div>

      {actionError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Pitch grid — 3 columns, 2 rows */}
      <div className="grid grid-cols-3 gap-7 max-w-6xl mx-auto w-full">
        {draftUsers.map((draft) => (
          <UserPitch
            key={draft.user_id}
            draft={draft}
            slotState={slotState}
            onSlotClick={(position, slotIndex) =>
              setModal({ userId: draft.user_id, username: draft.username, position, slotIndex })
            }
            onRemovePlayer={(playerId) => handleRemovePlayer(draft.user_id, playerId)}
            onCoachClick={() =>
              setModal({ userId: draft.user_id, username: draft.username, position: 'Coach', slotIndex: 0 })
            }
            onRemoveCoach={() => draft.coach && handleRemoveCoach(draft.user_id, draft.coach.id)}
            onPitchClick={() => setFocusedUserId(draft.user_id)}
          />
        ))}
      </div>

      {/* Focus overlay */}
      <AnimatePresence>
        {focusedDraft && (
          <>
            {/* Dimmed backdrop — clicking it dismisses focus */}
            <motion.div
              key="focus-backdrop"
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFocusedUserId(null)}
            />
            {/* Focused pitch card */}
            <motion.div
              key="focus-card"
              className="fixed inset-0 z-[41] flex items-center justify-center pt-16 pointer-events-none"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <div className="pointer-events-auto">
                <UserPitch
                  draft={focusedDraft}
                  slotState={slotState}
                  onSlotClick={(position, slotIndex) =>
                    setModal({ userId: focusedDraft.user_id, username: focusedDraft.username, position, slotIndex })
                  }
                  onRemovePlayer={(playerId) => handleRemovePlayer(focusedDraft.user_id, playerId)}
                  onCoachClick={() =>
                    setModal({ userId: focusedDraft.user_id, username: focusedDraft.username, position: 'Coach', slotIndex: 0 })
                  }
                  onRemoveCoach={() => focusedDraft.coach && handleRemoveCoach(focusedDraft.user_id, focusedDraft.coach.id)}
                  isFocused
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal && (
          <PickModal
            modal={modal}
            players={players}
            coaches={coaches}
            allDrafts={drafts}
            onPick={handlePick}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
