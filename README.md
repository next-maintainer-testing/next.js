# Issue 74488 standalone binding reproduction

This minimal app builds Next.js with `output: 'standalone'`, matching the deployment mode in the issue. The report did not provide an application repository or exact package version, so this fallback uses Next.js 15.1.3 (the stable release current when the issue was filed) with React 19.0.0.

`node verify.mjs` builds the standalone output and emulates a hosting platform supplying a `HOSTNAME` value that is not an address of the container. It checks the runtime result rather than inspecting generated source. Exit code 0 means the standalone server cannot bind (`EADDRNOTAVAIL`), which leaves an upstream HTTP proxy without a backend and produces the reported 502 class of symptom. Exit code 1 means the server is reachable. Other exit codes indicate a failed check.
