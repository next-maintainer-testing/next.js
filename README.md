# Next.js issue 82042 reproduction

This minimal Pages Router app defines the two routes from the report:

- `/send-money-to-[country]/[bank]`
- `/transactions/[id]`

`node verify.mjs` starts `next dev`, requests `/transactions/7089?type=IBP`, and exits 0 only if the send-money page incorrectly handles the request. It exits 1 when the transactions page handles it with the expected path and query values.
