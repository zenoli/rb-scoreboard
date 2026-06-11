'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '@/lib/api'

const POLL_INTERVAL = 60_000

const LiveStatusContext = createContext(false)

export function useLiveStatus() {
  return useContext(LiveStatusContext)
}

export function LiveStatusProvider({ children }: { children: React.ReactNode }) {
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    function check() {
      api.live()
        .then((d: { is_live: boolean }) => setIsLive(d.is_live))
        .catch(() => {})
    }
    check()
    const interval = setInterval(check, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  return (
    <LiveStatusContext.Provider value={isLive}>
      {children}
    </LiveStatusContext.Provider>
  )
}
