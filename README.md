# Issue 46973 reproduction

Minimal Pages Router reproduction of the reported Emotion component-selector runtime error. The app intentionally mirrors the report and does not enable `compiler.emotion` in `next.config.js`.

Run `node verify.mjs`. Exit 0 means the reported error was observed; exit 1 means the page rendered without it.
