const previous = globalThis.__issue84198State
console.log(`ISSUE84198_MODULE_EVAL previous=${previous ? previous.requests : 'undefined'}`)
if (!previous) {
  globalThis.__issue84198State = { requests: 0 }
}

export function readState() {
  globalThis.__issue84198State.requests += 1
  console.log(`ISSUE84198_REQUESTS value=${globalThis.__issue84198State.requests}`)
  return globalThis.__issue84198State.requests
}
