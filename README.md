# Issue 86719 reproduction

This minimal custom-server reproduction preserves the reported module load order: `next` is loaded, then a helper-facing public API (`next/headers`) initializes Next.js shared async storage before the Node environment baseline. A shared server-work storage operation then throws the reported `AsyncLocalStorage accessed in runtime where it is not available` invariant.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means it was absent.
