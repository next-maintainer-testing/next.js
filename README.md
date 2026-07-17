# Issue 64265 reproduction

This minimal App Router app combines partial prerendering with a parallel intercepting route. The verification script invokes the production server in the same minimal mode used by the Vercel runtime and checks whether a prefetch data request corrupts route parameter `B` into `B.prefetch`.
