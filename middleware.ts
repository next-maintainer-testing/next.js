import type { MiddlewareConfig } from 'next/server'

// This is the documented shape accepted by `export const config` at runtime.
export const config: MiddlewareConfig = {
  matcher: [
    {
      source: '/dashboard/:path*',
    },
  ],
}
