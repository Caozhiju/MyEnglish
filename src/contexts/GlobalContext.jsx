import { createContext, useContext, useState, useCallback } from 'react'

const GlobalContext = createContext(null)
const DEFAULT_PLAN = { targetNew: 20, targetReview: 30 }

function loadPlan() {
  try {
    return JSON.parse(localStorage.getItem('tutorTargets')) || DEFAULT_PLAN
  } catch {
    return DEFAULT_PLAN
  }
}

export function GlobalProvider({ children }) {
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
    <GlobalContext.Provider value={{ refreshTrigger, triggerGlobalRefresh, learningPlan, setLearningPlan }}>
      {children}
    </GlobalContext.Provider>
  )
}

export function useGlobal() {
  const ctx = useContext(GlobalContext)
  if (!ctx) throw new Error('useGlobal must be used within GlobalProvider')
  return ctx
}
