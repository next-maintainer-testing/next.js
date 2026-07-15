# Next.js issue #72383 reproduction

This minimal App Router application reconstructs the reporter's setup with an existing internal page and `next/link`, using Next.js 15.0.2 and React 18.3.0.

Run `npm install` and `node verify.mjs`. The browser visits the target, returns home, and revisits the target with prefetch disabled so the check can distinguish the client router's visited-page cache from a new route download. Exit code 0 means the revisit requests the target again (the reported repeat-download symptom), exit code 1 means it is served from the visited cache, and any other code means the check failed. The observation separately reports whether this was an RSC fetch or a true document navigation and whether window state survived.
