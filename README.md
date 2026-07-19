# Next.js issue 51340 reproduction

This minimal app reproduces redundant evaluation of an App Router route module in development. The verifier warms `/my-route`, then makes three more GET requests and checks whether the route module's top-level marker is logged again. Exit code 0 means the reported redundant reload occurred; exit code 1 means it did not occur.
