'use client'

import React from 'react'
import { redirect } from 'next/navigation.js'

export function RedirectAsyncButton() {
  return React.createElement(
    'button',
    { onClick: async () => redirect('/target') },
    'Redirect Async'
  )
}
