# Next.js issue 75635 reproduction

This minimal App Router project imports the reporter's `llamaindex` dependency from a server route. The verifier runs a production build and detects the reported build-time overbundling by requiring the failure to name native `onnxruntime` binaries for at least four OS/architecture targets.
