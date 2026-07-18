# Next.js issue 81317 reproduction

This minimal App Router project renders `useSelectedLayoutSegments("header")` from a layout with a `@header` parallel route. The persisted check requests `/example5/bar` and exits successfully only when the rendered hook result begins with `"children"`, matching the issue's reported UI symptom.
