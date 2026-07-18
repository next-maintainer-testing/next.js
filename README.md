# Next.js issue 21210 reproduction

This minimal Pages Router app configures English on `example.com` and Polish on `example.pl`. The verifier starts Next.js and requests `/pl/about` with `Host: example.com`. Exit code 0 means the wrong-domain locale URL remains directly accessible with a 200 response; exit code 1 means it redirects or returns 404.
