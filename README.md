# Reproduction for vercel/next.js #78118

This app uses `Nanum_Gothic_Coding({ weight: '700' })` from `next/font/google`. The verifier builds the app, locates Next.js's generated Latin font subset, and uses FreeType's hinted rasterizer to render the same glyphs from that output and from Google's original bold TTF at several small sizes. It reports the bug when the resulting glyph bitmaps differ substantially.

Run `npm install` and then `node verify.mjs`. Exit 0 means the rendered mismatch is present; exit 1 means it is absent; any other exit means the check failed.
