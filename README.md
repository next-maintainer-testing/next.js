# Next.js issue 60328 reproduction

This app reproduces the reported module-state divergence. A Client Component imports a Server Action that mutates an in-memory array and calls `revalidatePath('/')`; the Server Component reads that array and renders its length. On the affected version, the action logs a successful `2 -> 3` mutation while the refreshed route still renders length `2`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the bug is present, 1 means it is absent, and any other code means verification failed.
