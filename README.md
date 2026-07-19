# Next.js frozen image config reproduction

This minimal Pages Router app server-renders `next/image` with frozen `deviceSizes` and `qualities` arrays. The verification builds and starts the production server, requests the SSR page, and detects the reported read-only-array `TypeError`.
