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
            <h2 className="font-medium text-sm">Users</h2>
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
                      <Link
                        href={`/admin/drafts/${u.id}`}
                        className="text-xs underline text-primary hover:no-underline"
                      >
                        Draft
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
