# Safari 12 development-bundle syntax reproduction

This minimal Pages Router app checks the JavaScript emitted by `next dev`. Safari 12 only accepts ECMAScript 2019 syntax; the verifier fetches every initial development script and parses each one at that syntax level. Exit code 0 means at least one browser-loaded script contains newer syntax and would raise a parse-time `SyntaxError`; exit code 1 means all initial scripts parse as ES2019.
