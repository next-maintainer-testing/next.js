self.addEventListener('message', () => {
  let directAccess: string
  try {
    // This intentionally mirrors libraries that guard access with `typeof window`.
    const value = window
    directAccess = value === undefined ? 'undefined' : 'accessible'
  } catch (error) {
    directAccess = error instanceof Error ? error.name : 'threw'
  }

  self.postMessage({
    typeofWindow: typeof window,
    directAccess,
  })
})

export {}
