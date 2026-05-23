import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useStorage } from './useStorage'
import { fetchUserProgress, upsertUserProgress } from '../services/supabaseDataService'

const DEBOUNCE_MS = 800

export function useSyncStorage(key, initialValue, tableColumn) {
  const { user } = useAuth()
  const [state, setState] = useStorage(key, initialValue)
  const timerRef = useRef(null)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (!user) {
      hydratedRef.current = false
      return
    }
    fetchUserProgress(user.id)
      .then((data) => {
        const val = data?.[tableColumn]
        if (val !== null && val !== undefined) {
          setState(val)
        }
      })
      .catch(() => {})
      .finally(() => {
        hydratedRef.current = true
      })
  }, [user?.id])

  const setter = useCallback(
    (next) => {
      setState(next)
    },
    [setState]
  )

  useEffect(() => {
    if (!user || !hydratedRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      upsertUserProgress(user.id, { [tableColumn]: state }).catch(() => {})
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state, user?.id])

  return [state, setter]
}
