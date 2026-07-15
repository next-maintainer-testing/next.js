# Turbopack missing-filesystem-event reproduction

This minimal app checks the watcher failure from vercel/next.js#90825 without requiring macOS and Podman. A shared writable `mmap` changes `app/page.js` on disk without emitting an inotify event, modeling a host edit propagated through Podman AppleHV/virtiofs without a guest filesystem notification.

Run `npm install`, then `node verify.mjs`. Exit 0 means Turbopack kept serving stale content after the source became visible on disk; exit 1 means it rebuilt; any other exit code means the check failed.
