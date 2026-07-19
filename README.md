# Next.js issue 44375 reproduction

This app exercises the default `font-display` behavior of the font API used by each installed Next.js version. The verifier delays the locally hosted Inter font past Chrome's short optional-font window and directly measures whether the rendered bold text changes from its serif fallback after the font response arrives. Exit code 0 means the reported no-swap/wrong-font rendering occurred; exit code 1 means the font swapped correctly.
