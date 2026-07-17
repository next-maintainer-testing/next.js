'use client'

import { useEffect } from 'react'
import { setNavigationCookie } from './actions'

export default function CookieSetter() {
  useEffect(() => {
    if (sessionStorage.getItem('cookie-set')) return
    sessionStorage.setItem('cookie-set', '1')
    setNavigationCookie().then(() => {
      document.documentElement.dataset.cookieAction = 'complete'
    })
  }, [])
  return null
}
