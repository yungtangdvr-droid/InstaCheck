'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TPeriod } from '@creator-hub/types'

const STORAGE_KEY = 'creator-hub:period'
const DEFAULT_PERIOD: TPeriod = 30

function isValidPeriod(v: unknown): v is TPeriod {
  return v === 7 || v === 30 || v === 90
}

export function usePeriodFilter() {
  const [period, setPeriodState] = useState<TPeriod>(DEFAULT_PERIOD)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const parsed = stored ? Number(stored) : null
      if (isValidPeriod(parsed)) setPeriodState(parsed)
    } catch {
      // localStorage not available (SSR guard)
    }
  }, [])

  const setPeriod = useCallback((p: TPeriod) => {
    setPeriodState(p)
    try {
      localStorage.setItem(STORAGE_KEY, String(p))
    } catch {
      // ignore
    }
  }, [])

  return { period, setPeriod }
}
