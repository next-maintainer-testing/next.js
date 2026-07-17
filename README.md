# Parallel server actions reproduction

Clicking **Start** invokes two 800 ms Server Actions inside one client-side `Promise.all`. The page reports each action's server timestamps and total client latency. Serialized dispatch takes about 1.6 seconds with no overlap; parallel dispatch takes about 0.8 seconds with substantial overlap.

Run `node verify.mjs`. Exit 0 means the reported serialization is present, exit 1 means the actions overlap, and any other exit code means the timing check failed.
