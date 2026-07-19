# Next.js issue 78346 reproduction

Minimal reconstruction of the reporter's app. Tailwind scans `bug.txt`, turns `bg-[url(...)]` into CSS, and the Next.js webpack build attempts to resolve `./...`.

Source issue: https://github.com/vercel/next.js/issues/78346
Reporter reproduction: https://github.com/vicnaum/webpack-bug-repro
