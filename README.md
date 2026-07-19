# Next.js issue 64698 reproduction

`/api/test` sets two `session` cookies with different domains. `node verify.mjs` inspects the raw HTTP response and reports the bug when the two cookies are not emitted as two separate `Set-Cookie` fields.
