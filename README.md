# Next.js issue 69467 reproduction

This standalone app reconstructs the smallest crashing part of the `nextjs.org` client bundle archived on 2024-08-29: its client analytics effect instantiated `PerformanceObserver` without checking whether the API existed.

The archived bundle identifies Next.js `15.0.0-canary.131` and React `19.0.0-rc-eb3ad065-20240822`. `verify.mjs` starts the app in production mode, removes `PerformanceObserver` before any page JavaScript runs, and succeeds only after observing the reported client-side `ReferenceError`.
