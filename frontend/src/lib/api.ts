const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function get(path: string, adminKey?: string) {
  const headers: Record<string, string> = {}
  if (adminKey) headers['X-Admin-Key'] = adminKey
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function put(path: string, body: unknown, adminKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function del(path: string, adminKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': adminKey },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function post(path: string, adminKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Admin-Key': adminKey },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function postJson(path: string, body: unknown, adminKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const api = {
  scores: () => get('/api/scores'),
  scoreEvents: (userId: number) => get(`/api/scores/${userId}/events`),
  drafts: () => get('/api/drafts'),
  draftPoints: (userId: number) => get(`/api/drafts/${userId}/points`),
  players: (params?: { position_category?: string; team_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.position_category) qs.set('position_category', params.position_category)
    if (params?.team_id) qs.set('team_id', String(params.team_id))
    return get(`/api/players${qs.toString() ? '?' + qs.toString() : ''}`)
  },
  coaches: () => get('/api/coaches'),
  adminUsers: (key: string) => get('/admin/users', key),
  createUser: (body: { username: string; password: string }, key: string) =>
    postJson('/admin/users', body, key),
  setUserActive: (userId: number, is_active: boolean, key: string) =>
    put(`/admin/users/${userId}/active`, { is_active }, key),
  deleteUser: async (userId: number, key: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': key },
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  },
  adminDraft: (userId: number, key: string) => get(`/admin/drafts/${userId}`, key),
  assignDraft: (userId: number, body: { player_ids: number[]; coach_id: number }, key: string) =>
    put(`/admin/drafts/${userId}`, body, key),
  addPick: (userId: number, body: { player_id?: number; coach_id?: number }, key: string) =>
    postJson(`/admin/drafts/${userId}/pick`, body, key),
  removePick: (userId: number, params: { player_id?: number; coach_id?: number }, key: string) => {
    const qs = new URLSearchParams()
    if (params.player_id != null) qs.set('player_id', String(params.player_id))
    if (params.coach_id != null) qs.set('coach_id', String(params.coach_id))
    return del(`/admin/drafts/${userId}/pick?${qs.toString()}`, key)
  },
  scoringRules: (key: string) => get('/admin/scoring-rules', key),
  syncTarget: (target: string, key: string) => post(`/admin/sync/${target}`, key),
}
