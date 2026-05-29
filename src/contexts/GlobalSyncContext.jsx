import { createContext, useContext, useState, useCallback } from 'react'

const GlobalSyncContext = createContext(null)
const DEFAULT_PLAN = { targetNew: 20, targetReview: 30 }

function loadPlan() {
  try {
    return JSON.parse(localStorage.getItem('tutorTargets')) || DEFAULT_PLAN
  } catch {
    return DEFAULT_PLAN
  }
}

export function GlobalSyncProvider({ children }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [learningPlan, setLearningPlanState] = useState(loadPlan)

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshTrigger(p => p + 1)
  }, [])

  const setLearningPlan = useCallback((plan) => {
    setLearningPlanState(plan)
    localStorage.setItem('tutorTargets', JSON.stringify(plan))
  }, [])

  return (
    <GlobalSyncContext.Provider value={{ refreshTrigger, triggerGlobalRefresh, learningPlan, setLearningPlan }}>
      {children}
    </GlobalSyncContext.Provider>
  )
}

export function useGlobalSync() {
  const ctx = useContext(GlobalSyncContext)
  if (!ctx) throw new Error('useGlobalSync must be used within GlobalSyncProvider')
  return ctx
}
