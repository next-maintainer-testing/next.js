# Issue 77504 reproduction

This standalone app mirrors the issue's client component: a mount-only effect invokes a server action and displays its timestamp, while a button calls `router.refresh()`.

Run `node verify.mjs`. The check exits 0 when the displayed server-action timestamp remains unchanged after the refresh click (reported symptom), 1 when it updates, and 2 if the browser check cannot be completed.
