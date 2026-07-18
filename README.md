# Next.js issue 80464 reproduction

This standalone app preserves the reporter's component structure: `Client1` is wrapped by an extra `div`, while `Client2` owns an incrementing state value. The persisted browser check enables React DevTools 6.1.2 highlight updates, clicks only Client2's button, and reports whether DevTools marks both client regions.

Run `npm install && node verify.mjs`. Exit 0 means the reported double-highlight symptom is present; exit 1 means it is absent.
