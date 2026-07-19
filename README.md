# next/font Open Sans rendering reproduction

This standalone app reproduces vercel/next.js issue #51540. It renders the same 16px, weight-400 Open Sans text using `next/font/google` and the hinted static Open Sans TTF from the font's upstream repository through `next/font/local`. Headless Chromium rasterizes both samples, and the checker compares the actual glyph pixels for excess edge variation, isolated dark pixels, and reduced antialiasing in the Google-loaded sample.

`node verify.mjs` exits 0 when the reported visual symptom is present, 1 when absent, and 2 if the browser or application check fails.
