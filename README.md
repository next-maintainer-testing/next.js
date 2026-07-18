# Issue 72846 reproduction

Minimal npm-workspace reproduction of the reported Turbopack CSS Module ordering bug. The teaser's orange override should win, but with the bug the carousel package's blue base rule is emitted later.

Run `npm install`, then `node verify.mjs`. Exit 0 means the blue-button symptom is present; exit 1 means the expected orange rule wins.
