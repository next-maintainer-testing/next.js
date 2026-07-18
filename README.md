# Next.js issue 68596 reproduction

This minimal runtime reproduction mounts `next/link` with `legacyBehavior` around a memoized custom anchor. It then updates only the Pages Router query state and records whether the memoized child renders again because Link supplied new event-handler props.

Run `npm install` and `node verify.mjs`. Exit code 0 means the unnecessary child re-render occurred; exit code 1 means it did not occur.
