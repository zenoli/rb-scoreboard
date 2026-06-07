'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { AdminUser } from '@/lib/types'

const SYNC_TARGETS = ['teams', 'fixtures', 'events', 'types', 'lineups', 'positions']

export default function AdminPage() {
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({})

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('admin_api_key') ?? ''
    setSavedKey(stored)
    setApiKey(stored)
  }, [])

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

  async function handleCreateUser() {
    setFormLoading(true)
    setFormError(null)
    try {
      const user = await api.createUser(form, savedKey)
      setUsers((prev) => prev ? [...prev, user] : [user])
      setModalOpen(false)
      setForm({ username: '', email: '', password: '' })
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

      {savedKey && (
        <>
          {/* Sync */}
          <section className="rounded-lg border p-4 bg-card flex flex-col gap-3">
            <h2 className="font-medium text-sm">Manual Sync</h2>
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

          {/* Users */}
          <section className="rounded-lg border p-4 bg-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-sm">Users</h2>
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
                      <div className="text-xs text-muted-foreground">{u.email}</div>
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
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
                onClick={() => { setModalOpen(false); setForm({ username: '', email: '', password: '' }) }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                disabled={formLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={formLoading || !form.username || !form.email || !form.password}
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
