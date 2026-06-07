'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/scoreboard/${params.userId}/score-events`)
  }, [params.userId, router])

  return null
}
