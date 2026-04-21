'use client'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TAnalyticsPeriod } from '@creator-hub/types'

const STORAGE_KEY = 'analytics.period'

export function usePeriodFilter(current: TAnalyticsPeriod) {
  const router = useRouter()

  const setPeriod = useCallback(
    (period: TAnalyticsPeriod) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, String(period))
      }
      router.push(`?period=${period}`)
    },
    [router],
  )

  return { current, setPeriod }
}
