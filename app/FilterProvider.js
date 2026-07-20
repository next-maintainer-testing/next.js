'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const FilterContext = createContext(null)

export function useFilter() {
  return useContext(FilterContext)
}

export default function FilterProvider({ children }) {
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    setInitialized(true)
  }, [])

  return (
    <FilterContext.Provider value={{ initialized }}>
      {children}
    </FilterContext.Provider>
  )
}
