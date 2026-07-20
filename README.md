# Next.js issue 69970 reproduction

This minimal App Router page preserves the reporter's Fluent UI `Popover`, `PopoverTrigger`, and `PopoverSurface` setup, including the reporter-era Fluent UI versions selected by the supplied StackBlitz lockfile. `node verify.mjs` launches the app in Chromium and clicks the trigger. It exits 0 only when the reported symptom occurs: the popover surface does not become visible.
