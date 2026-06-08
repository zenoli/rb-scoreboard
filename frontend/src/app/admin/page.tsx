'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { AdminUser, Season } from '@/lib/types'

const SYNC_TARGETS = ['teams', 'fixtures', 'events', 'all_events', 'event_types', 'lineups']

export default function AdminPage() {
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({})

  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [activatingSeason, setActivatingSeason] = useState<number | null>(null)
  const [syncStatusText, setSyncStatusText] = useState<string>('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ username: '', password: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('admin_api_key') ?? ''
    setSavedKey(stored)
    setApiKey(stored)
  }, [])

  useEffect(() => {
    if (!savedKey) {
      api.seasons().then(setSeasons).catch(() => {})
      return
    }
    setSeasonLoading(true)
    api.fetchSeasonsFromSportmonks(savedKey)
      .then((loaded) => {
        setSeasons(loaded)
        // Check if the active season is already syncing (e.g. from startup)
        const active = loaded.find((s: Season) => s.is_active)
        if (active) {
          api.seasonSyncStatus(active.id, savedKey).then((res) => {
            if (res.status !== 'idle' && res.status !== 'done' && !res.status.startsWith('error')) {
              setActivatingSeason(active.id)
              setSyncStatusText(res.status)
              pollSyncStatus(active.id, savedKey)
            }
          }).catch(() => {})
        }
      })
      .catch(() => api.seasons().then(setSeasons).catch(() => {}))
      .finally(() => setSeasonLoading(false))
  }, [savedKey])

  useEffect(() => {
    if (!savedKey) return
    api.adminUsers(savedKey)
      .then(setUsers)
      .catch((e) => setError(e.message))
  }, [savedKey])

  function saveKey() {
    localStorage.setItem('admin_api_key', apiKey)
    setSavedKey(apiKey)
    setError(null)
    setUsers(null)
  }

  async function sync(target: string) {
    setSyncStatus((s) => ({ ...s, [target]: 'syncing…' }))
    try {
      const res = await api.syncTarget(target, savedKey)
      setSyncStatus((s) => ({ ...s, [target]: res.message ?? 'done' }))
    } catch (e) {
      setSyncStatus((s) => ({ ...s, [target]: e instanceof Error ? e.message : 'error' }))
    }
  }

  async function handleActivateSeason(seasonId: number) {
    setSeasonLoading(true)
    setActivatingSeason(seasonId)
    try {
      const updated = await api.activateSeason(seasonId, savedKey)
      setSeasons((prev) => prev.map((s) => ({ ...s, is_active: s.id === updated.id })))
      // Poll sync status until done or error
      pollSyncStatus(seasonId, savedKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch season')
      setActivatingSeason(null)
    } finally {
      setSeasonLoading(false)
    }
  }

  function pollSyncStatus(seasonId: number, key: string) {
    const deadline = Date.now() + 10 * 60 * 1000 // 10 min timeout
    const interval = setInterval(async () => {
      try {
        const res = await api.seasonSyncStatus(seasonId, key)
        setSyncStatusText(res.status)
        if (res.status === 'done' || res.status.startsWith('error') || Date.now() > deadline) {
          clearInterval(interval)
          setActivatingSeason(null)
          setSyncStatusText('')
        }
      } catch {
        clearInterval(interval)
        setActivatingSeason(null)
        setSyncStatusText('')
      }
    }, 2000)
  }

  async function handleRefreshSeasons() {
    setSeasonLoading(true)
    try {
      const updated = await api.fetchSeasonsFromSportmonks(savedKey)
      setSeasons(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch seasons')
    } finally {
      setSeasonLoading(false)
    }
  }

  async function handleCreateUser() {
    setFormLoading(true)
    setFormError(null)
    try {
      const user = await api.createUser(form, savedKey)
      setUsers((prev) => prev ? [...prev, user] : [user])
      setModalOpen(false)
      setForm({ username: '', password: '' })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create user')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await api.deleteUser(deleteTarget.id, savedKey)
      setUsers((prev) => prev ? prev.filter((u) => u.id !== deleteTarget.id) : prev)
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user')
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function toggleActive(user: AdminUser) {
    try {
      const updated = await api.setUserActive(user.id, !user.is_active, savedKey)
      setUsers((prev) => prev ? prev.map((u) => u.id === user.id ? updated : u) : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    }
  }

  async function handleResetDb() {
    setResetLoading(true)
    setResetError(null)
    try {
      await api.resetDb(savedKey)
      setUsers([])
      setResetModalOpen(false)
      setResetConfirmText('')
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Failed to reset database')
    } finally {
      setResetLoading(false)
    }
  }

  const activeSeason = seasons.find((s) => s.is_active)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Admin</h1>

      {/* API Key */}
      <section className="rounded-lg border p-4 bg-card flex flex-col gap-3">
        <h2 className="font-medium text-sm">API Key</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter admin API key"
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={saveKey}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </section>

      {/* Season */}
      <section className="rounded-lg border p-4 bg-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">Season</h2>
          {savedKey && (
            <button
              onClick={handleRefreshSeasons}
              disabled={seasonLoading}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              {seasonLoading ? 'Loading…' : 'Refresh from Sportsmonks'}
            </button>
          )}
        </div>
        {seasons.length === 0 ? (
          <p className="text-xs text-muted-foreground">No seasons configured.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {seasons.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">#{s.sm_season_id}</span>
                  {s.is_active && <Badge className="text-xs">Active</Badge>}
                  {s.is_active && activatingSeason === s.id && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      {syncStatusText || 'syncing…'}
                    </span>
                  )}
                </div>
                {savedKey && !s.is_active && (
                  <button
                    onClick={() => handleActivateSeason(s.id)}
                    disabled={seasonLoading || activatingSeason !== null}
                    className="text-xs text-muted-foreground hover:text-foreground underline transition-colors disabled:opacity-50"
                  >
                    Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {savedKey && (
        <>
          {/* Sync */}
          <section className="rounded-lg border p-4 bg-card flex flex-col gap-3">
            <h2 className="font-medium text-sm">
              Manual Sync
              {activeSeason && <span className="text-muted-foreground font-normal"> — {activeSeason.name}</span>}
            </h2>
            <div className="flex flex-wrap gap-2">
              {SYNC_TARGETS.map((t) => (
                <div key={t} className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => sync(t)}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors capitalize"
                  >
                    {t}
                  </button>
                  {syncStatus[t] && (
                    <span className="text-[10px] text-muted-foreground max-w-[80px] text-center truncate">
                      {syncStatus[t]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Interactive Draft */}
          <section className="rounded-lg border p-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-sm">Interactive Draft</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Live draft session — everyone picks on one shared screen</p>
              </div>
              <Link
                href="/admin/interactive-draft"
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Open →
              </Link>
            </div>
          </section>

          {/* Users */}
          <section className="rounded-lg border p-4 bg-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-sm">
                Users
                {activeSeason && <span className="text-muted-foreground font-normal"> — {activeSeason.name}</span>}
              </h2>
              <button
                onClick={() => { setModalOpen(true); setFormError(null) }}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                + Add user
              </button>
            </div>
            {!users && <div className="h-8 bg-muted animate-pulse rounded" />}
            {users && (
              <div className="flex flex-col gap-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">{u.username}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={u.is_active ? 'default' : 'outline'} className="text-xs">
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <button
                        onClick={() => toggleActive(u)}
                        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <Link
                        href={`/admin/drafts/${u.id}`}
                        className="text-xs underline text-primary hover:no-underline"
                      >
                        Draft
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="text-xs text-destructive hover:underline transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Danger Zone */}
          <section className="rounded-lg border border-destructive/40 p-4 bg-card flex flex-col gap-3">
            <h2 className="font-medium text-sm text-destructive">Danger Zone</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Reset database</p>
                <p className="text-xs text-muted-foreground mt-0.5">Permanently delete all users, drafts, and results. Cannot be undone.</p>
              </div>
              <button
                onClick={() => { setResetModalOpen(true); setResetConfirmText(''); setResetError(null) }}
                className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-medium hover:bg-destructive/90 transition-colors"
              >
                Reset DB
              </button>
            </div>
          </section>
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-sm flex flex-col gap-4 mx-4">
            <h2 className="font-semibold text-base">Delete user?</h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete <span className="font-medium text-foreground">{deleteTarget.username}</span> and all their data. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset DB modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-sm flex flex-col gap-4 mx-4">
            <h2 className="font-semibold text-base">Reset database?</h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete <span className="font-medium text-foreground">all users, drafts, and results</span>. This cannot be undone.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Type <span className="font-mono font-medium text-foreground">reset</span> to confirm</label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="reset"
                className="rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>
            {resetError && <p className="text-xs text-destructive">{resetError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setResetModalOpen(false); setResetConfirmText('') }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                disabled={resetLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleResetDb}
                disabled={resetLoading || resetConfirmText !== 'reset'}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {resetLoading ? 'Resetting…' : 'Reset database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-sm flex flex-col gap-4 mx-4">
            <h2 className="font-semibold text-base">Add user</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setModalOpen(false); setForm({ username: '', password: '' }) }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                disabled={formLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={formLoading || !form.username || !form.password}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {formLoading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
