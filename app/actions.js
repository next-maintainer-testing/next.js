'use server'

import { cookies } from 'next/headers'

export async function setNavigationCookie() {
  const store = await cookies()
  store.set('navigation-action', String(Date.now()))
}
