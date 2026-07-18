# Issue 50699 reproduction

Minimal reconstruction of the reporter's App Router layout: the root layout is a fragment, the locale layout owns `html` and `body`, and the global `app/not-found.js` renders a marker. In the reported production behavior, a missing locale URL initially contains the marker but becomes blank after browser hydration.

Run `node verify.mjs`. Exit 0 means the blank-after-hydration symptom is present; exit 1 means the marker remains visible; any other exit code means verification failed.
