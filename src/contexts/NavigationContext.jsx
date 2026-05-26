import { createContext, useContext, useState, useCallback } from 'react'

const NavigationContext = createContext(null)

export function NavigationProvider({ children }) {
  const [page, setPage] = useState('Vocab')
  const [navigationParams, setNavigationParams] = useState({})

  const navigate = useCallback((targetPage, params = {}) => {
    setNavigationParams(params)
    setPage(targetPage)
  }, [])

  const clearParams = useCallback(() => {
    setNavigationParams({})
  }, [])

  return (
    <NavigationContext.Provider value={{ page, navigationParams, navigate, clearParams }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
