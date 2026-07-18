# Next.js issue 53858 reproduction

This Pages Router app uses route-scoped vanilla-extract styles. The verifier navigates from `/` to `/other` with `next/link`, observes the target's computed style, reloads that same URL, and compares the computed style again. Exit code 0 means the target style was missing after client navigation but present after a full load.
