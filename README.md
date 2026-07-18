# Next.js issue 53112 reproduction

This minimal App Router app defines `app/[[lang]]/page.js`. The verifier starts Next.js and checks that the optional segment serves both `/` and `/fr`; on affected versions it directly observes the reported unsupported optional-parameter error.
